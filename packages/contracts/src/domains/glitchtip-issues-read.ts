/**
 * GlitchTip issues read contracts per admin-app implementation
 * plan §9 item 10 (per-vendor read helpers — batch B vendor #3).
 *
 * Read-only operator console surface that gives the admin app a
 * typed, audited, redaction-aware view over GlitchTip's per-issue
 * record without giving operators a mutation surface against the
 * upstream error-tracking provider. The slice mirrors the
 * canonical postal-mail-log-read / novu-deliveries-read /
 * open-meter-meter-read template EXACTLY: there is NO
 * persistence — the read path always recomputes against the live
 * GlitchTip API and is fronted by an in-memory snapshot cache
 * bounded by `cacheMaxSize` with `snapshotCacheTtlSeconds`
 * freshness.
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service):
 *
 *   - **Read-only surface**: only `getById`, `listByProject`,
 *     `listByLevel` are exposed. There is no mutation surface.
 *   - **Operator-only authz**: read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`;
 *     anonymous actors are rejected with
 *     `GlitchTipIssuesReadUnauthorized`.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.glitchTipIssuesRead`.
 *   - **Audit emission**: every successful read appends ONE
 *     `glitchTipIssuesReadAuditAction.readPerformed` event keyed
 *     by `platformModuleId.glitchTipIssuesRead`.
 *   - **Field classification**: every field is `internal`; no
 *     tenant-confidential or secret fields ship in this projection.
 *
 * Naming note: this module is a read-only operator-console
 * projection over the GlitchTip issue record and reuses
 * `platformAdapterServiceName.glitchtip` end-to-end — NO new
 * adapter literal is introduced.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Target tenant
// ---------------------------------------------------------------------------

export const GlitchTipIssuesReadTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type GlitchTipIssuesReadTargetTenant = Schema.Schema.Type<
  typeof GlitchTipIssuesReadTargetTenantSchema
>;

// ---------------------------------------------------------------------------
// Per-issue projection
// ---------------------------------------------------------------------------

export const GlitchTipIssueLevelSchema = Schema.Literal(
  "fatal",
  "error",
  "warning",
  "info",
  "debug",
);

export type GlitchTipIssueLevel = Schema.Schema.Type<
  typeof GlitchTipIssueLevelSchema
>;

export const GlitchTipIssueStatusSchema = Schema.Literal(
  "unresolved",
  "resolved",
  "ignored",
);

export type GlitchTipIssueStatus = Schema.Schema.Type<
  typeof GlitchTipIssueStatusSchema
>;

export const GlitchTipIssueSchema = Schema.Struct({
  issueId: Schema.NonEmptyString,
  projectSlug: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  level: GlitchTipIssueLevelSchema,
  culprit: Schema.NonEmptyString,
  firstSeenAt: IsoTimestampSchema,
  lastSeenAt: IsoTimestampSchema,
  eventCount: Schema.Number,
  userCount: Schema.Number,
  status: GlitchTipIssueStatusSchema,
  permalink: Schema.optional(Schema.NonEmptyString),
});

export type GlitchTipIssue = Schema.Schema.Type<typeof GlitchTipIssueSchema>;

export const GlitchTipIssueListSchema = Schema.Array(GlitchTipIssueSchema);

export type GlitchTipIssueList = Schema.Schema.Type<
  typeof GlitchTipIssueListSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const GlitchTipIssuesReadLimitSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThan(0),
  Schema.lessThanOrEqualTo(200),
);

export const GlitchTipIssueGetByIdInputSchema = Schema.Struct({
  tenant: GlitchTipIssuesReadTargetTenantSchema,
  issueId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

export type GlitchTipIssueGetByIdInput = Schema.Schema.Type<
  typeof GlitchTipIssueGetByIdInputSchema
>;

export const GlitchTipIssueListByProjectInputSchema = Schema.Struct({
  tenant: GlitchTipIssuesReadTargetTenantSchema,
  projectSlug: Schema.NonEmptyString,
  limit: Schema.optional(GlitchTipIssuesReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type GlitchTipIssueListByProjectInput = Schema.Schema.Type<
  typeof GlitchTipIssueListByProjectInputSchema
>;

export const GlitchTipIssueListByLevelInputSchema = Schema.Struct({
  tenant: GlitchTipIssuesReadTargetTenantSchema,
  level: GlitchTipIssueLevelSchema,
  limit: Schema.optional(GlitchTipIssuesReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type GlitchTipIssueListByLevelInput = Schema.Schema.Type<
  typeof GlitchTipIssueListByLevelInputSchema
>;
