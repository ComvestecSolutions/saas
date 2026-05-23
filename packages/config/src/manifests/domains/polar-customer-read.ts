/**
 * Polar customer read module manifest (admin-app implementation
 * plan §9 item 10 — per-vendor read helpers, batch A vendor #2).
 *
 * Three platform-scope config keys back the owner-locked
 * invariants the platform service enforces above the upstream
 * Polar API:
 *
 *   - `cacheMaxSize` (default 256) bounds the in-memory
 *     per-`(tenant, kind, key)` customer-summary cache;
 *     oldest-eviction is enforced (backend instructions security
 *     invariant #5).
 *   - `snapshotCacheTtlSeconds` (default 60) bounds freshness for
 *     cached summaries; stale entries trigger a live re-fetch
 *     against the Polar API.
 *   - `defaultListLimit` (default 25) caps `listByEmail` /
 *     `listByExternalId` result sizes when the caller omits an
 *     explicit limit.
 *
 * Field classifications mirror the spec in admin-app implementation
 * plan §9 item 10:
 *
 *   - `email`, `name`, `billingAddress` → `tenant-confidential`.
 *   - `customerId`, `externalId`, `createdAt` → `internal`.
 *   - `totalSpendCents`, `subscriptionCount` → `derived-analytics`.
 *
 * Two projection profiles are published: `summary` masks the
 * tenant-confidential PII columns (operator console list view) and
 * `supportSafe` exposes them for the support-operator detail view
 * with the PII fields explicitly audited.
 */
import {
  configSchemaType,
  dataClassification,
  defineDataClassificationDeclarations,
  defineModuleFields,
  defineProjectionDescriptors,
  featureFlagLifecycle,
  permissionScope,
  platformModuleId,
  platformScope,
  polarCustomerReadConfigKey,
  polarCustomerReadFeatureFlag,
  projectionProfile,
} from "@comvestec/contracts";
import { defineModuleManifest } from "../../manifest-helpers";

export const polarCustomerReadFields = defineModuleFields({
  customerId: "customerId",
  externalId: "externalId",
  email: "email",
  name: "name",
  billingAddress: "billingAddress",
  createdAt: "createdAt",
  totalSpendCents: "totalSpendCents",
  subscriptionCount: "subscriptionCount",
});

export const polarCustomerReadFieldClassifications =
  defineDataClassificationDeclarations(polarCustomerReadFields, [
    {
      field: polarCustomerReadFields.customerId,
      classification: dataClassification.internal,
    },
    {
      field: polarCustomerReadFields.externalId,
      classification: dataClassification.internal,
    },
    {
      field: polarCustomerReadFields.email,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: polarCustomerReadFields.name,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: polarCustomerReadFields.billingAddress,
      classification: dataClassification.tenantConfidential,
    },
    {
      field: polarCustomerReadFields.createdAt,
      classification: dataClassification.internal,
    },
    {
      field: polarCustomerReadFields.totalSpendCents,
      classification: dataClassification.derivedAnalytics,
    },
    {
      field: polarCustomerReadFields.subscriptionCount,
      classification: dataClassification.derivedAnalytics,
    },
  ]);

export const polarCustomerReadManifest = defineModuleManifest({
  moduleId: platformModuleId.polarCustomerRead,
  configKeys: [
    {
      key: polarCustomerReadConfigKey.cacheMaxSize,
      description:
        "Bound on the in-memory per-(tenant, kind, key) Polar customer-summary cache used by the read path. Enforces oldest-eviction (security invariant #5).",
      schema: configSchemaType.number,
      defaultValue: 256,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.polarCustomerRead,
    },
    {
      key: polarCustomerReadConfigKey.snapshotCacheTtlSeconds,
      description:
        "Bound on cached Polar customer-summary freshness (seconds). Stale entries trigger a live re-fetch against the Polar API.",
      schema: configSchemaType.number,
      defaultValue: 60,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.polarCustomerRead,
    },
    {
      key: polarCustomerReadConfigKey.defaultListLimit,
      description:
        "Default cap on listByEmail / listByExternalId result sizes when the caller omits an explicit limit.",
      schema: configSchemaType.number,
      defaultValue: 25,
      billable: false,
      allowedScopes: [platformScope.platform],
      owner: platformModuleId.polarCustomerRead,
    },
  ],
  featureFlags: [
    {
      key: polarCustomerReadFeatureFlag.enabled,
      description: "Module visibility.",
      owner: platformModuleId.polarCustomerRead,
      purpose:
        "Gate the read-only Polar customer-read operator console surface.",
      defaultEnabled: false,
      billable: false,
      allowedScopes: [platformScope.platform],
      dependencies: [],
      lifecycle: featureFlagLifecycle.active,
      retirementPlan:
        "Promote to default once the admin console renders the surface end-to-end against live Polar credentials with audit-trail evidence.",
    },
  ],
  permissionScopes: [permissionScope.polarCustomerRead],
  fieldClassifications: polarCustomerReadFieldClassifications,
  projectionProfiles: defineProjectionDescriptors(polarCustomerReadFields, [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        polarCustomerReadFields.customerId,
        polarCustomerReadFields.externalId,
        polarCustomerReadFields.createdAt,
        polarCustomerReadFields.totalSpendCents,
        polarCustomerReadFields.subscriptionCount,
      ],
      auditedFields: [],
    },
    {
      profile: projectionProfile.supportSafe,
      visibleFields: [
        polarCustomerReadFields.customerId,
        polarCustomerReadFields.externalId,
        polarCustomerReadFields.email,
        polarCustomerReadFields.name,
        polarCustomerReadFields.billingAddress,
        polarCustomerReadFields.createdAt,
        polarCustomerReadFields.totalSpendCents,
        polarCustomerReadFields.subscriptionCount,
      ],
      auditedFields: [
        polarCustomerReadFields.email,
        polarCustomerReadFields.name,
        polarCustomerReadFields.billingAddress,
      ],
    },
  ]),
});
