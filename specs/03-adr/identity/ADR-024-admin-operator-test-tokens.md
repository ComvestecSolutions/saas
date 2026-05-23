# ADR-024: Admin operator test tokens

Status: accepted

Date: 2026-05-17

## Context

The admin app's Phase 7 surface includes
`/admin/tokens` ("owner only"), described in
`specs/02-apps/admin-app/implementation-plan.md` §8.18. Phase 7
shipped four of the five admin-org settings routes
(`/admin/profile`, `/admin/members`, `/admin/workspaces`,
`/admin/audit`) on top of existing platform helpers; `/admin/tokens`
was held under the documented escape hatch because no governing
spec or ADR existed for an owner-only first-party automation token
surface, and the platform has no service that can issue, persist,
or verify such a token today.

The repository has three adjacent surfaces that **do not** cover
this gap:

1. **ADR-004 / ADR-019 / ADR-020 + `identity-session`** own
   interactive Keycloak-backed sessions, MFA, federation, trusted
   transport, and support-impersonation token exchange. These are
   user-bound and not appropriate as a non-human automation
   credential.
2. **`admin-operator-management` + ADR-023 (admin-organization)**
   own operator staffing, role assignment, and admin-org membership
   lifecycle for human operators. They do not issue automation
   credentials.
3. **`webhooks-api-access` API-key lifecycle** owns durable,
   tenant-scoped, hash-only API keys for external integrations. It
   does not gate on `admin-owner`, does not target first-party
   automation, and intentionally scopes mutations to tenant
   operators rather than admin-org owners.

`apps/admin-app` and `tests/platform/backend-e2e/**` need an
internal, owner-only, short-lived, audit-logged token issuance
surface to drive trusted-session-equivalent automation without
maintaining a Keycloak session. Without it, the only path is
hand-edited DB rows or shell-scripted credential injection, both of
which violate the repository governance bar.

## Decision

Introduce a new module `admin-operator-test-tokens` under
`packages/modules/src/access/`, backed by a new
`AdminOperatorTestTokensService` under
`packages/platform/src/services/access/`, with the following
non-negotiable invariants:

1. **Owner-only, service-level hard floor.** Every operation
   (`issue`, `revoke`, `list`) requires `admin-owner` membership
   on the admin organization, enforced **inside** the service —
   not only at the route boundary, not only at the reason-catalog
   layer. Non-owner admin-org members are denied at the service
   call site before any persistence or audit-log touch.
2. **No break-glass override.** Both reason-catalog entries
   (`admin-operator-test-tokens.issue`,
   `admin-operator-test-tokens.revoke`) declare
   `breakGlassAllowed = false`. There is no privileged escape
   hatch into this surface. Recovery from a lost owner seat goes
   through the operator-bootstrap runbook, not through this
   module.
3. **Secret-at-rest discipline.** Plaintext tokens are returned
   exactly once on issue and never persisted. Persisted state is
   `tokenPrefix` (non-secret correlator, `secret`-classified for
   display via `RevealField`) plus `tokenHash` (HMAC-SHA-256 of
   the full encoded token under an env-bound signing key). No
   intermediate buffer of the full token is retained.
4. **Env-bound signing key, no fallback synthesis.** The HMAC
   signing key is read at module-boundary time from
   `ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY` through a
   `Schema.NonEmptyString` boundary decode. A missing or empty
   value refuses to construct the service runner with a typed
   error. The variable is added to `.env.example` and the
   platform env catalog in the same commit that introduces the
   env reader.

The module ships with a typed audit-action family (`issued`,
`revoked`, `listed`, `usedSuccess`, `usedFailure`), a two-entry
reason catalog, two projection profiles (`admin-owner-list`,
`admin-owner-detail`), the field-security classifications above,
two config keys (default + max expiry hours), and one feature flag
(`admin-operator-test-tokens.enabled`). Full surface is documented
in `specs/02-modules/access/admin-operator-test-tokens/spec.md`.

## Alternatives considered

1. **Extend `identity-session` to issue non-Keycloak automation
   tokens.** Rejected. `identity-session` is intentionally
   user-bound and Keycloak-shaped; bolting a non-Keycloak
   credential issuer onto it muddies its trusted-session contract,
   creates a non-Keycloak path to a trusted session, and breaks
   the MFA and federation invariants documented in
   `specs/02-modules/access/identity-session/manifest.md`.
2. **Extend `admin-operator-management` with a credential
   subresource.** Rejected. `admin-operator-management` owns
   human-operator staffing. Adding non-human credential issuance
   would conflate two distinct ownership concerns, force its
   audit shape to grow a separate event family, and obscure the
   `admin-owner`-only floor needed here behind its broader
   role-based authorization surface.
3. **Per-operator API keys through `webhooks-api-access`.**
   Rejected. `webhooks-api-access` is tenant-scoped, optimised
   for external integration callers, and does not gate on
   admin-org `admin-owner`. Reusing it would force
   `webhooks-api-access` to grow an internal-only admin-org-aware
   issuance path and would dilute its current
   "external-integration credential store" semantics.
4. **No first-party module — use raw Keycloak service accounts
   created out-of-band.** Rejected. That route is unaudited
   inside the platform, has no first-party reason-catalog gate,
   has no first-party retention or rotation runbook, and cannot
   surface in `/admin/tokens`. It also reintroduces shell-script
   credential staffing for first-party automation, which ADR-023
   explicitly eliminated for human operators.

## Consequences

Positive:

- The Phase 7 `/admin/tokens` surface unblocks against a
  spec-grounded module rather than ad hoc credential issuance.
- First-party automation and test harnesses get a first-class,
  audited, revocable credential path without a Keycloak session.
- The hard `admin-owner` floor and `breakGlassAllowed = false`
  contract keep the surface narrow and reviewable.
- The hash-only secret-at-rest discipline reuses the same shape
  already validated for `webhooks-api-access` API keys.

Negative / accepted trade-offs:

- New module surface: manifest, contracts, drizzle schema,
  service, helpers, HTTP wiring (read-only list, mutation
  routes), reason-catalog entries, audit-action constants, tests,
  tracker entry, runbook for signing-key rotation.
- New required env variable
  (`ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY`) that operators must
  provision per environment. Documented in `.env.example` and the
  platform env catalog under `04-ops/runbooks/`.
- Signing-key rotation invalidates all outstanding tokens; the
  rotation runbook must coordinate revoke-and-reissue with
  consumers.

## References

- `specs/02-modules/access/admin-operator-test-tokens/spec.md`
- `specs/02-apps/admin-app/implementation-plan.md` §8.18, §9
- ADR-022: Admin Operator Desk Shell
- ADR-023: Admin Organization Membership
- ADR-019: Keycloak-backed Convex Identity Execution
- ADR-020: Keycloak Support Impersonation Token Exchange
- `specs/02-modules/access/identity-session/manifest.md`
- `specs/02-modules/communication/webhooks-api-access/api-key-lifecycle.md`
