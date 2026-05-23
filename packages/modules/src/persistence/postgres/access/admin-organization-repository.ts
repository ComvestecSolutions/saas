/**
 * Admin-organization Postgres repository.
 *
 * Persists `admin_members` and `admin_member_invitations` and
 * surfaces them as boundary-decoded `AdminMember` /
 * `AdminMemberInvitation` contract values from
 * `@comvestec/contracts`.
 *
 * ADR-023 tenant-isolation invariant: admin-org is the single
 * logical SaaS-operator org and is **not** a tenant. Rows in these
 * tables carry no `tenant_scope` columns and no method here joins
 * any tenant table. Owner-count and other cross-row invariants are
 * caller responsibilities (see `countMembersByRole`) — the
 * repository only enforces row-level uniqueness, persistence, and
 * the read boundary.
 *
 * The repository does not run inside a Postgres transaction for
 * `redeemInvitation`: the platform service (slice 1c-platform)
 * owns the higher-level workflow and may wrap repository calls in
 * a unit-of-work as needed. Pre-checks in this layer keep races to
 * the narrow window between the lookup and the insert; any
 * concurrent duplicate is surfaced through the typed
 * `AdminOrgUniqueViolationError` channel.
 */
import { and, eq, isNull } from "drizzle-orm";
import { Context, Effect, Layer, Option, ParseResult, Schema } from "effect";
import {
  AdminMemberInvitationSchema,
  AdminMemberRoleSchema,
  AdminMemberSchema,
  AdminMemberStatusSchema,
  adminMemberInvitationStatus,
  adminMemberRole,
  adminMemberStatus,
  type AdminMember,
  type AdminMemberInvitation,
  type AdminMemberRole,
} from "@comvestec/contracts";
import type { PostgresDatabase } from "../database";
import {
  adminMemberInvitationsTable,
  adminMembersTable,
} from "./admin-organization";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export class AdminOrgPersistenceError {
  readonly _tag = "AdminOrgPersistenceError" as const;
  constructor(
    readonly args: {
      readonly operation:
        | "inviteMember"
        | "redeemInvitation"
        | "ensureBootstrapOwner"
        | "changeMemberRole"
        | "removeMember";
      readonly cause: unknown;
    },
  ) {}
}

export class AdminOrgQueryError {
  readonly _tag = "AdminOrgQueryError" as const;
  constructor(
    readonly args: {
      readonly operation:
        | "listMembers"
        | "getMember"
        | "getMembershipByEmail"
        | "getMembershipByKeycloakSubjectId"
        | "getInvitationByTokenHash"
        | "countMembersByRole";
      readonly cause: unknown;
    },
  ) {}
}

export class AdminOrgNotFoundError {
  readonly _tag = "AdminOrgNotFoundError" as const;
  constructor(
    readonly args: {
      readonly entity: "adminMember" | "adminMemberInvitation";
      readonly key: string;
    },
  ) {}
}

export class AdminOrgUniqueViolationError {
  readonly _tag = "AdminOrgUniqueViolationError" as const;
  constructor(
    readonly args: {
      readonly field: "email" | "keycloakSubjectId" | "tokenHash";
      readonly value: string;
    },
  ) {}
}

export type AdminOrganizationRepositoryError =
  | ParseResult.ParseError
  | AdminOrgPersistenceError
  | AdminOrgQueryError
  | AdminOrgNotFoundError
  | AdminOrgUniqueViolationError;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const ListMembersFilterSchema = Schema.Struct({
  role: Schema.optional(AdminMemberRoleSchema),
  status: Schema.optional(AdminMemberStatusSchema),
  includeArchived: Schema.optional(Schema.Boolean),
});

export type ListMembersFilter = Schema.Schema.Type<
  typeof ListMembersFilterSchema
>;

export const InviteMemberInputSchema = Schema.Struct({
  email: Schema.NonEmptyString,
  invitedRole: AdminMemberRoleSchema,
  invitedBy: Schema.NonEmptyString,
  tokenHash: Schema.NonEmptyString,
  expiresAt: Schema.NonEmptyString,
  correlationId: Schema.optional(Schema.NonEmptyString),
});

export type InviteMemberInput = Schema.Schema.Type<
  typeof InviteMemberInputSchema
>;

export const RedeemInvitationInputSchema = Schema.Struct({
  invitationId: Schema.NonEmptyString,
  keycloakSubjectId: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
});

export type RedeemInvitationInput = Schema.Schema.Type<
  typeof RedeemInvitationInputSchema
>;

export const ChangeMemberRoleInputSchema = Schema.Struct({
  memberId: Schema.NonEmptyString,
  newRole: AdminMemberRoleSchema,
});

export type ChangeMemberRoleInput = Schema.Schema.Type<
  typeof ChangeMemberRoleInputSchema
>;

export const RemoveMemberInputSchema = Schema.Struct({
  memberId: Schema.NonEmptyString,
});

export type RemoveMemberInput = Schema.Schema.Type<
  typeof RemoveMemberInputSchema
>;

export const EnsureBootstrapOwnerInputSchema = Schema.Struct({
  memberId: Schema.optional(Schema.NonEmptyString),
  keycloakSubjectId: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  createdBy: Schema.NonEmptyString,
});

export type EnsureBootstrapOwnerInput = Schema.Schema.Type<
  typeof EnsureBootstrapOwnerInputSchema
>;

// ---------------------------------------------------------------------------
// Row → contract decode
// ---------------------------------------------------------------------------

const decodeAdminMember = Schema.decodeUnknown(AdminMemberSchema);
const decodeAdminMemberInvitation = Schema.decodeUnknown(
  AdminMemberInvitationSchema,
);

type AdminMemberRow = typeof adminMembersTable.$inferSelect;
type AdminMemberInvitationRow = typeof adminMemberInvitationsTable.$inferSelect;

const decodeMemberRow = (row: AdminMemberRow) =>
  decodeAdminMember({
    id: row.id,
    ...(row.keycloakSubjectId === null
      ? {}
      : { keycloakSubjectId: row.keycloakSubjectId }),
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    invitedAt: row.invitedAt.toISOString(),
    ...(row.acceptedAt === null
      ? {}
      : { acceptedAt: row.acceptedAt.toISOString() }),
    ...(row.lastActiveAt === null
      ? {}
      : { lastActiveAt: row.lastActiveAt.toISOString() }),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    ...(row.archivedAt === null
      ? {}
      : { archivedAt: row.archivedAt.toISOString() }),
  });

const decodeInvitationRow = (row: AdminMemberInvitationRow) =>
  decodeAdminMemberInvitation({
    invitationId: row.invitationId,
    email: row.email,
    invitedRole: row.invitedRole,
    invitedBy: row.invitedBy,
    tokenHash: row.tokenHash,
    status: row.status,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.acceptedAt === null
      ? {}
      : { acceptedAt: row.acceptedAt.toISOString() }),
    ...(row.revokedAt === null
      ? {}
      : { revokedAt: row.revokedAt.toISOString() }),
    ...(row.revokedBy === null ? {} : { revokedBy: row.revokedBy }),
    ...(row.correlationId === null ? {} : { correlationId: row.correlationId }),
  });

// ---------------------------------------------------------------------------
// Service interface + tag
// ---------------------------------------------------------------------------

export type AdminOrganizationRepositoryService = {
  readonly listMembers: (
    filter?: ListMembersFilter,
  ) => Effect.Effect<readonly AdminMember[], AdminOrganizationRepositoryError>;
  readonly getMember: (
    memberId: string,
  ) => Effect.Effect<
    Option.Option<AdminMember>,
    AdminOrganizationRepositoryError
  >;
  readonly getMembershipByEmail: (
    email: string,
  ) => Effect.Effect<
    Option.Option<AdminMember>,
    AdminOrganizationRepositoryError
  >;
  readonly getMembershipByKeycloakSubjectId: (
    subjectId: string,
  ) => Effect.Effect<
    Option.Option<AdminMember>,
    AdminOrganizationRepositoryError
  >;
  readonly inviteMember: (
    input: InviteMemberInput,
  ) => Effect.Effect<AdminMemberInvitation, AdminOrganizationRepositoryError>;
  readonly getInvitationByTokenHash: (
    tokenHash: string,
  ) => Effect.Effect<
    Option.Option<AdminMemberInvitation>,
    AdminOrganizationRepositoryError
  >;
  readonly redeemInvitation: (
    input: RedeemInvitationInput,
  ) => Effect.Effect<AdminMember, AdminOrganizationRepositoryError>;
  readonly ensureBootstrapOwner: (
    input: EnsureBootstrapOwnerInput,
  ) => Effect.Effect<AdminMember, AdminOrganizationRepositoryError>;
  readonly changeMemberRole: (
    input: ChangeMemberRoleInput,
  ) => Effect.Effect<AdminMember, AdminOrganizationRepositoryError>;
  readonly removeMember: (
    input: RemoveMemberInput,
  ) => Effect.Effect<void, AdminOrganizationRepositoryError>;
  readonly countMembersByRole: (
    role: AdminMemberRole,
  ) => Effect.Effect<number, AdminOrganizationRepositoryError>;
};

export class AdminOrganizationRepository extends Context.Tag(
  "AdminOrganizationRepository",
)<AdminOrganizationRepository, AdminOrganizationRepositoryService>() {}

// ---------------------------------------------------------------------------
// Implementation helpers
// ---------------------------------------------------------------------------

const tryQuery = <A>(
  operation: AdminOrgQueryError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, AdminOrgQueryError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new AdminOrgQueryError({ operation, cause }),
  });

const tryPersist = <A>(
  operation: AdminOrgPersistenceError["args"]["operation"],
  thunk: () => Promise<A>,
): Effect.Effect<A, AdminOrgPersistenceError> =>
  Effect.tryPromise({
    try: thunk,
    catch: (cause) => new AdminOrgPersistenceError({ operation, cause }),
  });

const generateUuid = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  throw new Error(
    "globalThis.crypto.randomUUID is required to generate admin-organization identifiers",
  );
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const selectMemberById = (database: PostgresDatabase, memberId: string) =>
  tryQuery("getMember", () =>
    database
      .select()
      .from(adminMembersTable)
      .where(eq(adminMembersTable.id, memberId)),
  ).pipe(Effect.map((rows) => rows.find((entry) => entry.id === memberId)));

const selectMemberByEmail = (database: PostgresDatabase, email: string) =>
  tryQuery("getMembershipByEmail", () =>
    database
      .select()
      .from(adminMembersTable)
      .where(eq(adminMembersTable.email, email)),
  ).pipe(Effect.map((rows) => rows.find((entry) => entry.email === email)));

const selectMemberByKeycloakSubject = (
  database: PostgresDatabase,
  subjectId: string,
) =>
  tryQuery("getMembershipByKeycloakSubjectId", () =>
    database
      .select()
      .from(adminMembersTable)
      .where(eq(adminMembersTable.keycloakSubjectId, subjectId)),
  ).pipe(
    Effect.map((rows) =>
      rows.find((entry) => entry.keycloakSubjectId === subjectId),
    ),
  );

const selectInvitationByTokenHash = (
  database: PostgresDatabase,
  tokenHash: string,
) =>
  tryQuery("getInvitationByTokenHash", () =>
    database
      .select()
      .from(adminMemberInvitationsTable)
      .where(eq(adminMemberInvitationsTable.tokenHash, tokenHash)),
  ).pipe(
    Effect.map((rows) => rows.find((entry) => entry.tokenHash === tokenHash)),
  );

const selectInvitationById = (
  database: PostgresDatabase,
  invitationId: string,
) =>
  tryQuery("getInvitationByTokenHash", () =>
    database
      .select()
      .from(adminMemberInvitationsTable)
      .where(eq(adminMemberInvitationsTable.invitationId, invitationId)),
  ).pipe(
    Effect.map((rows) =>
      rows.find((entry) => entry.invitationId === invitationId),
    ),
  );

export const makeAdminOrganizationRepository = (database: PostgresDatabase) =>
  Effect.succeed<AdminOrganizationRepositoryService>({
    listMembers: (filter) =>
      tryQuery("listMembers", () =>
        // drizzle treats `.where(undefined)` as no-op; the typed
        // wrapper requires us to call `.where(...)` here.
        database.select().from(adminMembersTable).where(undefined),
      ).pipe(
        Effect.flatMap((rows) => {
          const filtered = rows.filter((row) => {
            if (filter?.role !== undefined && row.role !== filter.role) {
              return false;
            }
            if (filter?.status !== undefined && row.status !== filter.status) {
              return false;
            }
            if (filter?.includeArchived !== true && row.archivedAt !== null) {
              return false;
            }
            return true;
          });

          return Effect.forEach(filtered, decodeMemberRow, { concurrency: 1 });
        }),
      ),

    getMember: (memberId) =>
      selectMemberById(database, memberId).pipe(
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(Option.none<AdminMember>())
            : decodeMemberRow(row).pipe(Effect.map(Option.some)),
        ),
      ),

    getMembershipByEmail: (email) =>
      selectMemberByEmail(database, email).pipe(
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(Option.none<AdminMember>())
            : decodeMemberRow(row).pipe(Effect.map(Option.some)),
        ),
      ),

    getMembershipByKeycloakSubjectId: (subjectId) =>
      selectMemberByKeycloakSubject(database, subjectId).pipe(
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(Option.none<AdminMember>())
            : decodeMemberRow(row).pipe(Effect.map(Option.some)),
        ),
      ),

    inviteMember: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(InviteMemberInputSchema)(
          input,
        );
        const existing = yield* selectInvitationByTokenHash(
          database,
          decoded.tokenHash,
        );
        if (existing !== undefined) {
          return yield* Effect.fail(
            new AdminOrgUniqueViolationError({
              field: "tokenHash",
              value: decoded.tokenHash,
            }),
          );
        }
        const invitationId = generateUuid();
        const issuedAt = new Date();
        const expiresAt = new Date(decoded.expiresAt);
        yield* tryPersist("inviteMember", () =>
          database
            .insert(adminMemberInvitationsTable)
            .values({
              invitationId,
              email: decoded.email,
              invitedRole: decoded.invitedRole,
              invitedBy: decoded.invitedBy,
              tokenHash: decoded.tokenHash,
              status: adminMemberInvitationStatus.pending,
              issuedAt,
              expiresAt,
              ...(decoded.correlationId === undefined
                ? {}
                : { correlationId: decoded.correlationId }),
            })
            .execute(),
        );
        const inserted = yield* selectInvitationById(database, invitationId);
        if (inserted === undefined) {
          return yield* Effect.fail(
            new AdminOrgPersistenceError({
              operation: "inviteMember",
              cause: new Error(
                "admin invitation insert was not visible to subsequent select",
              ),
            }),
          );
        }
        return yield* decodeInvitationRow(inserted);
      }),

    getInvitationByTokenHash: (tokenHash) =>
      selectInvitationByTokenHash(database, tokenHash).pipe(
        Effect.flatMap((row) =>
          row === undefined
            ? Effect.succeed(Option.none<AdminMemberInvitation>())
            : decodeInvitationRow(row).pipe(Effect.map(Option.some)),
        ),
      ),

    redeemInvitation: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          RedeemInvitationInputSchema,
        )(input);
        const invitation = yield* selectInvitationById(
          database,
          decoded.invitationId,
        );
        if (invitation === undefined) {
          return yield* Effect.fail(
            new AdminOrgNotFoundError({
              entity: "adminMemberInvitation",
              key: decoded.invitationId,
            }),
          );
        }
        if (invitation.status !== adminMemberInvitationStatus.pending) {
          return yield* Effect.fail(
            new AdminOrgPersistenceError({
              operation: "redeemInvitation",
              cause: new Error(
                `admin invitation ${decoded.invitationId} is ${invitation.status}, not pending`,
              ),
            }),
          );
        }
        const now = new Date();
        if (invitation.expiresAt.getTime() < now.getTime()) {
          return yield* Effect.fail(
            new AdminOrgPersistenceError({
              operation: "redeemInvitation",
              cause: new Error(
                `admin invitation ${decoded.invitationId} expired at ${invitation.expiresAt.toISOString()}`,
              ),
            }),
          );
        }

        const existingByEmail = yield* selectMemberByEmail(
          database,
          invitation.email,
        );
        if (existingByEmail !== undefined) {
          return yield* Effect.fail(
            new AdminOrgUniqueViolationError({
              field: "email",
              value: invitation.email,
            }),
          );
        }
        const existingBySubject = yield* selectMemberByKeycloakSubject(
          database,
          decoded.keycloakSubjectId,
        );
        if (existingBySubject !== undefined) {
          return yield* Effect.fail(
            new AdminOrgUniqueViolationError({
              field: "keycloakSubjectId",
              value: decoded.keycloakSubjectId,
            }),
          );
        }

        const memberId = generateUuid();
        yield* tryPersist("redeemInvitation", () =>
          database
            .insert(adminMembersTable)
            .values({
              id: memberId,
              keycloakSubjectId: decoded.keycloakSubjectId,
              email: invitation.email,
              displayName: decoded.displayName,
              role: invitation.invitedRole,
              status: adminMemberStatus.active,
              invitedAt: invitation.issuedAt,
              acceptedAt: now,
              createdBy: invitation.invitedBy,
            })
            .execute(),
        );
        yield* tryPersist("redeemInvitation", () =>
          database
            .update(adminMemberInvitationsTable)
            .set({
              status: adminMemberInvitationStatus.redeemed,
              acceptedAt: now,
            })
            .where(
              and(
                eq(
                  adminMemberInvitationsTable.invitationId,
                  invitation.invitationId,
                ),
                eq(
                  adminMemberInvitationsTable.status,
                  adminMemberInvitationStatus.pending,
                ),
              ),
            )
            .returning(),
        );
        const memberRow = yield* selectMemberById(database, memberId);
        if (memberRow === undefined) {
          return yield* Effect.fail(
            new AdminOrgPersistenceError({
              operation: "redeemInvitation",
              cause: new Error(
                "admin member insert was not visible to subsequent select",
              ),
            }),
          );
        }
        return yield* decodeMemberRow(memberRow);
      }),

    ensureBootstrapOwner: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          EnsureBootstrapOwnerInputSchema,
        )(input);
        const now = new Date();

        if (decoded.memberId === undefined) {
          const memberId = generateUuid();
          yield* tryPersist("ensureBootstrapOwner", () =>
            database
              .insert(adminMembersTable)
              .values({
                id: memberId,
                keycloakSubjectId: decoded.keycloakSubjectId,
                email: decoded.email,
                displayName: decoded.displayName,
                role: adminMemberRole.adminOwner,
                status: adminMemberStatus.active,
                invitedAt: now,
                acceptedAt: now,
                createdBy: decoded.createdBy,
                updatedAt: now,
                archivedAt: null,
              })
              .execute(),
          );
          const memberRow = yield* selectMemberById(database, memberId);
          if (memberRow === undefined) {
            return yield* Effect.fail(
              new AdminOrgPersistenceError({
                operation: "ensureBootstrapOwner",
                cause: new Error(
                  "bootstrap owner insert was not visible to subsequent select",
                ),
              }),
            );
          }
          return yield* decodeMemberRow(memberRow);
        }

        const existing = yield* selectMemberById(database, decoded.memberId);
        if (existing === undefined) {
          return yield* Effect.fail(
            new AdminOrgNotFoundError({
              entity: "adminMember",
              key: decoded.memberId,
            }),
          );
        }

        const memberId = decoded.memberId;
        const rows = yield* tryPersist("ensureBootstrapOwner", () =>
          database
            .update(adminMembersTable)
            .set({
              keycloakSubjectId: decoded.keycloakSubjectId,
              email: decoded.email,
              displayName: decoded.displayName,
              role: adminMemberRole.adminOwner,
              status: adminMemberStatus.active,
              acceptedAt: existing.acceptedAt ?? now,
              archivedAt: null,
              updatedAt: now,
            })
            .where(eq(adminMembersTable.id, memberId))
            .returning(),
        );
        const row = rows.find((entry) => entry.id === memberId);
        if (row === undefined) {
          return yield* Effect.fail(
            new AdminOrgNotFoundError({
              entity: "adminMember",
              key: memberId,
            }),
          );
        }
        return yield* decodeMemberRow(row);
      }),

    changeMemberRole: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(
          ChangeMemberRoleInputSchema,
        )(input);
        const rows = yield* tryPersist("changeMemberRole", () =>
          database
            .update(adminMembersTable)
            .set({
              role: decoded.newRole,
              updatedAt: new Date(),
            })
            .where(eq(adminMembersTable.id, decoded.memberId))
            .returning(),
        );
        const row = rows.find((entry) => entry.id === decoded.memberId);
        if (row === undefined) {
          return yield* Effect.fail(
            new AdminOrgNotFoundError({
              entity: "adminMember",
              key: decoded.memberId,
            }),
          );
        }
        return yield* decodeMemberRow(row);
      }),

    removeMember: (input) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknown(RemoveMemberInputSchema)(
          input,
        );
        const now = new Date();
        const rows = yield* tryPersist("removeMember", () =>
          database
            .update(adminMembersTable)
            .set({
              status: adminMemberStatus.archived,
              archivedAt: now,
              updatedAt: now,
            })
            .where(eq(adminMembersTable.id, decoded.memberId))
            .returning(),
        );
        const row = rows.find((entry) => entry.id === decoded.memberId);
        if (row === undefined) {
          return yield* Effect.fail(
            new AdminOrgNotFoundError({
              entity: "adminMember",
              key: decoded.memberId,
            }),
          );
        }
        return undefined;
      }),

    countMembersByRole: (role) =>
      Schema.decodeUnknown(AdminMemberRoleSchema)(role).pipe(
        Effect.flatMap((decodedRole) =>
          tryQuery("countMembersByRole", () =>
            database
              .select()
              .from(adminMembersTable)
              .where(
                and(
                  eq(adminMembersTable.role, decodedRole),
                  isNull(adminMembersTable.archivedAt),
                ),
              ),
          ).pipe(
            Effect.map(
              (rows) =>
                rows.filter(
                  (row) => row.role === decodedRole && row.archivedAt === null,
                ).length,
            ),
          ),
        ),
      ),
  });

export const makeAdminOrganizationRepositoryLayer = (
  database: PostgresDatabase,
) =>
  Layer.effect(
    AdminOrganizationRepository,
    makeAdminOrganizationRepository(database),
  );

// Re-export the persisted-status constants so platform-service
// callers receive the same boundary-decode behaviour without
// re-importing raw status enums alongside the repository tag.
export { adminMemberInvitationStatus, adminMemberStatus };
