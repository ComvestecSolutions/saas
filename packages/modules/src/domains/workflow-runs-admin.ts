/**
 * Workflow runs admin envelope module wrapper (admin-app
 * implementation plan §9 item 15).
 *
 * Re-exports the canonical contract surface so downstream platform
 * + app code imports from `@comvestec/modules` without reaching
 * across packages. The platform service composes an injected
 * workflow-jobs admin port; the underlying workflow engine still
 * lives in `@comvestec/modules` under `workflow-jobs`. Owner-locked
 * invariants (operator/support read + operator-or-admin-owner-or-
 * admin-admin write authz, reason-catalog decode, attachment
 * enforcement, audit emission, bounded list cache, bounded
 * pageSize) live at the platform service boundary in
 * `packages/platform/src/services/domains/workflow-runs-admin-service.ts`.
 *
 * No persistence: this slice projects workflow-jobs runs through
 * the injected port. The platform service owns the bounded cache
 * + audit + authz invariants; the upstream port owns the row
 * shape and replay/cancel semantics.
 */
import { platformModuleId } from "@comvestec/contracts";

export const workflowRunsAdminModuleId = platformModuleId.workflowRunsAdmin;

export {
  WorkflowRunCancelInputSchema,
  WorkflowRunCancelResultSchema,
  WorkflowRunDetailInputSchema,
  WorkflowRunDetailSchema,
  WorkflowRunReplayInputSchema,
  WorkflowRunReplayResultSchema,
  WorkflowRunStatusSchema,
  WorkflowRunStepSchema,
  WorkflowRunSummarySchema,
  WorkflowRunsListInputSchema,
  WorkflowRunsListResultSchema,
  WorkflowRunsPartialFailureSchema,
  workflowRunStatus,
  workflowRunStatuses,
} from "@comvestec/contracts";

export type {
  WorkflowRunCancelInput,
  WorkflowRunCancelResult,
  WorkflowRunDetail,
  WorkflowRunDetailInput,
  WorkflowRunReplayInput,
  WorkflowRunReplayResult,
  WorkflowRunStatus,
  WorkflowRunStep,
  WorkflowRunSummary,
  WorkflowRunsListFilters,
  WorkflowRunsListInput,
  WorkflowRunsListResult,
  WorkflowRunsPartialFailure,
} from "@comvestec/contracts";

/**
 * Pure helper shared by the platform service + any future read
 * consumer: snapshot freshness check used by the list cache to
 * decide whether a cached page is still within the
 * operator-configured TTL. Negative or non-finite TTLs collapse
 * to `false` so misconfiguration fails closed rather than
 * silently bypassing the TTL.
 */
export const isWorkflowRunsListFresh = (
  cachedAt: string,
  nowEpochMs: number,
  ttlSeconds: number,
): boolean => {
  const cachedMs = new Date(cachedAt).getTime();
  if (!Number.isFinite(cachedMs)) {
    return false;
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return false;
  }
  const ageMs = nowEpochMs - cachedMs;
  if (ageMs < 0) {
    return false;
  }
  return ageMs <= ttlSeconds * 1000;
};
