/**
 * Admin-organization platform service (ADR-023 §Capability resolution,
 * §Owner-count invariant; admin-app implementation plan §9 item 1).
 *
 * Composes the `AdminOrganizationRepository` (typed Postgres
 * persistence) with the `AuditLogModule` (typed governance audit
 * surface) to expose the canonical first-party admin-org workflow:
 * seed the initial owner, list members, invite, redeem, change role,
 * remove member, and resolve the capability join for a subject.
 *
 * Cross-cutting invariants enforced here (NOT in the repository):
 *   - `AdminOwnerCountInvariant` — refuse role-change and remove
 *     that would drop active `admin-owner` membership below one.
 *   - `AdminInvitationExpired` — expiry is asserted at the service
 *     boundary so the typed channel is meaningful even when the
 *     repository is bypassed in tests.
 *   - Every mutation appends an `AuditEvent` with a typed
 *     `reasonCatalogId.*` reason and an `adminOrganizationAuditAction.*`
 *     action; audit emission is non-optional and shares the same
 *     typed error channel as the mutation itself.
 *
 * Runtime config:
 *   The invitation TTL is read from the operator environment as
 *   `ADMIN_ORGANIZATION_INVITATION_TTL_MINUTES` and bound into the
 *   Live layer via `makeAdminOrganizationServiceLayer({
 *   invitationTtlMinutes })`. There is no in-service fallback — the
 *   bootstrap is responsible for supplying a value, matching the
 *   manifest-declared `adminOrganizationConfigKey.invitationTtlMinutes`.
 */
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  adminMemberRole,
  AdminMemberRoleSchema,
  AdminInvitationNotificationPayloadSchema,
  adminOrganizationAuditAction,
  novuWorkflowId,
  platformModuleId,
  reasonCatalogId,
  RequestContextSchema,
  ResolvedAdminCapabilitiesSchema,
  type AdminInvitationNotificationPayload,
  type AdminMember,
  type AdminMemberInvitation,
  type AdminMemberRole,
  type NovuWorkflowId,
  type RequestContext,
  type ResolvedAdminCapabilities,
} from "@comvestec/contracts";
import {
  type AdminOrganizationRepositoryError,
  AdminOrganizationRepository,
  type AdminOrganizationRepositoryService,
  adminMemberInvitationStatus,
  adminMemberStatus,
  joinAdminRoleWithPlatformCapabilities,
  makeAdminOrganizationRepositoryLayer,
  PlatformActorCapabilitySnapshotSchema,
  type PlatformActorCapabilitySnapshot,
} from "@comvestec/modules";
import {
  AuditLogModule,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
  AuditLogPostgresRepository,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
} from "@comvestec/modules";
import {
  makeNovuAdapter,
  makePostgresAdapter,
  type NovuAdapterError,
  type NovuAdapterService,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { auditLogEventsTable } from "@comvestec/modules";
import { and, desc, eq } from "drizzle-orm";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class AdminMemberNotFound {
  readonly _tag = "AdminMemberNotFound" as const;
  constructor(
    readonly args: { readonly memberKey: string; readonly lookup: string },
  ) {}
}

export class AdminInvitationNotFound {
  readonly _tag = "AdminInvitationNotFound" as const;
  constructor(readonly args: { readonly tokenHashOrId: string }) {}
}

export class AdminInvitationExpired {
  readonly _tag = "AdminInvitationExpired" as const;
  constructor(
    readonly args: {
      readonly invitationId: string;
      readonly expiresAt: string;
      readonly now: string;
    },
  ) {}
}

export class AdminInvitationAlreadyRedeemed {
  readonly _tag = "AdminInvitationAlreadyRedeemed" as const;
  constructor(
    readonly args: {
      readonly invitationId: string;
      readonly status: string;
    },
  ) {}
}

export class AdminMemberAlreadyExists {
  readonly _tag = "AdminMemberAlreadyExists" as const;
  constructor(
    readonly args: {
      readonly field: "email" | "keycloakSubjectId";
      readonly value: string;
    },
  ) {}
}

export class AdminBootstrapOwnerConflict {
  readonly _tag = "AdminBootstrapOwnerConflict" as const;
  constructor(
    readonly args: {
      readonly email: string;
      readonly keycloakSubjectId: string;
      readonly emailMemberId: string;
      readonly keycloakSubjectMemberId: string;
    },
  ) {}
}

export class AdminInitialOwnerAlreadySeeded {
  readonly _tag = "AdminInitialOwnerAlreadySeeded" as const;
  constructor(readonly args: { readonly memberCount: number }) {}
}

export class AdminRoleChangeNotPermitted {
  readonly _tag = "AdminRoleChangeNotPermitted" as const;
  constructor(
    readonly args: { readonly memberId: string; readonly reason: string },
  ) {}
}

export class AdminOwnerCountInvariant {
  readonly _tag = "AdminOwnerCountInvariant" as const;
  constructor(
    readonly args: {
      readonly memberId: string;
      readonly currentOwnerCount: number;
      readonly attemptedOperation: "changeMemberRole" | "removeMember";
    },
  ) {}
}

export class AdminInvitationNotificationDispatchError {
  readonly _tag = "AdminInvitationNotificationDispatchError" as const;
  constructor(
    readonly args: {
      readonly invitationId: string;
      readonly cause: unknown;
    },
  ) {}
}

export type AdminOrganizationServiceError =
  | ParseResult.ParseError
  | AdminOrganizationRepositoryError
  | AuditLogModuleError
  | AdminMemberNotFound
  | AdminInvitationNotFound
  | AdminInvitationExpired
  | AdminInvitationAlreadyRedeemed
  | AdminMemberAlreadyExists
  | AdminBootstrapOwnerConflict
  | AdminInitialOwnerAlreadySeeded
  | AdminRoleChangeNotPermitted
  | AdminOwnerCountInvariant
  | AdminInvitationNotificationDispatchError;

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const ListMembersInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  filter: Schema.optional(
    Schema.Struct({
      role: Schema.optional(AdminMemberRoleSchema),
      includeArchived: Schema.optional(Schema.Boolean),
    }),
  ),
});

export type ListMembersInput = Schema.Schema.Type<
  typeof ListMembersInputSchema
>;

export const InviteMemberInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  email: Schema.NonEmptyString,
  invitedRole: AdminMemberRoleSchema,
  invitedBy: Schema.NonEmptyString,
  invitedByDisplayName: Schema.optional(Schema.NonEmptyString),
});

export type InviteMemberInput = Schema.Schema.Type<
  typeof InviteMemberInputSchema
>;

export type InviteMemberResult = {
  readonly invitation: AdminMemberInvitation;
  /**
   * Plaintext invitation token returned ONCE on issue. Never
   * persisted server-side. Caller is responsible for delivering it
   * to the recipient (e.g. via the Novu workflow wired up in
   * slice 1c-platform commit 2).
   */
  readonly invitationToken: string;
};

export const SeedInitialOwnerInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  keycloakSubjectId: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
});

export type SeedInitialOwnerInput = Schema.Schema.Type<
  typeof SeedInitialOwnerInputSchema
>;

export const RedeemInvitationInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  invitationToken: Schema.NonEmptyString,
  keycloakSubjectId: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
});

export type RedeemInvitationInput = Schema.Schema.Type<
  typeof RedeemInvitationInputSchema
>;

export const ChangeMemberRoleInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  memberId: Schema.NonEmptyString,
  newRole: AdminMemberRoleSchema,
});

export type ChangeMemberRoleInput = Schema.Schema.Type<
  typeof ChangeMemberRoleInputSchema
>;

export const RemoveMemberInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  memberId: Schema.NonEmptyString,
});

export type RemoveMemberInput = Schema.Schema.Type<
  typeof RemoveMemberInputSchema
>;

// `Schema.suspend` defers the field reference to decode time, breaking the
// barrel-level evaluation cycle between `@comvestec/modules` (which
// re-exports admin-organization contracts) and `@comvestec/platform`
// (which is imported by other module-side files such as
// `identity-session.ts`). Without the suspend, the cycle leaves
// `PlatformActorCapabilitySnapshotSchema` undefined at this module's
// top-level evaluation, which surfaces as a `Schema.Struct` AST crash
// the first time any test loads `@comvestec/platform` and reaches this
// file. The decoded shape is unchanged.
export const ResolveCapabilitiesInputSchema = Schema.Struct({
  subjectId: Schema.NonEmptyString,
  snapshot: Schema.suspend(() => PlatformActorCapabilitySnapshotSchema),
});

export type ResolveCapabilitiesInput = Schema.Schema.Type<
  typeof ResolveCapabilitiesInputSchema
>;

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export type AdminOrganizationServiceImpl = {
  readonly seedInitialOwner: (
    input: SeedInitialOwnerInput,
  ) => Effect.Effect<AdminMember, AdminOrganizationServiceError>;
  readonly listMembers: (
    input: ListMembersInput,
  ) => Effect.Effect<readonly AdminMember[], AdminOrganizationServiceError>;
  readonly inviteMember: (
    input: InviteMemberInput,
  ) => Effect.Effect<InviteMemberResult, AdminOrganizationServiceError>;
  readonly redeemInvitation: (
    input: RedeemInvitationInput,
  ) => Effect.Effect<AdminMember, AdminOrganizationServiceError>;
  readonly changeMemberRole: (
    input: ChangeMemberRoleInput,
  ) => Effect.Effect<AdminMember, AdminOrganizationServiceError>;
  readonly removeMember: (
    input: RemoveMemberInput,
  ) => Effect.Effect<void, AdminOrganizationServiceError>;
  readonly resolveCapabilitiesFor: (
    input: ResolveCapabilitiesInput,
  ) => Effect.Effect<ResolvedAdminCapabilities, AdminOrganizationServiceError>;
};

export class AdminOrganizationService extends Context.Tag(
  "AdminOrganizationService",
)<AdminOrganizationService, AdminOrganizationServiceImpl>() {}

// ---------------------------------------------------------------------------
// Notification gateway (Novu adapter wrapper)
// ---------------------------------------------------------------------------

/**
 * Domain-shaped wrapper around the platform Novu adapter that
 * dispatches admin-organization invitations through the typed
 * workflow id (`novuWorkflowId.adminOrganizationInvitation`).
 * Kept inside the service file rather than promoted to a new
 * platform adapter sibling because there is only one consumer
 * today; future admin-org notifications belong on the same Tag.
 */
export type AdminOrganizationNotificationGatewayService = {
  readonly dispatchInvitation: (input: {
    readonly invitation: AdminMemberInvitation;
    readonly invitedByDisplayName: string;
    readonly invitationToken: string;
  }) => Effect.Effect<void, AdminInvitationNotificationDispatchError>;
};

export class AdminOrganizationNotificationGateway extends Context.Tag(
  "AdminOrganizationNotificationGateway",
)<
  AdminOrganizationNotificationGateway,
  AdminOrganizationNotificationGatewayService
>() {}

export type AdminOrganizationNotificationGatewayOptions = {
  readonly workflowId: NovuWorkflowId;
  readonly adminAppBaseUrl: string;
};

const buildAdminInvitationAcceptUrl = (input: {
  readonly adminAppBaseUrl: string;
  readonly invitationToken: string;
}) => {
  const url = new URL(
    "/auth/admin-organization/invitations/accept",
    input.adminAppBaseUrl,
  );
  url.searchParams.set("token", input.invitationToken);
  return url.toString();
};

const decodeAdminInvitationNotificationPayload = Schema.decodeUnknown(
  AdminInvitationNotificationPayloadSchema,
);

export const makeAdminOrganizationNotificationGateway = (
  novu: NovuAdapterService,
  options: AdminOrganizationNotificationGatewayOptions,
): AdminOrganizationNotificationGatewayService => ({
  dispatchInvitation: (input) =>
    decodeAdminInvitationNotificationPayload({
      invitationId: input.invitation.invitationId,
      recipientEmail: input.invitation.email,
      invitedRole: input.invitation.invitedRole,
      invitedByDisplayName: input.invitedByDisplayName,
      acceptUrl: buildAdminInvitationAcceptUrl({
        adminAppBaseUrl: options.adminAppBaseUrl,
        invitationToken: input.invitationToken,
      }),
      expiresAt: input.invitation.expiresAt,
    } satisfies AdminInvitationNotificationPayload).pipe(
      Effect.flatMap((payload) =>
        novu.triggerNotification({
          channel: "email",
          recipient: payload.recipientEmail,
          template: options.workflowId,
          subject: `You're invited to join the Comvestec admin organization`,
        }),
      ),
      Effect.asVoid,
      Effect.mapError(
        (cause) =>
          new AdminInvitationNotificationDispatchError({
            invitationId: input.invitation.invitationId,
            cause,
          }),
      ),
    ),
});

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type AdminOrganizationServiceOptions = {
  /**
   * Invitation TTL in minutes. Sourced from the operator
   * environment (`ADMIN_ORGANIZATION_INVITATION_TTL_MINUTES`) and
   * mirrored by the manifest config key
   * `adminOrganizationConfigKey.invitationTtlMinutes`. Must be a
   * positive integer; no in-service fallback is applied.
   */
  readonly invitationTtlMinutes: number;
};

// ---------------------------------------------------------------------------
// Crypto helpers (mirrors the tenant-invitation pattern; no new crypto)
// ---------------------------------------------------------------------------

const encodeBytesAsHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const createAdminInvitationToken = () =>
  `amiv_${encodeBytesAsHex(crypto.getRandomValues(new Uint8Array(32)))}`;

const hashAdminInvitationToken = (token: string) =>
  Effect.tryPromise({
    try: async () => {
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
      );

      return encodeBytesAsHex(digest);
    },
    catch: (cause) => cause,
  }).pipe(Effect.orDie);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const decodeListMembersInput = Schema.decodeUnknown(ListMembersInputSchema);
const decodeInviteMemberInput = Schema.decodeUnknown(InviteMemberInputSchema);
const decodeSeedInitialOwnerInput = Schema.decodeUnknown(
  SeedInitialOwnerInputSchema,
);
const decodeRedeemInvitationInput = Schema.decodeUnknown(
  RedeemInvitationInputSchema,
);
const decodeChangeMemberRoleInput = Schema.decodeUnknown(
  ChangeMemberRoleInputSchema,
);
const decodeRemoveMemberInput = Schema.decodeUnknown(RemoveMemberInputSchema);
const decodeResolveCapabilitiesInput = Schema.decodeUnknown(
  ResolveCapabilitiesInputSchema,
);
const decodeResolvedAdminCapabilities = Schema.decodeUnknown(
  ResolvedAdminCapabilitiesSchema,
);

const appendAuditEvent = (
  auditLog: AuditLogModuleService,
  input: {
    readonly requestContext: RequestContext;
    readonly action: (typeof adminOrganizationAuditAction)[keyof typeof adminOrganizationAuditAction];
    readonly target: string;
    readonly reason: (typeof reasonCatalogId)[keyof typeof reasonCatalogId];
  },
) =>
  auditLog.append({
    requestContext: input.requestContext,
    moduleId: platformModuleId.adminOrganization,
    action: input.action,
    target: input.target,
    reason: input.reason,
  });

const requireOwnerCountInvariant = (
  repository: AdminOrganizationRepositoryService,
  args: {
    readonly memberId: string;
    readonly attemptedOperation: "changeMemberRole" | "removeMember";
  },
) =>
  repository.countMembersByRole(adminMemberRole.adminOwner).pipe(
    Effect.flatMap((currentOwnerCount) =>
      currentOwnerCount > 1
        ? Effect.succeed(currentOwnerCount)
        : Effect.fail(
            new AdminOwnerCountInvariant({
              memberId: args.memberId,
              currentOwnerCount,
              attemptedOperation: args.attemptedOperation,
            }),
          ),
    ),
  );

export const makeAdminOrganizationService = (
  repository: AdminOrganizationRepositoryService,
  auditLog: AuditLogModuleService,
  notificationGateway: AdminOrganizationNotificationGatewayService,
  options: AdminOrganizationServiceOptions,
): AdminOrganizationServiceImpl => {
  const seedInitialOwner: AdminOrganizationServiceImpl["seedInitialOwner"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeSeedInitialOwnerInput(input);
      const members = yield* repository.listMembers({ includeArchived: true });
      const existingBySubject =
        yield* repository.getMembershipByKeycloakSubjectId(
          decoded.keycloakSubjectId,
        );
      const existingByEmail = yield* repository.getMembershipByEmail(
        decoded.email,
      );

      if (
        Option.isSome(existingBySubject) &&
        Option.isSome(existingByEmail) &&
        existingBySubject.value.id !== existingByEmail.value.id
      ) {
        return yield* Effect.fail(
          new AdminBootstrapOwnerConflict({
            email: decoded.email,
            keycloakSubjectId: decoded.keycloakSubjectId,
            emailMemberId: existingByEmail.value.id,
            keycloakSubjectMemberId: existingBySubject.value.id,
          }),
        );
      }

      const existingMember = Option.isSome(existingBySubject)
        ? existingBySubject.value
        : Option.isSome(existingByEmail)
          ? existingByEmail.value
          : undefined;

      if (existingMember === undefined && members.length > 0) {
        return yield* Effect.fail(
          new AdminInitialOwnerAlreadySeeded({
            memberCount: members.length,
          }),
        );
      }

      const member = yield* repository.ensureBootstrapOwner({
        ...(existingMember === undefined
          ? {}
          : { memberId: existingMember.id }),
        keycloakSubjectId: decoded.keycloakSubjectId,
        email: decoded.email,
        displayName: decoded.displayName,
        createdBy: decoded.requestContext.actorId ?? decoded.keycloakSubjectId,
      });
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminOrganizationAuditAction.ownerSeeded,
        target: member.id,
        reason: reasonCatalogId.adminOrganizationBootstrapOwner,
      });
      return member;
    });

  const listMembers: AdminOrganizationServiceImpl["listMembers"] = (input) =>
    decodeListMembersInput(input).pipe(
      Effect.flatMap((decoded) =>
        repository.listMembers(
          decoded.filter === undefined
            ? undefined
            : {
                ...(decoded.filter.role === undefined
                  ? {}
                  : { role: decoded.filter.role }),
                ...(decoded.filter.includeArchived === undefined
                  ? {}
                  : { includeArchived: decoded.filter.includeArchived }),
              },
        ),
      ),
    );

  const inviteMember: AdminOrganizationServiceImpl["inviteMember"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeInviteMemberInput(input);
      const existing = yield* repository.getMembershipByEmail(decoded.email);
      if (Option.isSome(existing)) {
        return yield* Effect.fail(
          new AdminMemberAlreadyExists({
            field: "email",
            value: decoded.email,
          }),
        );
      }
      const invitationToken = createAdminInvitationToken();
      const tokenHash = yield* hashAdminInvitationToken(invitationToken);
      const issuedAt = new Date();
      const expiresAt = new Date(
        issuedAt.getTime() + options.invitationTtlMinutes * 60_000,
      );
      const invitation = yield* repository.inviteMember({
        email: decoded.email,
        invitedRole: decoded.invitedRole,
        invitedBy: decoded.invitedBy,
        tokenHash,
        expiresAt: expiresAt.toISOString(),
        ...(decoded.requestContext.correlationId === undefined
          ? {}
          : { correlationId: decoded.requestContext.correlationId }),
      });
      yield* notificationGateway.dispatchInvitation({
        invitation,
        invitedByDisplayName: decoded.invitedByDisplayName ?? decoded.invitedBy,
        invitationToken,
      });
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminOrganizationAuditAction.memberInvited,
        target: invitation.invitationId,
        reason: reasonCatalogId.adminOrganizationInviteMember,
      });
      return { invitation, invitationToken } satisfies InviteMemberResult;
    });

  const redeemInvitation: AdminOrganizationServiceImpl["redeemInvitation"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeRedeemInvitationInput(input);
      const tokenHash = yield* hashAdminInvitationToken(
        decoded.invitationToken,
      );
      const invitationOpt =
        yield* repository.getInvitationByTokenHash(tokenHash);
      if (Option.isNone(invitationOpt)) {
        return yield* Effect.fail(
          new AdminInvitationNotFound({ tokenHashOrId: tokenHash }),
        );
      }
      const invitation = invitationOpt.value;
      if (invitation.status !== adminMemberInvitationStatus.pending) {
        return yield* Effect.fail(
          new AdminInvitationAlreadyRedeemed({
            invitationId: invitation.invitationId,
            status: invitation.status,
          }),
        );
      }
      const now = new Date();
      if (new Date(invitation.expiresAt).getTime() <= now.getTime()) {
        return yield* Effect.fail(
          new AdminInvitationExpired({
            invitationId: invitation.invitationId,
            expiresAt: invitation.expiresAt,
            now: now.toISOString(),
          }),
        );
      }
      const existingBySubject =
        yield* repository.getMembershipByKeycloakSubjectId(
          decoded.keycloakSubjectId,
        );
      if (Option.isSome(existingBySubject)) {
        return yield* Effect.fail(
          new AdminMemberAlreadyExists({
            field: "keycloakSubjectId",
            value: decoded.keycloakSubjectId,
          }),
        );
      }
      const existingByEmail = yield* repository.getMembershipByEmail(
        invitation.email,
      );
      if (Option.isSome(existingByEmail)) {
        return yield* Effect.fail(
          new AdminMemberAlreadyExists({
            field: "email",
            value: invitation.email,
          }),
        );
      }
      const member = yield* repository.redeemInvitation({
        invitationId: invitation.invitationId,
        keycloakSubjectId: decoded.keycloakSubjectId,
        displayName: decoded.displayName,
      });
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminOrganizationAuditAction.invitationRedeemed,
        target: member.id,
        reason: reasonCatalogId.adminOrganizationRedeemInvitation,
      });
      return member;
    });

  const changeMemberRole: AdminOrganizationServiceImpl["changeMemberRole"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeChangeMemberRoleInput(input);
      const memberOpt = yield* repository.getMember(decoded.memberId);
      if (Option.isNone(memberOpt)) {
        return yield* Effect.fail(
          new AdminMemberNotFound({
            memberKey: decoded.memberId,
            lookup: "id",
          }),
        );
      }
      const member = memberOpt.value;
      if (member.status === adminMemberStatus.archived) {
        return yield* Effect.fail(
          new AdminRoleChangeNotPermitted({
            memberId: member.id,
            reason: "Cannot change role of an archived member.",
          }),
        );
      }
      if (member.role === decoded.newRole) {
        return member;
      }
      if (
        member.role === adminMemberRole.adminOwner &&
        decoded.newRole !== adminMemberRole.adminOwner
      ) {
        yield* requireOwnerCountInvariant(repository, {
          memberId: member.id,
          attemptedOperation: "changeMemberRole",
        });
      }
      const updated = yield* repository.changeMemberRole({
        memberId: decoded.memberId,
        newRole: decoded.newRole,
      });
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminOrganizationAuditAction.memberRoleChanged,
        target: updated.id,
        reason: reasonCatalogId.adminOrganizationChangeRole,
      });
      return updated;
    });

  const removeMember: AdminOrganizationServiceImpl["removeMember"] = (input) =>
    Effect.gen(function* () {
      const decoded = yield* decodeRemoveMemberInput(input);
      const memberOpt = yield* repository.getMember(decoded.memberId);
      if (Option.isNone(memberOpt)) {
        return yield* Effect.fail(
          new AdminMemberNotFound({
            memberKey: decoded.memberId,
            lookup: "id",
          }),
        );
      }
      const member = memberOpt.value;
      if (member.role === adminMemberRole.adminOwner) {
        yield* requireOwnerCountInvariant(repository, {
          memberId: member.id,
          attemptedOperation: "removeMember",
        });
      }
      yield* repository.removeMember({ memberId: decoded.memberId });
      yield* appendAuditEvent(auditLog, {
        requestContext: decoded.requestContext,
        action: adminOrganizationAuditAction.memberRemoved,
        target: member.id,
        reason: reasonCatalogId.adminOrganizationRemoveMember,
      });
      return undefined;
    });

  const resolveCapabilitiesFor: AdminOrganizationServiceImpl["resolveCapabilitiesFor"] =
    (input) =>
      Effect.gen(function* () {
        const decoded = yield* decodeResolveCapabilitiesInput(input);
        const memberOpt = yield* repository.getMembershipByKeycloakSubjectId(
          decoded.subjectId,
        );
        if (Option.isNone(memberOpt)) {
          return yield* Effect.fail(
            new AdminMemberNotFound({
              memberKey: decoded.subjectId,
              lookup: "keycloakSubjectId",
            }),
          );
        }
        const role: AdminMemberRole = memberOpt.value.role;
        const snapshot: PlatformActorCapabilitySnapshot = decoded.snapshot;
        const joined = joinAdminRoleWithPlatformCapabilities(role, snapshot);
        return yield* decodeResolvedAdminCapabilities(joined);
      });

  return {
    seedInitialOwner,
    listMembers,
    inviteMember,
    redeemInvitation,
    changeMemberRole,
    removeMember,
    resolveCapabilitiesFor,
  };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const makeAdminOrganizationServiceLayer = (
  options: AdminOrganizationServiceOptions,
) =>
  Layer.effect(
    AdminOrganizationService,
    Effect.gen(function* () {
      const repository = yield* AdminOrganizationRepository;
      const auditLog = yield* AuditLogModule;
      const notificationGateway = yield* AdminOrganizationNotificationGateway;
      return makeAdminOrganizationService(
        repository,
        auditLog,
        notificationGateway,
        options,
      );
    }),
  );

// ---------------------------------------------------------------------------
// Env-bound runtime loader (mirrors `runAdminOperatorManagementFromEnvironment`
// in `admin-operator-management.ts`). Decodes the required operator
// environment values via `Schema.decodeUnknown` — no synthesized
// defaults — and provisions Postgres + Valkey + Novu adapters plus the
// repository, audit-log module, and notification gateway needed to run
// the service. The `use` callback additionally receives a
// `resolveRequestContext(sessionId)` helper so backend-owned HTTP
// transports can build the trusted `RequestContext` via Valkey-backed
// identity-session resolution without exposing the raw adapter.
// ---------------------------------------------------------------------------

const AdminOrganizationProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  VALKEY_URL: Schema.NonEmptyString,
  ADMIN_APP_BASE_URL: Schema.NonEmptyString,
  ADMIN_ORGANIZATION_INVITATION_TTL_MINUTES: Schema.NonEmptyString,
  NOVU_API_URL: Schema.NonEmptyString,
  NOVU_API_KEY: Schema.NonEmptyString,
  NOVU_WORKFLOW_ID_ADMIN_ORGANIZATION_INVITATION: Schema.Literal(
    novuWorkflowId.adminOrganizationInvitation,
  ),
});

const decodeAdminOrganizationProcessEnvironment = Schema.decodeUnknown(
  AdminOrganizationProcessEnvironmentSchema,
);

const InvitationTtlMinutesSchema = Schema.compose(
  Schema.NumberFromString,
  Schema.Int.pipe(Schema.greaterThan(0)),
);

const decodeInvitationTtlMinutes = Schema.decodeUnknown(
  InvitationTtlMinutesSchema,
);

export type AdminOrganizationRuntimeOptions = {
  readonly postgresUrl: string;
  readonly valkeyUrl: string;
  readonly adminAppBaseUrl: string;
  readonly invitationTtlMinutes: number;
  readonly novuApiUrl: string;
  readonly novuApiKey: string;
  readonly invitationWorkflowId: NovuWorkflowId;
};

const resolveAdminOrganizationRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeAdminOrganizationProcessEnvironment(environment).pipe(
    Effect.flatMap((resolved) =>
      decodeInvitationTtlMinutes(
        resolved.ADMIN_ORGANIZATION_INVITATION_TTL_MINUTES,
      ).pipe(
        Effect.map(
          (invitationTtlMinutes): AdminOrganizationRuntimeOptions => ({
            postgresUrl: resolved.POSTGRES_URL,
            valkeyUrl: resolved.VALKEY_URL,
            adminAppBaseUrl: resolved.ADMIN_APP_BASE_URL,
            invitationTtlMinutes,
            novuApiUrl: resolved.NOVU_API_URL,
            novuApiKey: resolved.NOVU_API_KEY,
            invitationWorkflowId:
              resolved.NOVU_WORKFLOW_ID_ADMIN_ORGANIZATION_INVITATION,
          }),
        ),
      ),
    ),
  );

const makeAdminOrganizationRuntime = (
  options: AdminOrganizationRuntimeOptions,
) =>
  Effect.gen(function* () {
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.moduleId, input.moduleId),
              eq(auditLogEventsTable.target, input.target),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByActor: (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.tenantScope, input.tenantScope),
              eq(auditLogEventsTable.tenantScopeId, input.tenantScopeId),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);
    const novu = yield* makeNovuAdapter({
      apiUrl: options.novuApiUrl,
      apiKey: options.novuApiKey,
    });
    const notificationGateway = makeAdminOrganizationNotificationGateway(novu, {
      workflowId: options.invitationWorkflowId,
      adminAppBaseUrl: options.adminAppBaseUrl,
    });
    const baseLayer = Layer.mergeAll(
      makeAdminOrganizationRepositoryLayer(writeDatabase),
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      Layer.succeed(AdminOrganizationNotificationGateway, notificationGateway),
    );
    const serviceLayer = makeAdminOrganizationServiceLayer({
      invitationTtlMinutes: options.invitationTtlMinutes,
    }).pipe(Layer.provide(baseLayer));

    return {
      serviceLayer,
      close: Effect.ignore(postgres.close),
    };
  });

export type AdminOrganizationRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError
  | NovuAdapterError;

export const runAdminOrganizationFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: AdminOrganizationServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | AdminOrganizationRuntimeError> =>
  resolveAdminOrganizationRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeAdminOrganizationRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(AdminOrganizationService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  );

// ---------------------------------------------------------------------------
// Re-exports for downstream platform composition (slice 1c-platform
// commit 2 introduces the env-bound runtime loader + Novu wiring;
// keeping these here keeps that follow-up local to apps/communication
// rather than re-exporting modules-package types through it.)
// ---------------------------------------------------------------------------

export { adminMemberInvitationStatus, adminMemberStatus };
