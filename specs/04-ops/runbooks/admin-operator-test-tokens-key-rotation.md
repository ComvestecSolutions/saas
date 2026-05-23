# Admin-Operator Test Tokens — Signing Key Rotation Runbook

Status: accepted

## Scope

Use this runbook to rotate the HMAC-SHA-256 signing key that backs the
admin-operator test-tokens slice
(`packages/platform/src/services/access/admin-operator-test-tokens-service.ts`,
admin-app implementation plan §9 item 17 / §11 Phase 7). The signing
key is consumed exclusively by the env-bound service runtime; it
never travels through the admin-app, never leaves the backend
process, and is the only secret material the slice depends on
beyond the standard Postgres credentials.

This runbook does not cover:

- Issuing or revoking individual tokens. Those flows are admin-owner
  surfaces under `/admin/tokens` and are reason-catalog gated through
  `admin-operator-test-tokens.issue` (requires reason attachment) and
  `admin-operator-test-tokens.revoke`. The reason-catalog gates are
  enforced inside the platform service; the admin-app screen renders
  the canonical reason chooser through `HighRiskActionGuard`.
- Verifying tokens at request boundaries. Verification reads only the
  persisted hash + the current signing key; outcomes are audited
  through the usage ring and never expose the plaintext token.

## Invariants

1. The signing key must decode at the env boundary through the
   contract-owned
   `AdminOperatorTestTokensRuntimeConfigSchema`. There is no in-code
   fallback — a missing or malformed value fails the runtime at
   boundary decode time. See `.env.example`:
   `ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY`,
   `ADMIN_OPERATOR_TEST_TOKENS_DEFAULT_EXPIRY_HOURS`,
   `ADMIN_OPERATOR_TEST_TOKENS_MAX_EXPIRY_HOURS`.
1. A rotated key invalidates every previously-issued plaintext token
   verbatim (HMAC under the new key will not match any persisted
   hash). The persisted rows remain inspectable through `/admin/tokens`
   so operators can still revoke or label them, but `verify(...)` will
   route them to the
   `AdminOperatorTestTokenVerificationFailureReasonSchema` channel.
1. Plaintext tokens are surfaced exactly once at issue time inside
   the admin-app one-shot `<Dialog>` with `RevealField` + clipboard
   copy. They are never refetched. After rotation, any saved
   plaintext copies held by operators are unusable.
1. Rotation MUST be paired with an audit-evidence capture window so
   the resulting `admin-operator-test-tokens.issued` /
   `admin-operator-test-tokens.revoked` activity sits next to the
   rotation note in the audit feed.

## Pre-rotation Checklist

1. Capture the current `/admin/tokens` totals (active / expiring
   soon / revoked) for the rotation note. The KPI strip on the page
   reads the same data the runbook step needs.
1. Confirm any active token that must remain valid across the
   rotation has been issued under the new key first (see "Window of
   dual validity" below). If no such tokens exist, skip dual
   validity and rotate cleanly.
1. Capture the operator session id, the target environment, the
   reason for rotation, and the on-call partner who will witness the
   change.

## Rotation Procedure

The slice does not currently maintain a secondary signing key in
parallel; rotation is a single-key swap. Run the procedure during a
quiet window for the admin-operator test-tokens slice.

1. **Issue rollover tokens first (optional).** For each operator who
   needs an active token across the swap, issue a fresh token through
   `/admin/tokens` under reason catalog
   `admin-operator-test-tokens.issue` with a rotation-coverage
   attachment. Note the resulting `tokenPrefix` values — the
   plaintext is only visible once, in the issue dialog.
1. **Swap the env value.** Update the secret store / process manager
   so `ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY` resolves to the new
   value. Operator bootstrap docs live in
   `specs/04-ops/runbooks/local-secret-and-operator-bootstrap.md`; the
   storage backend (Kong vault, container env, etc.) is environment
   specific.
1. **Reload the backend process(es).** The signing key is decoded at
   env boundary on runtime construction; reload all admin-app /
   subscriber-journey processes that host the platform service.
1. **Verify the new key is live.** From `/admin/tokens` issue one
   test token under reason catalog `admin-operator-test-tokens.issue`
   with attachment text `rotation-verify`, then immediately revoke it
   under `admin-operator-test-tokens.revoke`. Both events should
   appear in `/admin/audit` pinned to the admin-organization module.
1. **Revoke pre-rotation tokens.** Walk the `/admin/tokens` table and
   revoke every token whose `issuedAt` is older than the rotation
   timestamp, except the rollover tokens issued in step 1. Use reason
   catalog `admin-operator-test-tokens.revoke`. Pre-rotation tokens
   will already fail verification under the new key, but explicit
   revocation makes the lifecycle state honest in the table and the
   audit feed.

## Post-rotation Validation

1. The `/admin/tokens` KPI strip should show `revoked` strictly
   greater than the pre-rotation value, and the rotation-verify
   token should appear under `revoked` as well.
1. The `/admin/audit` admin-organization-scoped feed should contain
   the rotation-verify issue/revoke pair plus the bulk revocation
   activity.
1. Confirm no production caller path is still relying on a
   pre-rotation plaintext token — any such path will fail with the
   verification failure reason channel and should be remediated
   through the slice's normal issuance flow, not by rolling back.

## Rollback

The slice does not support rolling back to a previous signing key —
the swap is one-way. If the new key value was wrong (for example
malformed), the runtime will fail boundary decode at process start
and refuse to serve admin-operator-test-tokens traffic. Fix the env
value, repeat the procedure, and treat any tokens issued under the
broken value as compromised.

## References

- Service: `packages/platform/src/services/access/admin-operator-test-tokens-service.ts`
- App helpers: `packages/platform/src/services/apps/admin-operator-test-tokens-actions.ts`
- Contracts: `packages/contracts/src/access/admin-operator-test-tokens.ts`
- Module helpers: `packages/modules/src/access/admin-operator-test-tokens.ts`
- Admin-app route: `apps/admin-app/src/routes/admin/tokens.tsx`
- Env entries: `.env.example` (block annotated for this slice)
- Reason catalog entries: `packages/contracts/src/access/reason-catalog.ts`
  (`admin-operator-test-tokens.issue`, `admin-operator-test-tokens.revoke`)
