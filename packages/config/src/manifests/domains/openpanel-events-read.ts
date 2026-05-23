/**
 * OpenPanel events read module manifest (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch B vendor #4).
 *
 * Three platform-scope config keys back the owner-locked
 * invariants the platform service enforces above the upstream
 * OpenPanel API:
 *
 *   - `cacheMaxSize` (default 256) bounds the in-memory
 *     per-`(tenant, kind, key)` event cache; oldest-eviction is
 *     enforced (backend instructions security invariant #5).
 *   - `snapshotCacheTtlSeconds` (default 60) bounds freshness for
 *     cached events; stale entries trigger a live re-fetch against
 *     the OpenPanel API.
 *   - `defaultListLimit` (default 25) caps `listByProject` /
 *     `listByEventName` result sizes when the caller omits an
 *     explicit limit.
 *
 * Field classifications: `userId`, `sessionId`, and `properties`
 * are `tenant-confidential` because OpenPanel analytics events
 * routinely carry PII-bearing attributes (per-visitor identifiers
 * and arbitrary product attributes). The remaining columns
 * (`eventId`, `projectId`, `eventName`, `occurredAt`, `country`,
 * `path`) are `internal`.
 *
 * Two projection profiles are published to enforce defense in
 * depth on top of field-security at the read boundary:
 *
 *   - `summary` masks the PII-bearing tenant-confidential columns
 *     (`userId` / `sessionId` / `properties`) and surfaces the
 *     remaining headline columns (`eventId`, `projectId`,
 *     `eventName`, `occurredAt`, `country`, `path`).
 *   - `supportSafe` masks the PII-bearing columns AND drops `path`
 *     (which can embed identifiers in URL segments). Support
 *     operators see only the safest analytic shape: event
 *     identifier, project, event name, when, and country.
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  openPanelEventsReadConfigKey,
  openPanelEventsReadFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const openPanelEventsReadFields = defineModuleFields({
  eventId: "eventId",
  projectId: "projectId",
  eventName: "eventName",
  occurredAt: "occurredAt",
  userId: "userId",
  sessionId: "sessionId",
  properties: "properties",
  country: "country",
  path: "path",
});

export const openPanelEventsReadFieldClassifications =
  defineDataClassificationDeclarations(openPanelEventsReadFields, [
    {
      field: openPanelEventsReadFields.eventId,
      classification: dataClassification.internal,
    },
    {
      field: openPanelEventsReadFields.projectId,
      classification: dataClassification.internal,
    },
    {
      field: openPanelEventsReadFields.eventName,
      classification: dataClassification.internal,
    },
    {
      field: openPanelEventsReadFields.occurredAt,
      classification: dataClassification.internal,
    },
    {
      field: openPanelEventsReadFields.userId,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: openPanelEventsReadFields.sessionId,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: openPanelEventsReadFields.properties,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: openPanelEventsReadFields.country,
      classification: dataClassification.internal,
    },
    {
      field: openPanelEventsReadFields.path,
      classification: dataClassification.internal,
    },
  ]);

export const openPanelEventsReadManifest = defineModuleManifest({
  moduleId: platformModuleId.openPanelEventsRead,
  configKeys: [
    {
      key: openPanelEventsReadConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory per-(tenant, kind, key) OpenPanel event cache used by the read path. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.openPanelEventsRead,
    },
    {
      key: openPanelEventsReadConfigKey.snapshotCacheTtlSeconds,
      description:
        "Bound on cached OpenPanel event freshness (seconds). Stale entries trigger a live re-fetch against the OpenPanel API.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.openPanelEventsRead,
    },
    {
      key: openPanelEventsReadConfigKey.defaultListLimit,
      description:
        "Default cap on listByProject / listByEventName result sizes when the caller omits an explicit limit.",
      schema: configSchemaType.number,
      defaultValue: 25,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.openPanelEventsRead,
    },
  ],
  featureFlags: [
    {
      key: openPanelEventsReadFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.openPanelEventsRead,
      purpose: "Gate the read-only OpenPanel events operator console surface.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the admin console renders the surface end-to-end against live OpenPanel credentials with audit-trail evidence.",
    },
  ],
  permissionScopes: [permissionScope.openPanelEventsRead],
  fieldClassifications: openPanelEventsReadFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(openPanelEventsReadFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        openPanelEventsReadFields.eventId,
        openPanelEventsReadFields.projectId,
        openPanelEventsReadFields.eventName,
        openPanelEventsReadFields.occurredAt,
        openPanelEventsReadFields.country,
        openPanelEventsReadFields.path,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        openPanelEventsReadFields.eventId,
        openPanelEventsReadFields.projectId,
        openPanelEventsReadFields.eventName,
        openPanelEventsReadFields.occurredAt,
        openPanelEventsReadFields.country,
      ],
      auditedFields: [],
    },
  ]),
});
