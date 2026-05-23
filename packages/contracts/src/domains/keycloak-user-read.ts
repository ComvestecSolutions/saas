/**
 * Keycloak user read contracts per admin-app implementation plan
 * §9 item 10 (per-vendor read helpers — batch A vendor #1).
 *
 * Read-only operator console surface that gives the admin app a
 * typed, audited, redaction-aware view over Keycloak's admin user
 * record without giving operators a mutation surface against the
 * upstream identity provider. The slice mirrors the canonical
 * polar-revenue-projection / open-meter-usage-query template
 * EXCEPT that there is NO persistence — the read path always
 * recomputes against the live Keycloak admin API and is fronted by
 * an in-memory snapshot cache bounded by `cacheMaxSize` with
 * `snapshotCacheTtlSeconds` freshness.
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service):
 *
 *   - **Read-only surface**: only `getById`, `listByEmail`,
 *     `listByUsername` are exposed. There is no mutation surface.
 *   - **Operator-only authz**: read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`;
 *     anonymous actors are rejected with
 *     `KeycloakUserReadUnauthorized`.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.keycloakUserRead`.
 *   - **Audit emission**: every successful read appends ONE
 *     `keycloakUserReadAuditAction.readPerformed` event keyed by
 *     `platformModuleId.keycloakUserRead`.
 *   - **Field classification**: `email`, `firstName`, `lastName`
 *     → `tenant-confidential`; `userId`, `username`, `realm`,
 *     `enabled`, `emailVerified`, `createdAt`, `requiredActions` →
 *     `internal`; `lastLogin` → `derived-analytics`.
 *
 * Naming note: distinct from the existing Keycloak adapter
 * (`packages/platform/src/adapters/identity/keycloak.ts`) which
 * owns wire-level login / session / impersonation primitives. This
 * module is a read-only operator-console projection over the admin
 * user record and does not re-implement those primitives. The
 * platform service reuses `platformAdapterServiceName.keycloak`
 * end-to-end — NO new adapter literal is introduced.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Target tenant (mirrors the rest of the platform tenant addressing)
// ---------------------------------------------------------------------------

export const KeycloakUserReadTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type KeycloakUserReadTargetTenant = Schema.Schema.Type<
  typeof KeycloakUserReadTargetTenantSchema
>;

// ---------------------------------------------------------------------------
// Per-user summary projection
// ---------------------------------------------------------------------------

export const KeycloakUserSummarySchema = Schema.Struct({
  userId: Schema.NonEmptyString,
  username: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  firstName: Schema.optional(Schema.NonEmptyString),
  lastName: Schema.optional(Schema.NonEmptyString),
  enabled: Schema.Boolean,
  emailVerified: Schema.Boolean,
  createdAt: IsoTimestampSchema,
  lastLogin: Schema.optional(IsoTimestampSchema),
  requiredActions: Schema.Array(Schema.NonEmptyString),
  realm: Schema.NonEmptyString,
});

export type KeycloakUserSummary = Schema.Schema.Type<
  typeof KeycloakUserSummarySchema
>;

export const KeycloakUserSummaryListSchema = Schema.Array(
  KeycloakUserSummarySchema,
);

export type KeycloakUserSummaryList = Schema.Schema.Type<
  typeof KeycloakUserSummaryListSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const KeycloakUserReadLimitSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThan(0),
  Schema.lessThanOrEqualTo(200),
);

export const KeycloakUserGetByIdInputSchema = Schema.Struct({
  tenant: KeycloakUserReadTargetTenantSchema,
  userId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

export type KeycloakUserGetByIdInput = Schema.Schema.Type<
  typeof KeycloakUserGetByIdInputSchema
>;

export const KeycloakUserListByEmailInputSchema = Schema.Struct({
  tenant: KeycloakUserReadTargetTenantSchema,
  email: Schema.NonEmptyString,
  limit: Schema.optional(KeycloakUserReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type KeycloakUserListByEmailInput = Schema.Schema.Type<
  typeof KeycloakUserListByEmailInputSchema
>;

export const KeycloakUserListByUsernameInputSchema = Schema.Struct({
  tenant: KeycloakUserReadTargetTenantSchema,
  username: Schema.NonEmptyString,
  limit: Schema.optional(KeycloakUserReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type KeycloakUserListByUsernameInput = Schema.Schema.Type<
  typeof KeycloakUserListByUsernameInputSchema
>;
