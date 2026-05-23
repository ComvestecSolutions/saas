/**
 * OpenPanel events read contracts per admin-app implementation
 * plan §9 item 10 (per-vendor read helpers — batch B vendor #4).
 *
 * Read-only operator console surface that gives the admin app a
 * typed, audited, redaction-aware view over OpenPanel's per-event
 * record without giving operators a mutation surface against the
 * upstream analytics provider. The slice mirrors the canonical
 * glitchtip-issues-read / postal-mail-log-read / novu-deliveries-read
 * template EXACTLY: there is NO persistence — the read path always
 * recomputes against the live OpenPanel API and is fronted by an
 * in-memory snapshot cache bounded by `cacheMaxSize` with
 * `snapshotCacheTtlSeconds` freshness.
 *
 * Owner-locked invariants this contract supports (enforced in the
 * platform service):
 *
 *   - **Read-only surface**: only `getById`, `listByProject`,
 *     `listByEventName` are exposed. There is no mutation surface.
 *   - **Operator-only authz**: read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`;
 *     anonymous actors are rejected with
 *     `OpenPanelEventsReadUnauthorized`.
 *   - **Reason catalog**: every read decodes its `reasonCatalogId`
 *     against `ReasonCatalogIdSchema`; the only catalog id allowed
 *     for this slice is `reasonCatalogId.openPanelEventsRead`.
 *   - **Audit emission**: every successful read appends ONE
 *     `openPanelEventsReadAuditAction.readPerformed` event keyed
 *     by `platformModuleId.openPanelEventsRead`.
 *   - **Field classification**: `userId` / `sessionId` /
 *     `properties` are `tenant-confidential` (PII-bearing analytics
 *     attributes); the remaining columns are `internal`.
 *
 * Naming note: this module is a read-only operator-console
 * projection over the OpenPanel event record and reuses
 * `platformAdapterServiceName.openpanel` end-to-end — NO new
 * adapter literal is introduced.
 */
import { Schema } from "effect";
import { IsoTimestampSchema } from "../runtime/timestamps";
import { PlatformScopeSchema } from "../access/platform-scopes";

// ---------------------------------------------------------------------------
// Target tenant
// ---------------------------------------------------------------------------

export const OpenPanelEventsReadTargetTenantSchema = Schema.Struct({
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type OpenPanelEventsReadTargetTenant = Schema.Schema.Type<
  typeof OpenPanelEventsReadTargetTenantSchema
>;

// ---------------------------------------------------------------------------
// Per-event projection
// ---------------------------------------------------------------------------

export const OpenPanelEventSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  eventName: Schema.NonEmptyString,
  occurredAt: IsoTimestampSchema,
  userId: Schema.optional(Schema.NonEmptyString),
  sessionId: Schema.optional(Schema.NonEmptyString),
  properties: Schema.NonEmptyString,
  country: Schema.optional(Schema.NonEmptyString),
  path: Schema.optional(Schema.NonEmptyString),
});

export type OpenPanelEvent = Schema.Schema.Type<typeof OpenPanelEventSchema>;

export const OpenPanelEventListSchema = Schema.Array(OpenPanelEventSchema);

export type OpenPanelEventList = Schema.Schema.Type<
  typeof OpenPanelEventListSchema
>;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const OpenPanelEventsReadLimitSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThan(0),
  Schema.lessThanOrEqualTo(200),
);

export const OpenPanelEventGetByIdInputSchema = Schema.Struct({
  tenant: OpenPanelEventsReadTargetTenantSchema,
  eventId: Schema.NonEmptyString,
  reasonCatalogId: Schema.NonEmptyString,
});

export type OpenPanelEventGetByIdInput = Schema.Schema.Type<
  typeof OpenPanelEventGetByIdInputSchema
>;

export const OpenPanelEventListByProjectInputSchema = Schema.Struct({
  tenant: OpenPanelEventsReadTargetTenantSchema,
  projectId: Schema.NonEmptyString,
  limit: Schema.optional(OpenPanelEventsReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type OpenPanelEventListByProjectInput = Schema.Schema.Type<
  typeof OpenPanelEventListByProjectInputSchema
>;

export const OpenPanelEventListByEventNameInputSchema = Schema.Struct({
  tenant: OpenPanelEventsReadTargetTenantSchema,
  eventName: Schema.NonEmptyString,
  limit: Schema.optional(OpenPanelEventsReadLimitSchema),
  reasonCatalogId: Schema.NonEmptyString,
});

export type OpenPanelEventListByEventNameInput = Schema.Schema.Type<
  typeof OpenPanelEventListByEventNameInputSchema
>;
