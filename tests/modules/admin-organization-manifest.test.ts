import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  adminMemberRole,
  adminOrganizationConfigKey,
  adminOrganizationFeatureFlag,
  permissionScope,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";
import {
  adminOrganizationFields,
  adminOrganizationManifest,
} from "@comvestec/config";
import {
  AdminOrganizationModule,
  AdminOrganizationModuleLive,
  joinAdminRoleWithPlatformCapabilities,
} from "@comvestec/modules";

describe("admin-organization manifest", () => {
  it("owns the admin-organization module id", () => {
    expect(adminOrganizationManifest.moduleId).toBe(
      platformModuleId.adminOrganization,
    );
  });

  it("declares the five admin-organization permission scopes", () => {
    expect(adminOrganizationManifest.permissionScopes).toEqual([
      permissionScope.adminOrganizationRead,
      permissionScope.adminOrganizationInvite,
      permissionScope.adminOrganizationManageMembers,
      permissionScope.adminOrganizationChangeRole,
      permissionScope.adminOrganizationRemoveMember,
    ]);
  });

  it("declares the three config keys with platform-scope only", () => {
    const keys = adminOrganizationManifest.configKeys.map((entry) => entry.key);
    expect(keys).toEqual([
      adminOrganizationConfigKey.invitationExpiryHours,
      adminOrganizationConfigKey.invitationTtlMinutes,
      adminOrganizationConfigKey.minimumOwnerCount,
    ]);
    for (const entry of adminOrganizationManifest.configKeys) {
      expect(entry.allowedScopes).toEqual([platformScope.platform]);
      expect(entry.owner).toBe(platformModuleId.adminOrganization);
    }
  });

  it("declares the enabled + selfServiceInvitations feature flags", () => {
    const keys = adminOrganizationManifest.featureFlags.map(
      (entry) => entry.key,
    );
    expect(keys).toEqual([
      adminOrganizationFeatureFlag.enabled,
      adminOrganizationFeatureFlag.selfServiceInvitations,
    ]);
  });

  it("classifies email and displayName as regulated-sensitive", () => {
    const sensitiveFields: readonly string[] = [
      adminOrganizationFields.email,
      adminOrganizationFields.displayName,
      adminOrganizationFields.invitationEmail,
    ];
    const classifications =
      adminOrganizationManifest.fieldClassifications.filter((entry) =>
        sensitiveFields.includes(entry.field),
      );
    expect(classifications).toHaveLength(3);
    for (const entry of classifications) {
      expect(entry.classification).toBe("regulated-sensitive");
    }
  });

  it("hides regulated-sensitive fields from the support-safe projection", () => {
    const supportSafe = adminOrganizationManifest.projectionProfiles.find(
      (entry) => entry.profile === "support-safe",
    );
    expect(supportSafe).toBeDefined();
    expect(supportSafe?.visibleFields).not.toContain(
      adminOrganizationFields.email,
    );
    expect(supportSafe?.visibleFields).not.toContain(
      adminOrganizationFields.displayName,
    );
  });
});

describe("admin-organization capability join", () => {
  const baseSnapshot = {
    hasPrivilegedAccess: false,
    canImpersonate: false,
    canRevealSecrets: false,
    canReadAudit: false,
  } as const;

  it("grants admin-owner the full capability surface", () => {
    const resolved = joinAdminRoleWithPlatformCapabilities(
      adminMemberRole.adminOwner,
      { ...baseSnapshot, canImpersonate: true, canRevealSecrets: true },
    );
    expect(resolved.role).toBe(adminMemberRole.adminOwner);
    expect(resolved.canManageMembers).toBe(true);
    expect(resolved.canInviteMembers).toBe(true);
    expect(resolved.canRemoveMember).toBe(true);
    expect(resolved.canChangeMemberRole).toBe(true);
    expect(resolved.canReadAudit).toBe(true);
    expect(resolved.canManageRuntimeConfig).toBe(true);
    expect(resolved.canManageBilling).toBe(true);
    expect(resolved.canReadBilling).toBe(true);
    expect(resolved.canManageRetention).toBe(true);
    expect(resolved.canImpersonate).toBe(true);
    expect(resolved.canRevealSecrets).toBe(true);
    expect(resolved.canMutate).toBe(true);
  });

  it("forbids admin-admin from removing members", () => {
    const resolved = joinAdminRoleWithPlatformCapabilities(
      adminMemberRole.adminAdmin,
      baseSnapshot,
    );
    expect(resolved.canRemoveMember).toBe(false);
    expect(resolved.canChangeMemberRole).toBe(true);
  });

  it("limits viewer to read-only — no mutation, no reveal", () => {
    const resolved = joinAdminRoleWithPlatformCapabilities(
      adminMemberRole.viewer,
      { ...baseSnapshot, canRevealSecrets: true, canImpersonate: true },
    );
    expect(resolved.canMutate).toBe(false);
    expect(resolved.canRevealSecrets).toBe(false);
    expect(resolved.canImpersonate).toBe(false);
    expect(resolved.canReadAudit).toBe(false);
  });

  it("locks reveal-secrets to operator role + platform privileged access", () => {
    const withoutPrivilege = joinAdminRoleWithPlatformCapabilities(
      adminMemberRole.adminOperator,
      { ...baseSnapshot, canRevealSecrets: true, hasPrivilegedAccess: false },
    );
    expect(withoutPrivilege.canRevealSecrets).toBe(false);

    const withPrivilege = joinAdminRoleWithPlatformCapabilities(
      adminMemberRole.adminOperator,
      { ...baseSnapshot, canRevealSecrets: true, hasPrivilegedAccess: true },
    );
    expect(withPrivilege.canRevealSecrets).toBe(true);
  });

  it("limits billing-only to billing surfaces", () => {
    const resolved = joinAdminRoleWithPlatformCapabilities(
      adminMemberRole.billingOnly,
      baseSnapshot,
    );
    expect(resolved.canManageBilling).toBe(true);
    expect(resolved.canReadAudit).toBe(false);
    expect(resolved.canManageRuntimeConfig).toBe(false);
  });
});

describe("AdminOrganizationModule effect service", () => {
  it("resolves capabilities through Schema.decodeUnknown at the boundary", async () => {
    const program = Effect.gen(function* () {
      const module = yield* AdminOrganizationModule;
      return yield* module.resolveCapabilities({
        role: adminMemberRole.compliance,
        snapshot: {
          hasPrivilegedAccess: false,
          canImpersonate: false,
          canRevealSecrets: false,
          canReadAudit: true,
        },
      });
    });
    const resolved = await Effect.runPromise(
      program.pipe(Effect.provide(AdminOrganizationModuleLive)),
    );
    expect(resolved.role).toBe(adminMemberRole.compliance);
    expect(resolved.canReadAudit).toBe(true);
    expect(resolved.canManageRetention).toBe(true);
    expect(resolved.canRevealSecrets).toBe(false);
  });

  it("fails with ParseError on unknown role at the boundary", async () => {
    const program = Effect.gen(function* () {
      const module = yield* AdminOrganizationModule;
      return yield* module.resolveCapabilities({
        role: "not-a-role" as never,
        snapshot: {
          hasPrivilegedAccess: false,
          canImpersonate: false,
          canRevealSecrets: false,
          canReadAudit: false,
        },
      });
    });
    const exit = await Effect.runPromiseExit(
      program.pipe(Effect.provide(AdminOrganizationModuleLive)),
    );
    expect(exit._tag).toBe("Failure");
  });
});
