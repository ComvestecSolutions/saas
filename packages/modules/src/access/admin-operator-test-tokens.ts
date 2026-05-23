/**
 * Admin-operator-test-tokens module surface (admin-app implementation
 * plan §9 item 17). Re-exports the canonical contract types and
 * exposes a few pure helpers used by both the platform service and
 * UI loaders.
 *
 * The plaintext token is never present at this layer — only the
 * non-secret prefix correlator, the persisted hash, and lifecycle
 * timestamps travel through these helpers.
 */
import {
  adminOperatorTestTokenUsageOutcome,
  type AdminOperatorTestTokenSummary,
} from "@comvestec/contracts";

export {
  ADMIN_OPERATOR_TEST_TOKEN_LITERAL_PREFIX,
  AdminOperatorTestTokenDetailSchema,
  AdminOperatorTestTokenEncodedSchema,
  AdminOperatorTestTokenIssueInputSchema,
  AdminOperatorTestTokenIssueResultSchema,
  AdminOperatorTestTokenListInputSchema,
  AdminOperatorTestTokenListResultSchema,
  AdminOperatorTestTokenPrefixSchema,
  AdminOperatorTestTokenRevokeInputSchema,
  AdminOperatorTestTokenRevokeResultSchema,
  AdminOperatorTestTokenSummarySchema,
  AdminOperatorTestTokenUsageOutcomeSchema,
  AdminOperatorTestTokenVerificationFailureReasonSchema,
  AdminOperatorTestTokensRuntimeConfigSchema,
  adminOperatorTestTokenUsageOutcome,
  adminOperatorTestTokenUsageOutcomes,
  adminOperatorTestTokenVerificationFailureReason,
  adminOperatorTestTokenVerificationFailureReasons,
  isAdminOwnerForTestTokens,
} from "@comvestec/contracts";

export type {
  AdminOperatorTestTokenDetail,
  AdminOperatorTestTokenEncoded,
  AdminOperatorTestTokenIssueInput,
  AdminOperatorTestTokenIssueResult,
  AdminOperatorTestTokenListInput,
  AdminOperatorTestTokenListResult,
  AdminOperatorTestTokenPrefix,
  AdminOperatorTestTokenRevokeInput,
  AdminOperatorTestTokenRevokeResult,
  AdminOperatorTestTokenSummary,
  AdminOperatorTestTokenUsageOutcome,
  AdminOperatorTestTokenVerificationFailureReason,
  AdminOperatorTestTokensRuntimeConfig,
} from "@comvestec/contracts";

/**
 * KPI totals used by the admin-app list view and the operator
 * runbook. `expiringSoon` is the count of unrevoked tokens whose
 * `expiresAt` is within the supplied window (default 24h applied by
 * the UI loader).
 */
export const computeAdminOperatorTestTokenListTotals = (
  rows: ReadonlyArray<AdminOperatorTestTokenSummary>,
  input: { readonly now: number; readonly expiringWithinMs: number },
): {
  readonly active: number;
  readonly expiringSoon: number;
  readonly revoked: number;
} => {
  let active = 0;
  let expiringSoon = 0;
  let revoked = 0;
  for (const row of rows) {
    if (row.revokedAt !== undefined) {
      revoked += 1;
      continue;
    }
    const expiresAtMs = new Date(row.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= input.now) {
      continue;
    }
    active += 1;
    if (expiresAtMs - input.now <= input.expiringWithinMs) {
      expiringSoon += 1;
    }
  }
  return { active, expiringSoon, revoked };
};

/**
 * Pure classifier reused by the loader and by row-level UI badges.
 * Returns one of `active` / `expired` / `revoked`, evaluated against
 * the supplied `now` so tests are deterministic.
 */
export const classifyAdminOperatorTestToken = (
  row: Pick<AdminOperatorTestTokenSummary, "revokedAt" | "expiresAt">,
  now: number,
): "active" | "expired" | "revoked" => {
  if (row.revokedAt !== undefined) {
    return "revoked";
  }
  const expiresAtMs = new Date(row.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    return "expired";
  }
  return "active";
};

// Reference the imported enum so `verbatimModuleSyntax` treats it as
// used: classifier above intentionally does not return the verify
// outcome enum (it returns a lifecycle classification, not a usage
// outcome) but downstream callers import the enum through this
// module's re-exports.
const _outcomeReference = adminOperatorTestTokenUsageOutcome;
void _outcomeReference;
