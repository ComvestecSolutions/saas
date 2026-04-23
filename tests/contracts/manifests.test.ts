import { Schema } from "effect";
import {
  billingEnforcementMode,
  ModuleConfigManifestSchema,
  permissionScope,
  platformModuleId,
  projectionProfile,
} from "@comvestec/contracts";
import {
  billingAndMeteringConfigKey,
  billingAndMeteringFeatureFlag,
  platformModuleManifests,
  runtimeConfigFields,
  tenantBrandingFieldClassifications,
  tenantBrandingFeatureFlag,
  tenantBrandingFields,
  tenantManagementFieldClassifications,
  tenantManagementFields,
  tenantManagementConfigKey,
  tenantManagementFeatureFlag,
} from "@comvestec/config";

describe("contract manifests", () => {
  it("keeps module manifests schema-valid", () => {
    const manifest = Schema.decodeUnknownSync(ModuleConfigManifestSchema)(
      platformModuleManifests[0],
    );
    expect(manifest.moduleId).toBe(platformModuleId.tenantManagement);
  });

  it("registers the tenant-branding module in shared manifests", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.tenantBranding,
    );

    expect(manifest).toBeDefined();
    expect(manifest?.permissionScopes).toContain(
      permissionScope.brandingManage,
    );
    expect(manifest?.featureFlags.map((flag) => flag.key)).toEqual(
      expect.arrayContaining([
        tenantBrandingFeatureFlag.enabled,
        tenantBrandingFeatureFlag.customDomain,
        tenantBrandingFeatureFlag.brandedEmails,
      ]),
    );
    expect(manifest?.fieldClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining(
          tenantBrandingFieldClassifications.find(
            (classification) =>
              classification.field === tenantBrandingFields.replyToEmail,
          ),
        ),
      ]),
    );
  });

  it("keeps tenant-management billing email classified as regulated-sensitive", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.tenantManagement,
    );

    expect(manifest).toBeDefined();
    expect(manifest?.fieldClassifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining(
          tenantManagementFieldClassifications.find(
            (classification) =>
              classification.field === tenantManagementFields.billingEmail,
          ),
        ),
      ]),
    );
  });

  it("rejects unknown module ids in shared manifests", () => {
    expect(() =>
      Schema.decodeUnknownSync(ModuleConfigManifestSchema)({
        moduleId: "not-a-real-module",
        configKeys: [],
        featureFlags: [],
        permissionScopes: [permissionScope.tenantRead],
        fieldClassifications: [],
        projectionProfiles: [],
      }),
    ).toThrow();
  });

  it("decodes a scoped config key declaration", () => {
    const manifest = Schema.decodeUnknownSync(ModuleConfigManifestSchema)({
      moduleId: platformModuleId.tenantManagement,
      configKeys: [
        {
          key: tenantManagementConfigKey.membershipInviteExpiryHours,
          description: "Hours before an invite expires.",
          schema: "number",
          defaultValue: 72,
          billable: false,
          allowedScopes: ["platform", "enterprise", "organization"],
          owner: platformModuleId.tenantManagement,
        },
      ],
      featureFlags: [
        {
          key: tenantManagementFeatureFlag.enterpriseHierarchy,
          description: "Multi-org enterprise hierarchy.",
          owner: platformModuleId.tenantManagement,
          purpose: "Allow enterprises with multiple orgs.",
          defaultEnabled: false,
          billable: true,
          allowedScopes: ["platform", "enterprise"],
          retirementPlan: "None — permanent feature gate.",
        },
      ],
      permissionScopes: [
        permissionScope.tenantRead,
        permissionScope.tenantWrite,
      ],
      fieldClassifications: [],
      projectionProfiles: [],
    });

    expect(manifest.configKeys[0]!.key).toBe(
      tenantManagementConfigKey.membershipInviteExpiryHours,
    );
    expect(manifest.featureFlags[0]!.billable).toBe(true);
  });

  it("keeps the billing manifest aligned with flexible plan composition defaults", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.billingAndMetering,
    );

    expect(manifest).toBeDefined();
    expect(manifest?.configKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: billingAndMeteringConfigKey.usageEnforcementMode,
          defaultValue: billingEnforcementMode.observe,
        }),
      ]),
    );
    expect(
      manifest?.projectionProfiles.map((profile) => profile.profile),
    ).toEqual(
      expect.arrayContaining([
        projectionProfile.billing,
        projectionProfile.admin,
        projectionProfile.summary,
      ]),
    );
    expect(manifest?.featureFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: billingAndMeteringFeatureFlag.apiRequests,
        }),
      ]),
    );
  });

  it("keeps the runtime-config admin projection aligned with governance read views", () => {
    const manifest = platformModuleManifests.find(
      (candidate) => candidate.moduleId === platformModuleId.runtimeConfig,
    );
    const adminProjection = manifest?.projectionProfiles.find(
      (profile) => profile.profile === projectionProfile.admin,
    );
    const classifiedFields = manifest?.fieldClassifications.map(
      (classification) => classification.field,
    );

    expect(adminProjection).toBeDefined();
    expect(classifiedFields).not.toContain("effectiveValue");
    expect(adminProjection?.visibleFields).toEqual([
      runtimeConfigFields.moduleId,
      runtimeConfigFields.key,
      runtimeConfigFields.scope,
      runtimeConfigFields.scopeId,
      runtimeConfigFields.value,
      runtimeConfigFields.source,
      runtimeConfigFields.changedBy,
      runtimeConfigFields.changedAt,
      runtimeConfigFields.approvalReason,
      runtimeConfigFields.proposalId,
      runtimeConfigFields.action,
      runtimeConfigFields.artifactPath,
      runtimeConfigFields.runtimeValue,
      runtimeConfigFields.codeValue,
      runtimeConfigFields.status,
      runtimeConfigFields.generatedAt,
    ]);
    expect(adminProjection?.auditedFields).toEqual([
      runtimeConfigFields.value,
      runtimeConfigFields.approvalReason,
      runtimeConfigFields.runtimeValue,
      runtimeConfigFields.codeValue,
    ]);
  });
});
