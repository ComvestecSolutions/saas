import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  tenantMembershipMutationAction,
  tenantMembershipRelations,
} from "@comvestec/contracts";
import type {
  AdminTenantInvitationIssueResult,
  AdminTenantInvitationRevokeResult,
  AdminTenantMembershipMutationResult,
} from "@comvestec/contracts";
import type {
  issueTenantInvitationFromSessionId,
  mutateTenantMembershipFromSessionId,
  revokeTenantInvitationFromSessionId,
} from "@comvestec/platform";
import {
  adminRequestServerMiddleware,
  createAdminRequestMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import {
  adminTenantTargetScopes,
  buildAdminTenantContext,
  buildAdminTenantTarget,
} from "./admin-tenant-target";
import {
  tanstackStartServerRuntime,
  type TanstackStartServerRuntime,
} from "./tanstack-start-server-runtime";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Tenant workspace mutation server-fns (admin-app implementation
 * plan §9 — Phase 2 Desk Core commit 5 teardown). Carries the
 * `mutateAdminTenantMembership`, `issueAdminTenantInvitation`,
 * and `revokeAdminTenantInvitation` server-fn boundary that was
 * previously co-located with the legacy `/tenants/$tenantId`
 * loader trio. The mutations are backed by the existing
 * `admin-tenant-management-actions.ts` `*FromSessionId` helpers
 * (`mutateTenantMembershipFromSessionId`,
 * `issueTenantInvitationFromSessionId`,
 * `revokeTenantInvitationFromSessionId`) so the v2 route
 * (`/desk/tenant/$tenantId`) consumes a clean sibling without
 * importing a legacy data trio.
 *
 * No `Request` / `Response` shaping happens here — the helpers
 * decode their inputs at the server-fn boundary and delegate to
 * the platform actions via the trusted-session resolver.
 */

const AdminTenantMembershipMutationInputSchema = Schema.Struct({
  tenantId: Schema.NonEmptyString,
  scope: Schema.Literal(...adminTenantTargetScopes),
  subject: Schema.NonEmptyString,
  relation: Schema.Literal(...tenantMembershipRelations),
  action: Schema.Literal(
    tenantMembershipMutationAction.grant,
    tenantMembershipMutationAction.revoke,
  ),
  mutationReason: Schema.NonEmptyString,
});

const AdminTenantInvitationIssueInputSchema = Schema.Struct({
  tenantId: Schema.NonEmptyString,
  scope: Schema.Literal(...adminTenantTargetScopes),
  recipientEmail: Schema.NonEmptyString,
  relation: Schema.Literal(...tenantMembershipRelations),
  issueReason: Schema.NonEmptyString,
});

const AdminTenantInvitationRevokeInputSchema = Schema.Struct({
  tenantId: Schema.NonEmptyString,
  scope: Schema.Literal(...adminTenantTargetScopes),
  invitationId: Schema.NonEmptyString,
  revocationReason: Schema.NonEmptyString,
});

type AdminTenantMembershipMutationInput = Schema.Schema.Type<
  typeof AdminTenantMembershipMutationInputSchema
>;

type AdminTenantInvitationIssueInput = Schema.Schema.Type<
  typeof AdminTenantInvitationIssueInputSchema
>;

type AdminTenantInvitationRevokeInput = Schema.Schema.Type<
  typeof AdminTenantInvitationRevokeInputSchema
>;

type MutateTenantMembership = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly tenant: ReturnType<typeof buildAdminTenantContext>;
    readonly subject: string;
    readonly relation: (typeof tenantMembershipRelations)[number];
    readonly action:
      | typeof tenantMembershipMutationAction.grant
      | typeof tenantMembershipMutationAction.revoke;
    readonly mutationReason: string;
  },
) => ReturnType<typeof mutateTenantMembershipFromSessionId>;

type IssueTenantInvitation = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly tenant: ReturnType<typeof buildAdminTenantContext>;
    readonly recipientEmail: string;
    readonly relation: (typeof tenantMembershipRelations)[number];
    readonly issueReason: string;
  },
) => ReturnType<typeof issueTenantInvitationFromSessionId>;

type RevokeTenantInvitation = (
  environment: unknown,
  input: {
    readonly sessionId: string;
    readonly tenant: ReturnType<typeof buildAdminTenantContext>;
    readonly invitationId: string;
    readonly revocationReason: string;
  },
) => ReturnType<typeof revokeTenantInvitationFromSessionId>;

type TenantWorkspaceMutationTargetInvalidError = {
  readonly _tag: "TenantWorkspaceMutationTargetInvalidError";
  readonly reason: string;
};

const resolveTenantContextFromInput = (input: {
  readonly tenantId: string;
  readonly scope: (typeof adminTenantTargetScopes)[number];
}) =>
  Effect.sync(() =>
    buildAdminTenantTarget({
      scope: input.scope,
      scopeId: input.tenantId,
    }),
  ).pipe(
    Effect.flatMap((target) =>
      target === undefined
        ? Effect.fail({
            _tag: "TenantWorkspaceMutationTargetInvalidError",
            reason:
              "Choose a tenant target with an organization, enterprise, or individual scope before mutating tenant access.",
          } satisfies TenantWorkspaceMutationTargetInvalidError)
        : Effect.succeed(buildAdminTenantContext(target)),
    ),
  );

const runTenantWorkspaceMutation = async <
  TData extends {
    readonly tenantId: string;
    readonly scope: (typeof adminTenantTargetScopes)[number];
  },
  TResult,
>(input: {
  readonly request: Request;
  readonly data: TData;
  readonly execute: (requestInput: {
    readonly sessionId: string;
    readonly tenant: ReturnType<typeof buildAdminTenantContext>;
    readonly data: TData;
  }) => Promise<TResult>;
}) => {
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");
  const sessionId = await Effect.runPromise(
    extractRequiredSubscriberJourneySessionId(input.request),
  );
  const tenant = await Effect.runPromise(
    resolveTenantContextFromInput({
      tenantId: input.data.tenantId,
      scope: input.data.scope,
    }),
  );

  return input.execute({
    sessionId,
    tenant,
    data: input.data,
  });
};

export const createMutateAdminTenantMembership = (
  mutateTenantMembership: MutateTenantMembership | undefined = undefined,
  environment: unknown = process.env,
  tenantWorkspaceServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  tenantWorkspaceServerFn
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(tenantWorkspaceServerFn)])
    .inputValidator(
      decodeSyncBoundary(AdminTenantMembershipMutationInputSchema),
    )
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: AdminTenantMembershipMutationInput;
      }) =>
        runTenantWorkspaceMutation<
          AdminTenantMembershipMutationInput,
          AdminTenantMembershipMutationResult
        >({
          request: context.request,
          data,
          execute: async ({ sessionId, tenant, data: requestData }) => {
            const requestInput = {
              sessionId,
              tenant,
              subject: requestData.subject,
              relation: requestData.relation,
              action: requestData.action,
              mutationReason: requestData.mutationReason,
            } as const;

            if (mutateTenantMembership !== undefined) {
              return Effect.runPromise(
                mutateTenantMembership(environment, requestInput),
              );
            }

            const { mutateTenantMembershipFromSessionId } =
              await import("@comvestec/platform");

            return Effect.runPromise(
              mutateTenantMembershipFromSessionId(environment, requestInput),
            );
          },
        }),
    );

export const mutateAdminTenantMembership = createServerFn({ method: "POST" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminTenantMembershipMutationInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminTenantMembershipMutationInput;
    }) =>
      runTenantWorkspaceMutation<
        AdminTenantMembershipMutationInput,
        AdminTenantMembershipMutationResult
      >({
        request: context.request,
        data,
        execute: async ({ sessionId, tenant, data: requestData }) => {
          const { mutateTenantMembershipFromSessionId } =
            await import("@comvestec/platform");

          return Effect.runPromise(
            mutateTenantMembershipFromSessionId(process.env, {
              sessionId,
              tenant,
              subject: requestData.subject,
              relation: requestData.relation,
              action: requestData.action,
              mutationReason: requestData.mutationReason,
            }),
          );
        },
      }),
  );

export const createIssueAdminTenantInvitation = (
  issueTenantInvitation: IssueTenantInvitation | undefined = undefined,
  environment: unknown = process.env,
  tenantWorkspaceServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  tenantWorkspaceServerFn
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(tenantWorkspaceServerFn)])
    .inputValidator(decodeSyncBoundary(AdminTenantInvitationIssueInputSchema))
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: AdminTenantInvitationIssueInput;
      }) =>
        runTenantWorkspaceMutation<
          AdminTenantInvitationIssueInput,
          AdminTenantInvitationIssueResult
        >({
          request: context.request,
          data,
          execute: async ({ sessionId, tenant, data: requestData }) => {
            const requestInput = {
              sessionId,
              tenant,
              recipientEmail: requestData.recipientEmail,
              relation: requestData.relation,
              issueReason: requestData.issueReason,
            } as const;

            if (issueTenantInvitation !== undefined) {
              return Effect.runPromise(
                issueTenantInvitation(environment, requestInput),
              );
            }

            const { issueTenantInvitationFromSessionId } =
              await import("@comvestec/platform");

            return Effect.runPromise(
              issueTenantInvitationFromSessionId(environment, requestInput),
            );
          },
        }),
    );

export const issueAdminTenantInvitation = createServerFn({ method: "POST" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminTenantInvitationIssueInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminTenantInvitationIssueInput;
    }) =>
      runTenantWorkspaceMutation<
        AdminTenantInvitationIssueInput,
        AdminTenantInvitationIssueResult
      >({
        request: context.request,
        data,
        execute: async ({ sessionId, tenant, data: requestData }) => {
          const { issueTenantInvitationFromSessionId } =
            await import("@comvestec/platform");

          return Effect.runPromise(
            issueTenantInvitationFromSessionId(process.env, {
              sessionId,
              tenant,
              recipientEmail: requestData.recipientEmail,
              relation: requestData.relation,
              issueReason: requestData.issueReason,
            }),
          );
        },
      }),
  );

export const createRevokeAdminTenantInvitation = (
  revokeTenantInvitation: RevokeTenantInvitation | undefined = undefined,
  environment: unknown = process.env,
  tenantWorkspaceServerFn: TanstackStartServerRuntime = tanstackStartServerRuntime,
) =>
  tenantWorkspaceServerFn
    .createServerFn({ method: "POST" })
    .middleware([createAdminRequestMiddleware(tenantWorkspaceServerFn)])
    .inputValidator(decodeSyncBoundary(AdminTenantInvitationRevokeInputSchema))
    .handler(
      ({
        context,
        data,
      }: {
        readonly context: AdminRequestContext;
        readonly data: AdminTenantInvitationRevokeInput;
      }) =>
        runTenantWorkspaceMutation<
          AdminTenantInvitationRevokeInput,
          AdminTenantInvitationRevokeResult
        >({
          request: context.request,
          data,
          execute: async ({ sessionId, tenant, data: requestData }) => {
            const requestInput = {
              sessionId,
              tenant,
              invitationId: requestData.invitationId,
              revocationReason: requestData.revocationReason,
            } as const;

            if (revokeTenantInvitation !== undefined) {
              return Effect.runPromise(
                revokeTenantInvitation(environment, requestInput),
              );
            }

            const { revokeTenantInvitationFromSessionId } =
              await import("@comvestec/platform");

            return Effect.runPromise(
              revokeTenantInvitationFromSessionId(environment, requestInput),
            );
          },
        }),
    );

export const revokeAdminTenantInvitation = createServerFn({ method: "POST" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(AdminTenantInvitationRevokeInputSchema))
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminTenantInvitationRevokeInput;
    }) =>
      runTenantWorkspaceMutation<
        AdminTenantInvitationRevokeInput,
        AdminTenantInvitationRevokeResult
      >({
        request: context.request,
        data,
        execute: async ({ sessionId, tenant, data: requestData }) => {
          const { revokeTenantInvitationFromSessionId } =
            await import("@comvestec/platform");

          return Effect.runPromise(
            revokeTenantInvitationFromSessionId(process.env, {
              sessionId,
              tenant,
              invitationId: requestData.invitationId,
              revocationReason: requestData.revocationReason,
            }),
          );
        },
      }),
  );
