/**
 * Admin-saved-views manifest tests (admin-app implementation
 * plan §9 item 2). Mirrors the admin-organization manifest test
 * shape so the stewardship checklist for typed manifest helpers,
 * platform-scoped config keys, and projection-profile boundary
 * decoding stays enforced.
 */
import { describe, expect, it } from "vitest";
import {
  adminSavedViewsConfigKey,
  adminSavedViewsFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import {
  adminSavedViewsFields,
  adminSavedViewsManifest,
} from "@comvestec/config";

describe("admin-saved-views manifest", () => {
  it("owns the admin-saved-views module id", () => {
    expect(adminSavedViewsManifest.moduleId).toBe(
      platformModuleId.adminSavedViews,
    );
  });

  it("declares the three admin-saved-views permission scopes", () => {
    expect(adminSavedViewsManifest.permissionScopes).toEqual([
      permissionScope.adminSavedViewsRead,
      permissionScope.adminSavedViewsWrite,
      permissionScope.adminSavedViewsDelete,
    ]);
  });

  it("declares the maxViewsPerUser config key with platform-scope only", () => {
    const keys = adminSavedViewsManifest.configKeys.map((entry) => entry.key);
    expect(keys).toEqual([adminSavedViewsConfigKey.maxViewsPerUser]);
    for (const entry of adminSavedViewsManifest.configKeys) {
      expect(entry.allowedScopes).toEqual([platformScope.platform]);
      expect(entry.owner).toBe(platformModuleId.adminSavedViews);
    }
  });

  it("declares the enabled feature flag (default true, platform-scoped)", () => {
    const keys = adminSavedViewsManifest.featureFlags.map((entry) => entry.key);
    expect(keys).toEqual([adminSavedViewsFeatureFlag.enabled]);
    const [flag] = adminSavedViewsManifest.featureFlags;
    expect(flag?.defaultEnabled).toBe(true);
    expect(flag?.allowedScopes).toEqual([platformScope.platform]);
    expect(flag?.owner).toBe(platformModuleId.adminSavedViews);
  });

  it("classifies every saved-view field as `internal` (no PII / no secrets)", () => {
    const fields = Object.values(adminSavedViewsFields);
    expect(adminSavedViewsManifest.fieldClassifications).toHaveLength(
      fields.length,
    );
    for (const entry of adminSavedViewsManifest.fieldClassifications) {
      expect(entry.classification).toBe("internal");
      expect(fields).toContain(entry.field);
    }
  });

  it("publishes a summary + admin projection profile and the admin profile reveals serializedView", () => {
    const profiles = adminSavedViewsManifest.projectionProfiles.map(
      (entry) => entry.profile,
    );
    expect(profiles).toEqual([
      projectionProfile.summary,
      projectionProfile.admin,
    ]);
    const summary = adminSavedViewsManifest.projectionProfiles.find(
      (entry) => entry.profile === projectionProfile.summary,
    );
    const admin = adminSavedViewsManifest.projectionProfiles.find(
      (entry) => entry.profile === projectionProfile.admin,
    );
    expect(summary?.visibleFields).not.toContain(
      adminSavedViewsFields.serializedView,
    );
    expect(summary?.visibleFields).not.toContain(
      adminSavedViewsFields.ownerSubjectId,
    );
    expect(admin?.visibleFields).toContain(
      adminSavedViewsFields.serializedView,
    );
    expect(admin?.visibleFields).toContain(
      adminSavedViewsFields.ownerSubjectId,
    );
  });
});
