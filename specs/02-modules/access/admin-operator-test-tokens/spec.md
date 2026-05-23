# Admin Operator Test Tokens Module Spec

Status: accepted

Last updated: 2026-05-17

## Purpose

Provide an **owner-only**, audit-logged, plaintext-once-on-issue token
issuance surface for first-party automation and test harnesses that
need to drive the admin-app and platform-owned HTTP surfaces without
holding an interactive Keycloak session.

This module exists because:

1. `identity-session` owns interactive Keycloak-backed sessions, MFA,
   federation, and trusted-session bearer transport. It is **not** a
   substitute for an automation token, and its session lifetimes,
   refresh contract, and audit shape are user-bound.
2. `admin-operator-management` owns operator staffing, role
   assignment, and admin-org membership lifecycle for human
   operators inside the admin organization. It is **not** a
   credential issuer for non-human first-party automation actors.
3. `webhooks-api-access` owns durable, tenant-scoped, hash-only API
   keys for external integrations. It is **not** an internal
   first-party operator-automation token surface and does not gate
   on `admin-owner` membership.

This module fills the explicit gap: an internal, owner-only,
short-lived token surface for first-party automation and test harness
actors, with the same hash-only secret-at-rest discipline used by
`webhooks-api-access` and the same audit and reason-catalog gating
used by `manual-break-glass`.

## Non-Goals

1. Issuing tokens to external integrations or third-party tenants.
2. Replacing `identity-session` bearer tokens for interactive
   operator sessions.
3. Replacing `admin-operator-management` for human operator staffing.
4. Acting as a long-lived service-account credential store.

## Data Ownership

PostgreSQL-backed and durable, owned by the new module
`admin-operator-test-tokens` under
`packages/modules/src/access/`. Drizzle schema lives beside the
existing admin-organization tables and is governed by the same
`packages/drizzle/` migration discipline.

Two tables:

- `admin_operator_test_tokens` — `id`, `tokenPrefix`, `tokenHash`,
  `issuedBy` (Keycloak subject id of the issuing `admin-owner`),
  `issuedAt`, `expiresAt`, `revokedAt`, `revokedBy`, `label`,
  `lastUsedAt`, `lastUsedOutcome` (enum: `success` | `failure`),
  `archivedAt`.
- `admin_operator_test_token_usage_events` — append-only ring
  bounded to the most recent N events per token, retained for audit
  correlation only; long-term usage history lives in the central
  audit log.

Plaintext tokens are **never** persisted. Only `tokenPrefix`
(non-secret correlator) and `tokenHash` (HMAC of the full token
under the env-bound signing key) are written.

## Threat Model

| Threat                                                    | Mitigation                                                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-owner operator issues an automation token             | Service-level hard floor on `admin-owner`; reason-catalog `minimumActorClass = admin-owner`; no break-glass override path on issue.                                 |
| Token plaintext leaks via persistence layer               | Only `tokenPrefix` and HMAC `tokenHash` persisted; plaintext returned exactly once at issue and never re-derivable.                                                 |
| Token plaintext leaks via list/detail/audit projections   | `tokenPrefix` field classification is `secret` and is `RevealField`-gated; all other fields are `internal` or lower; audit event payloads carry prefix only.        |
| HMAC key rotation invalidates outstanding tokens silently | Signing key sourced from a required `NonEmptyString` env value at module boundary; key rotation runbook revokes-and-reissues; no fallback synthesis.                |
| Stolen token used after revocation                        | Revoke writes `revokedAt`; usage path rejects revoked tokens before any downstream call; usage rejection records a `usedFailure` audit event with reason `revoked`. |
| Stolen token used past intended lifetime                  | `expiresAt` mandatory at issue and clamped to a hard maximum lifetime ceiling; usage rejection records a `usedFailure` audit event with reason `expired`.           |
| Token issued without operator-justified reason            | Issue path requires `reasonCatalogId` + `reasonAttachmentText`; reason-catalog entry `minimumActorClass = admin-owner`, `requiresAttachmentText = true`.            |
| Cross-tenant or non-admin-org actor enumerates tokens     | List path gates on admin-org membership + `admin-owner` floor; non-owner readers receive a typed `AdminOperatorTestTokenReadAccessDeniedError`.                     |
| Replay of plaintext-reveal modal contents                 | Modal renders plaintext once from the issue mutation response; the response is never re-fetched; reload re-renders prefix only.                                     |

## Authorization

1. **Hard floor**: every operation requires `admin-owner` membership
   on the admin organization. The floor is enforced **inside** the
   `AdminOperatorTestTokensService`, not only at the route or
   reason-catalog level.
2. **No break-glass override**. The reason-catalog entry's
   `breakGlassAllowed` is `false`. There is no privileged escape
   hatch on top of this surface; if the owner seat is unavailable,
   the operator-bootstrap runbook is the only recovery path.
3. Reason catalog entries:
   - `admin-operator-test-tokens.issue` —
     `minimumActorClass = admin-owner`,
     `requiresAttachmentText = true`,
     `breakGlassAllowed = false`.
   - `admin-operator-test-tokens.revoke` —
     `minimumActorClass = admin-owner`,
     `requiresAttachmentText = false`,
     `breakGlassAllowed = false`.
4. Read-only `list` is permitted to `admin-owner` only. Other
   admin-org roles (`admin-admin`, `admin-operator`,
   `support-reviewer`, `billing-only`, `compliance`, `viewer`) are
   denied at the service boundary.

## Token Format

| Field        | Value                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prefix       | Literal `aott_` (admin-operator-test-token) + 8 chars from Crockford base32 (no `0/1/O/I`).                                                                                                  |
| Entropy body | 32 bytes of CSPRNG-derived entropy → 52 base32 chars (no padding).                                                                                                                           |
| Encoded form | `<prefix>_<body>`, total length 66 chars.                                                                                                                                                    |
| Charset      | Crockford base32; lowercase normalised at decode, uppercase at display.                                                                                                                      |
| Entropy bits | 256 bits in the body (32 bytes × 8).                                                                                                                                                         |
| Display      | Plaintext returned exactly **once** in the issue mutation response, rendered through `RevealField` inside a one-shot `<Dialog>` confirm-and-copy modal. Subsequent reads return prefix only. |

`tokenPrefix` is the persisted non-secret correlator: `aott_<8>`.
The hashing input is the **full** encoded token (prefix + body).

## Secret-at-Rest

1. Persisted: `tokenPrefix` (non-secret correlator) + `tokenHash`
   (HMAC-SHA-256 of full encoded token under env-bound signing key).
2. Not persisted: full encoded token, body, raw entropy bytes,
   intermediate buffers.
3. Verification: incoming token → derive HMAC under the same env
   key → constant-time equal against stored `tokenHash`.
4. Key rotation: changing the signing key invalidates all
   outstanding tokens. The operator runbook for key rotation is
   `04-ops/runbooks/admin-operator-test-tokens-key-rotation.md`
   (to be authored alongside the implementation slice).

## Env Boundary

| Variable                                 | Schema                  | Required | Fallback synthesis allowed |
| ---------------------------------------- | ----------------------- | -------- | -------------------------- |
| `ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY` | `Schema.NonEmptyString` | yes      | **no**                     |

1. Decoded at the module boundary using `Schema.decodeUnknown` on a
   schema-backed env reader.
2. Missing or empty value → typed
   `AdminOperatorTestTokensSigningKeyMissingError` raised at runner
   construction time; the service factory refuses to construct.
3. `.env.example` must include
   `ADMIN_OPERATOR_TEST_TOKENS_SIGNING_KEY=` (empty placeholder) in
   the same commit that introduces the env reader.
4. Operator docs under `04-ops/runbooks/` must list the variable in
   the platform env catalog before the implementation slice merges.

## Audit Actions

Audit events are written through the central `audit-log` module
under module id `admin-operator-test-tokens`.

| Action        | Trigger                                             | Payload (non-secret only)                                                                             |
| ------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `issued`      | Successful issue                                    | `tokenId`, `tokenPrefix`, `expiresAt`, `label`, `issuedBy`, `reasonCatalogId`, `reasonAttachmentText` |
| `revoked`     | Successful revoke                                   | `tokenId`, `tokenPrefix`, `revokedBy`, `reasonCatalogId`                                              |
| `listed`      | Successful list (paginated)                         | `count`, `actorId`                                                                                    |
| `usedSuccess` | Verification success on incoming request            | `tokenId`, `tokenPrefix`, `correlationId`                                                             |
| `usedFailure` | Verification failure (revoked / expired / mismatch) | `tokenPrefix`, `correlationId`, `failureReason` (enum)                                                |

No plaintext token, hash, or signing key material ever appears in an
audit payload.

## Reason Catalog

Two entries owned by this module, registered via the existing
reason-catalog manifest surface:

1. `admin-operator-test-tokens.issue`
   - `minimumActorClass`: `admin-owner`
   - `requiresAttachmentText`: `true`
   - `breakGlassAllowed`: `false`
   - `highRisk`: `true`
2. `admin-operator-test-tokens.revoke`
   - `minimumActorClass`: `admin-owner`
   - `requiresAttachmentText`: `false`
   - `breakGlassAllowed`: `false`
   - `highRisk`: `true`

## Retention

1. Active rows retained durably until `revokedAt` plus the default
   retention window owned by `retention-legal-hold`.
2. `archivedAt` set when a retention sweep moves the row out of the
   active set; archived rows remain queryable for audit
   correlation.
3. Audit events follow the standard `audit-log` retention policy and
   are never pruned ahead of the token row.

## Field Classification

| Field                                                                                                         | Classification                            |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `tokenPrefix`                                                                                                 | `secret`                                  |
| `tokenHash`                                                                                                   | `secret` (never projected to operator UI) |
| `id`, `label`, `issuedBy`, `issuedAt`, `expiresAt`, `revokedAt`, `revokedBy`, `lastUsedAt`, `lastUsedOutcome` | `internal`                                |
| `reasonCatalogId`, `reasonAttachmentText`                                                                     | `internal`                                |

`secret` fields are always redacted by default per `field-security`
and only revealed through the `RevealField` operator-confirmed
flow on the admin-app.

## Projection Profiles

| Profile              | Visible Fields                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `admin-owner-list`   | `id`, `tokenPrefix` (revealed), `label`, `issuedBy`, `issuedAt`, `expiresAt`, `revokedAt`, `lastUsedAt`, `lastUsedOutcome` |
| `admin-owner-detail` | All `admin-owner-list` fields plus `revokedBy`, `reasonCatalogId`, `reasonAttachmentText`                                  |

There is no `summary`, `support`, or `tenant` projection. All
non-`admin-owner` admin-org roles are denied at the service
boundary before projection occurs.

## Operator UX

1. `/admin/tokens` route renders a v2 `ScreenHeader` + KPI strip +
   `DenseDataTable` with `tokenPrefix` rendered through
   `RevealField`.
2. **Issue** CTA is gated through `HighRiskActionGuard` against the
   `admin-operator-test-tokens.issue` reason-catalog entry,
   requires `reasonAttachmentText`, and on success opens a
   one-shot plaintext-reveal `Dialog` with `RevealField` +
   copy-to-clipboard. The dialog cannot be re-opened once dismissed.
3. **Revoke** CTA is gated through `HighRiskActionGuard` against
   `admin-operator-test-tokens.revoke`, no attachment text
   required, immediate audit write.
4. Non-`admin-owner` operators see the `/admin/tokens` route render
   `StateScreen` in the `denied` state with the canonical recovery
   copy and correlation id.

## Module Manifest Surface

When the implementation slice lands:

1. Add `platformModuleId.adminOperatorTestTokens = "admin-operator-test-tokens"`
   to `packages/contracts/src/module-registry/modules.ts`.
2. Add a manifest declared through `defineModuleConfigKeys`,
   `defineModuleFeatureFlags`, `defineModuleFields`,
   `defineProjectionDescriptors`, and
   `defineDataClassificationDeclarations` with:
   - `moduleId` = `platformModuleId.adminOperatorTestTokens`
   - `owner` = `platformModuleId.adminOperatorTestTokens`
   - `permissionScopes`: a single owner-only scope
     `permissionScope.adminOperatorTestTokensManage`
   - One feature flag: `admin-operator-test-tokens.enabled`
     (`allowedScopes` = `[platformScope.platform]`, default `true`)
   - Two config keys (both `allowedScopes` = `[platformScope.platform]`):
     `admin-operator-test-tokens.token.defaultExpiryHours` (default `24`),
     `admin-operator-test-tokens.token.maxExpiryHours` (default `168`).
   - Field declarations covering the columns listed above with the
     classifications listed above.
   - Two projection profiles: `admin-owner-list` and
     `admin-owner-detail`, both pinned to
     `projectionProfile.adminOwnerOnly` (new profile constant).

## Rules

1. Service-level `admin-owner` floor is non-negotiable and
   enforced before any DB or audit call.
2. Plaintext tokens are returned exactly once and never persisted.
3. The signing key is required, env-bound, and not synthesised.
4. Every mutation writes an audit event using vocabulary constants
   from the module's exported action catalog.
5. `tokenPrefix` is `secret`-classified and `RevealField`-gated.
6. `/admin/tokens` operations route exclusively through the
   `AdminOperatorTestTokensService` — there is no admin-app helper
   that bypasses the service.

## References

- ADR-024: Admin Operator Test Tokens
- `specs/02-apps/admin-app/spec.md`
- `specs/02-apps/admin-app/implementation-plan.md` §8.18, §9
- ADR-022: Admin Operator Desk Shell
- ADR-023: Admin Organization Membership
- `specs/02-modules/access/identity-session/manifest.md`
- `specs/02-modules/communication/webhooks-api-access/api-key-lifecycle.md`
