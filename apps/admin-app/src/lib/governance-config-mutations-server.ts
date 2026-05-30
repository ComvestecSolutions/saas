import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  DeclaredRuntimeGovernedKeySchema,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
} from "@comvestec/contracts";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Runtime Config v2 mutation server-fns (admin-app implementation
 * plan §8.5 + §11 — Phase 3 Governance & access commit 2).
 * Mirrors the `/desk/tenant/$tenantId` mutations-server sibling: each
 * helper decodes its input at the framework boundary via
 * `Schema.decodeUnknown`, extracts the operator session id from
 * the request, and delegates to the platform
 * `*FromSessionId` helpers in
 * `packages/platform/src/services/apps/admin-governance-actions.ts`
 * (`submitAdminRuntimeConfigOverrideProposalFromSessionId`,
 * `reviewAdminRuntimeConfigProposalFromSessionId`). The platform
 * helpers gate end-to-end through
 * `resolveTrustedRequestContextFromSessionId`, so authorization,
 * audit, and break-glass enforcement stay backend-owned.
 *
 * Approval-reason capture happens client-side through
 * `DiffApprovalDrawer` + `HighRiskActionGuard`. The review
 * server-fn ships in commit 2 so commit 2b can wire the
 * approve/reject affordances against the same boundary without
 * re-doing the transport plumbing.
 *
 * Sessionless input: the `sessionId` field is resolved from the
 * trusted request envelope rather than the URL body so admin-app
 * forms never propose a session string.
 */

const SubmitAdminRuntimeConfigOverrideProposalInputSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  value: Schema.Unknown,
  approvalReason: Schema.NonEmptyString,
});

const ReviewAdminRuntimeConfigProposalInputSchema = Schema.Struct({
  proposalId: Schema.NonEmptyString,
  status: Schema.Literal("approved", "rejected"),
  decisionReason: Schema.NonEmptyString,
});

type SubmitAdminRuntimeConfigOverrideProposalInput = Schema.Schema.Type<
  typeof SubmitAdminRuntimeConfigOverrideProposalInputSchema
>;

type ReviewAdminRuntimeConfigProposalInput = Schema.Schema.Type<
  typeof ReviewAdminRuntimeConfigProposalInputSchema
>;

const resolveSessionIdFromRequest = async (
  request: Request,
): Promise<string> => {
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");
  return Effect.runPromise(extractRequiredSubscriberJourneySessionId(request));
};

export const submitAdminRuntimeConfigOverrideProposal = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator(
    decodeSyncBoundary(SubmitAdminRuntimeConfigOverrideProposalInputSchema),
  )
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: SubmitAdminRuntimeConfigOverrideProposalInput;
    }): Promise<SubmitAdminRuntimeConfigOverrideProposalServerResult> => {
      const sessionId = await resolveSessionIdFromRequest(context.request);
      const { submitAdminRuntimeConfigOverrideProposalFromSessionId } =
        await import("@comvestec/platform");
      const result = await Effect.runPromise(
        submitAdminRuntimeConfigOverrideProposalFromSessionId(process.env, {
          sessionId,
          moduleId: data.moduleId,
          key: data.key,
          scope: data.scope,
          scopeId: data.scopeId,
          value: data.value,
          approvalReason: data.approvalReason,
        }),
      );
      return {
        proposalId: result.proposal.proposalId,
        status: result.proposal.status,
        correlationId: result.auditEvent.correlationId ?? null,
      };
    },
  );

export const reviewAdminRuntimeConfigProposal = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator(
    decodeSyncBoundary(ReviewAdminRuntimeConfigProposalInputSchema),
  )
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: ReviewAdminRuntimeConfigProposalInput;
    }): Promise<ReviewAdminRuntimeConfigProposalServerResult> => {
      const sessionId = await resolveSessionIdFromRequest(context.request);
      const { reviewAdminRuntimeConfigProposalFromSessionId } =
        await import("@comvestec/platform");
      const result = await Effect.runPromise(
        reviewAdminRuntimeConfigProposalFromSessionId(process.env, {
          sessionId,
          proposalId: data.proposalId,
          status: data.status,
          decisionReason: data.decisionReason,
        }),
      );
      return {
        proposalId: result.proposal.proposalId,
        status: result.proposal.status,
        correlationId: result.auditEvent.correlationId ?? null,
      };
    },
  );

/**
 * Serializable projections of the platform-side
 * `Admin Governance Submit/Review Runtime Config Proposal`
 * responses. Keeps the platform-side `value` / `runtimeValue` /
 * `codeValue` `Schema.Unknown` fields off the TanStack Start
 * `ValidateSerializableMapped` boundary; the admin-app reloads the
 * route to obtain the refreshed proposal projection.
 */
export type SubmitAdminRuntimeConfigOverrideProposalServerResult = {
  readonly proposalId: string;
  readonly status: string;
  readonly correlationId: string | null;
};

export type ReviewAdminRuntimeConfigProposalServerResult = {
  readonly proposalId: string;
  readonly status: string;
  readonly correlationId: string | null;
};
