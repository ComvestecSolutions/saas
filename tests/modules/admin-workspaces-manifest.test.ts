/**
 * Admin-workspaces manifest tests (admin-app implementation plan §9
 * item 2). Mirrors the admin-saved-views manifest test shape so the
 * stewardship checklist for typed manifest helpers, platform-scoped
 * config keys, and projection-profile boundary decoding stays
 * enforced.
 */
import { describe, expect, it } from "vitest";
import {
  adminWorkspacesConfigKey,
  adminWorkspacesFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import {
  adminWorkspacesFields,
  adminWorkspacesManifest,
} from "@comvestec/config";

describe("admin-workspaces manifest", () => {
  it("owns the admin-workspaces module id", () => {
    expect(adminWorkspacesManifest.moduleId).toBe(
      platformModuleId.adminWorkspaces,
    );
  });

  it("declares the four admin-workspaces permission scopes", () => {
    expect(adminWorkspacesManifest.permissionScopes).toEqual([
      permissionScope.adminWorkspacesRead,
      permissionScope.adminWorkspacesWrite,
      permissionScope.adminWorkspacesDelete,
      permissionScope.adminWorkspacesReorder,
    ]);
  });

  it("declares the maxWorkspacesPerUser config key with platform-scope only", () => {
    const keys = adminWorkspacesManifest.configKeys.map((entry) => entry.key);
    expect(keys).toEqual([adminWorkspacesConfigKey.maxWorkspacesPerUser]);
    for (const entry of adminWorkspacesManifest.configKeys) {
      expect(entry.allowedScopes).toEqual([platformScope.platform]);
      expect(entry.owner).toBe(platformModuleId.adminWorkspaces);
    }
  });

  it("declares the enabled feature flag (default true, platform-scoped)", () => {
    const keys = adminWorkspacesManifest.featureFlags.map((entry) => entry.key);
    expect(keys).toEqual([adminWorkspacesFeatureFlag.enabled]);
    const [flag] = adminWorkspacesManifest.featureFlags;
    expect(flag?.defaultEnabled).toBe(true);
    expect(flag?.allowedScopes).toEqual([platformScope.platform]);
    expect(flag?.owner).toBe(platformModuleId.adminWorkspaces);
  });

  it("classifies every workspace field as `internal` (no PII / no secrets)", () => {
    const fields = Object.values(adminWorkspacesFields);
    expect(adminWorkspacesManifest.fieldClassifications).toHaveLength(
      fields.length,
    );
    for (const entry of adminWorkspacesManifest.fieldClassifications) {
      expect(entry.classification).toBe("internal");
      expect(fields).toContain(entry.field);
    }
  });

  it("publishes a summary + admin projection profile and the admin profile reveals serializedLayout", () => {
    const profiles = adminWorkspacesManifest.projectionProfiles.map(
      (entry) => entry.profile,
    );
    expect(profiles).toEqual([
      projectionProfile.summary,
      projectionProfile.admin,
    ]);
    const summary = adminWorkspacesManifest.projectionProfiles.find(
      (entry) => entry.profile === projectionProfile.summary,
    );
    const admin = adminWorkspacesManifest.projectionProfiles.find(
      (entry) => entry.profile === projectionProfile.admin,
    );
    expect(summary?.visibleFields).not.toContain(
      adminWorkspacesFields.serializedLayout,
    );
    expect(summary?.visibleFields).not.toContain(
      adminWorkspacesFields.ownerSubjectId,
    );
    expect(admin?.visibleFields).toContain(
      adminWorkspacesFields.serializedLayout,
    );
    expect(admin?.visibleFields).toContain(
      adminWorkspacesFields.ownerSubjectId,
    );
  });
});
