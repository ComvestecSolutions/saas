/**
 * GlitchTip issues read module manifest (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch B vendor #3).
 *
 * Three platform-scope config keys back the owner-locked
 * invariants the platform service enforces above the upstream
 * GlitchTip API:
 *
 *   - `cacheMaxSize` (default 256) bounds the in-memory
 *     per-`(tenant, kind, key)` issue cache; oldest-eviction is
 *     enforced (backend instructions security invariant #5).
 *   - `snapshotCacheTtlSeconds` (default 60) bounds freshness for
 *     cached issues; stale entries trigger a live re-fetch against
 *     the GlitchTip API.
 *   - `defaultListLimit` (default 25) caps `listByProject` /
 *     `listByLevel` result sizes when the caller omits an explicit
 *     limit.
 *
 * Field classifications: every projected field is `internal`. The
 * GlitchTip issue projection deliberately excludes per-event
 * stacktraces, event bodies, and breadcrumbs because those can
 * carry tenant-confidential or secret payloads — the read helper
 * surfaces only the issue header (counts, timestamps, status,
 * culprit) which operators need to triage upstream incidents.
 *
 * One projection profile (`summary`) is published; the issue
 * header is operator-facing by default and no PII-bearing column
 * needs a separate `supportSafe` projection.
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  glitchTipIssuesReadConfigKey,
  glitchTipIssuesReadFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const glitchTipIssuesReadFields = defineModuleFields({
  issueId: "issueId",
  projectSlug: "projectSlug",
  title: "title",
  level: "level",
  culprit: "culprit",
  firstSeenAt: "firstSeenAt",
  lastSeenAt: "lastSeenAt",
  eventCount: "eventCount",
  userCount: "userCount",
  status: "status",
  permalink: "permalink",
});

export const glitchTipIssuesReadFieldClassifications =
  defineDataClassificationDeclarations(glitchTipIssuesReadFields, [
    {
      field: glitchTipIssuesReadFields.issueId,
      classification: dataClassification.internal,
    },
    {
      field: glitchTipIssuesReadFields.projectSlug,
      classification: dataClassification.internal,
    },
    {
      field: glitchTipIssuesReadFields.title,
      classification: dataClassification.internal,
    },
    {
      field: glitchTipIssuesReadFields.level,
      classification: dataClassification.internal,
    },
    {
      field: glitchTipIssuesReadFields.culprit,
      classification: dataClassification.internal,
    },
    {
      field: glitchTipIssuesReadFields.firstSeenAt,
      classification: dataClassification.internal,
    },
    {
      field: glitchTipIssuesReadFields.lastSeenAt,
      classification: dataClassification.internal,
    },
    {
      field: glitchTipIssuesReadFields.eventCount,
      classification: dataClassification.internal,
    },
    {
      field: glitchTipIssuesReadFields.userCount,
      classification: dataClassification.internal,
    },
    {
      field: glitchTipIssuesReadFields.status,
      classification: dataClassification.internal,
    },
    {
      field: glitchTipIssuesReadFields.permalink,
      classification: dataClassification.internal,
    },
  ]);

export const glitchTipIssuesReadManifest = defineModuleManifest({
  moduleId: platformModuleId.glitchTipIssuesRead,
  configKeys: [
    {
      key: glitchTipIssuesReadConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory per-(tenant, kind, key) GlitchTip issue cache used by the read path. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.glitchTipIssuesRead,
    },
    {
      key: glitchTipIssuesReadConfigKey.snapshotCacheTtlSeconds,
      description:
        "Bound on cached GlitchTip issue freshness (seconds). Stale entries trigger a live re-fetch against the GlitchTip API.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.glitchTipIssuesRead,
    },
    {
      key: glitchTipIssuesReadConfigKey.defaultListLimit,
      description:
        "Default cap on listByProject / listByLevel result sizes when the caller omits an explicit limit.",
      schema: configSchemaType.number,
      defaultValue: 25,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.glitchTipIssuesRead,
    },
  ],
  featureFlags: [
    {
      key: glitchTipIssuesReadFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.glitchTipIssuesRead,
      purpose: "Gate the read-only GlitchTip issues operator console surface.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the admin console renders the surface end-to-end against live GlitchTip credentials with audit-trail evidence.",
    },
  ],
  permissionScopes: [permissionScope.glitchTipIssuesRead],
  fieldClassifications: glitchTipIssuesReadFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(glitchTipIssuesReadFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        glitchTipIssuesReadFields.issueId,
        glitchTipIssuesReadFields.projectSlug,
        glitchTipIssuesReadFields.title,
        glitchTipIssuesReadFields.level,
        glitchTipIssuesReadFields.culprit,
        glitchTipIssuesReadFields.firstSeenAt,
        glitchTipIssuesReadFields.lastSeenAt,
        glitchTipIssuesReadFields.eventCount,
        glitchTipIssuesReadFields.userCount,
        glitchTipIssuesReadFields.status,
        glitchTipIssuesReadFields.permalink,
      ],
      auditedFields: [],
    },
  ]),
});
