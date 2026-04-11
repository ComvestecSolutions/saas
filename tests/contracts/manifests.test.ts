import { Schema } from "effect";
import {
  ModuleConfigManifestSchema,
  permissionScope,
  platformModuleId,
} from "@comvestec/contracts";
import {
  platformModuleManifests,
  tenantBrandingFieldClassifications,
  tenantBrandingFeatureFlag,
  tenantBrandingFields,
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
});
