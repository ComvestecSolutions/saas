import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  DeclaredModuleFeatureFlagKeySchema,
  PlatformModuleIdSchema,
} from "@comvestec/contracts";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSyncBoundary } from "./effect-boundary";

/**
 * Feature Flags v2 mutation server-fns (admin-app implementation
 * plan §8.6 + §11 — Phase 3 Governance & access commit 3).
 * Mirrors the `/desk/config` `governance-config-mutations-server`
 * sibling: each helper decodes its input at the framework
 * boundary via `Schema.decodeUnknown`, extracts the operator
 * session id from the request, and is wired to delegate to the
 * platform `*FromSessionId` helpers in
 * `packages/platform/src/services/apps/admin-governance-actions.ts`.
 *
 * Approval-reason capture happens client-side through
 * `DiffApprovalDrawer` + `HighRiskActionGuard`. The review
 * server-fn ships in commit 3 so commit 3b can wire the
 * approve/reject affordances against the same boundary without
 * re-doing the transport plumbing.
 *
 * Escape hatch: the platform-side
 * `submitAdminFeatureFlagProposalFromSessionId` +
 * `reviewAdminFeatureFlagProposalFromSessionId` helpers are not
 * yet exposed by `admin-governance-actions.ts` — the underlying
 * `AdminGovernanceService` only exposes the feature-flag read
 * paths today. The server-fns here decode the typed input at the
 * framework boundary so the route-side wiring is honest end to
 * end, and currently fail with a typed
 * `FeatureFlagProposalMutationsNotImplementedError` so the
 * deferred work in commit 3b only needs to wire the platform-side
 * helpers and swap the handler body — the input schemas, route
 * surface, `HighRiskActionGuard`, fixture mocks, and browser
 * coverage stay as-is.
 *
 * Sessionless input: the `sessionId` field is resolved from the
 * trusted request envelope rather than the URL body so admin-app
 * forms never propose a session string.
 */

const SubmitAdminFeatureFlagProposalInputSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  key: DeclaredModuleFeatureFlagKeySchema,
  enabled: Schema.Boolean,
  approvalReason: Schema.NonEmptyString,
});

const ReviewAdminFeatureFlagProposalInputSchema = Schema.Struct({
  proposalId: Schema.NonEmptyString,
  status: Schema.Literal("approved", "rejected"),
  decisionReason: Schema.NonEmptyString,
});

type SubmitAdminFeatureFlagProposalInput = Schema.Schema.Type<
  typeof SubmitAdminFeatureFlagProposalInputSchema
>;

type ReviewAdminFeatureFlagProposalInput = Schema.Schema.Type<
  typeof ReviewAdminFeatureFlagProposalInputSchema
>;

class FeatureFlagProposalMutationsNotImplementedError extends Error {
  readonly _tag = "FeatureFlagProposalMutationsNotImplementedError";
  constructor() {
    super(
      "Feature-flag proposal mutations land in commit 3b — wire the platform-side helpers in admin-governance-actions.ts before invoking.",
    );
    this.name = "FeatureFlagProposalMutationsNotImplementedError";
  }
}

const resolveSessionIdFromRequest = async (
  request: Request,
): Promise<string> => {
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");
  return Effect.runPromise(extractRequiredSubscriberJourneySessionId(request));
};

export const submitAdminFeatureFlagProposal = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(SubmitAdminFeatureFlagProposalInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: SubmitAdminFeatureFlagProposalInput;
    }): Promise<SubmitAdminFeatureFlagProposalServerResult> => {
      // Resolve the session id up-front so the transport contract
      // (typed envelope → trusted operator) is exercised even
      // while the platform-side helper is still pending in 3b.
      await resolveSessionIdFromRequest(context.request);
      void data;
      throw new FeatureFlagProposalMutationsNotImplementedError();
    },
  );

export const reviewAdminFeatureFlagProposal = createServerFn({
  method: "POST",
})
  .middleware([adminRequestServerMiddleware])
  .inputValidator(decodeSyncBoundary(ReviewAdminFeatureFlagProposalInputSchema))
  .handler(
    async ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: ReviewAdminFeatureFlagProposalInput;
    }): Promise<ReviewAdminFeatureFlagProposalServerResult> => {
      await resolveSessionIdFromRequest(context.request);
      void data;
      throw new FeatureFlagProposalMutationsNotImplementedError();
    },
  );

/**
 * Serializable projections of the (commit-3b) platform-side
 * `Admin Governance Submit/Review Feature Flag Proposal`
 * responses. Keeps the platform-side projection fields off the
 * TanStack Start `ValidateSerializableMapped` boundary; the
 * admin-app reloads the route to obtain the refreshed flag
 * projection.
 */
export type SubmitAdminFeatureFlagProposalServerResult = {
  readonly proposalId: string;
  readonly status: string;
  readonly correlationId: string | null;
};

export type ReviewAdminFeatureFlagProposalServerResult = {
  readonly proposalId: string;
  readonly status: string;
  readonly correlationId: string | null;
};
