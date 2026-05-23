/**
 * Capability snapshot v2 contracts tests (admin-app implementation
 * plan §9 item 13). Pin:
 *
 *   - schema round-trip on `CapabilitySnapshotV2Schema` +
 *     `CapabilitySnapshotV2InputSchema`
 *   - role-bucket projection `bucketAdminMemberRole` for the full
 *     7 ADR-023 admin-member-role table
 *   - `deriveNavigationMapForActor` for every (role × scope/permission)
 *     case the platform service relies on
 *   - `deriveHighRiskAffordances` exhaustively matches the
 *     registry-derived `requiresAttachment: true` list (regression
 *     pin if a future reason-catalog row flips its risk flag)
 */
import { Schema } from "effect";
import { describe, expect, test } from "vitest";
import {
  adminMemberRole,
  adminNavigationKey,
  adminOrgRole,
  bucketAdminMemberRole,
  CapabilitySnapshotV2InputSchema,
  CapabilitySnapshotV2Schema,
  deriveHighRiskAffordances,
  deriveNavigationMapForActor,
  permissionScope,
  platformScope,
  reasonCatalogId,
  reasonCatalogRegistry,
  type AdminNavigationKey,
  type CapabilitySnapshotV2,
  type CapabilitySnapshotV2Input,
  type NavigationMapEntry,
  type PermissionScope,
} from "@comvestec/contracts";

const decodeSnapshot = Schema.decodeUnknownSync(CapabilitySnapshotV2Schema);
const decodeSnapshotInput = Schema.decodeUnknownSync(
  CapabilitySnapshotV2InputSchema,
);

const allPermissions: ReadonlyArray<PermissionScope> = [
  permissionScope.operationsHomeRead,
  permissionScope.tenantRead,
  permissionScope.auditRead,
  permissionScope.webhookManage,
  permissionScope.billingRead,
  permissionScope.vendorHealthAggregatorRead,
  permissionScope.universalSearchRead,
  permissionScope.manualBreakGlassIssue,
];

const findEntry = (
  map: ReadonlyArray<NavigationMapEntry>,
  key: AdminNavigationKey,
) => {
  const entry = map.find((e) => e.key === key);
  if (entry === undefined) {
    throw new Error(`navigation entry not found for ${key}`);
  }
  return entry;
};

describe("CapabilitySnapshotV2 schemas", () => {
  test("CapabilitySnapshotV2InputSchema decodes a minimal request-context-only input", () => {
    const input: CapabilitySnapshotV2Input = {
      requestContext: {
        actorType: "platform-operator",
        actorId: "usr_op",
        sessionId: "sess_cap_v2",
        correlationId: "corr_cap_v2",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      },
    };
    expect(decodeSnapshotInput(input)).toStrictEqual(input);
  });

  test("CapabilitySnapshotV2Schema round-trips a populated envelope", () => {
    const snapshot: CapabilitySnapshotV2 = {
      actorId: "usr_op",
      actorType: "platform-operator",
      scopes: [platformScope.platform],
      permissions: [
        permissionScope.operationsHomeRead,
        permissionScope.capabilitySnapshotV2Read,
      ],
      adminOrgRole: adminOrgRole.owner,
      navigationMap: [
        {
          key: adminNavigationKey.operationsHome,
          visible: true,
          requiresStepUp: false,
        },
      ],
      highRiskAffordances: [
        {
          reasonId: reasonCatalogId.breakGlassIssue,
          requiresAttachment: true,
          requiresStepUp: true,
        },
      ],
      derivedAt: "2026-05-17T00:00:00.000Z",
      correlationId: "corr_cap_v2",
    };
    expect(decodeSnapshot(snapshot)).toStrictEqual(snapshot);
  });
});

describe("bucketAdminMemberRole", () => {
  test("folds ADR-023 7-role surface into 4-bucket adminOrgRole", () => {
    expect(bucketAdminMemberRole(adminMemberRole.adminOwner)).toBe(
      adminOrgRole.owner,
    );
    expect(bucketAdminMemberRole(adminMemberRole.adminAdmin)).toBe(
      adminOrgRole.admin,
    );
    expect(bucketAdminMemberRole(adminMemberRole.adminOperator)).toBe(
      adminOrgRole.admin,
    );
    expect(bucketAdminMemberRole(adminMemberRole.supportReviewer)).toBe(
      adminOrgRole.viewer,
    );
    expect(bucketAdminMemberRole(adminMemberRole.billingOnly)).toBe(
      adminOrgRole.viewer,
    );
    expect(bucketAdminMemberRole(adminMemberRole.compliance)).toBe(
      adminOrgRole.viewer,
    );
    expect(bucketAdminMemberRole(adminMemberRole.viewer)).toBe(
      adminOrgRole.viewer,
    );
    expect(bucketAdminMemberRole(undefined)).toBe(adminOrgRole.none);
  });
});

describe("deriveNavigationMapForActor", () => {
  test("role=none hides every key with no step-up flag", () => {
    const map = deriveNavigationMapForActor(
      adminOrgRole.none,
      [platformScope.platform],
      allPermissions,
    );
    for (const entry of map) {
      expect(entry.visible).toBe(false);
      expect(entry.requiresStepUp).toBe(false);
    }
  });

  test("role=viewer exposes read surfaces but not webhook/billing/break-glass", () => {
    const map = deriveNavigationMapForActor(
      adminOrgRole.viewer,
      [platformScope.platform],
      allPermissions,
    );
    expect(findEntry(map, adminNavigationKey.operationsHome).visible).toBe(
      true,
    );
    expect(findEntry(map, adminNavigationKey.tenantList).visible).toBe(true);
    expect(findEntry(map, adminNavigationKey.tenantWorkspace).visible).toBe(
      true,
    );
    expect(findEntry(map, adminNavigationKey.auditLog).visible).toBe(true);
    expect(findEntry(map, adminNavigationKey.vendorHealth).visible).toBe(true);
    expect(findEntry(map, adminNavigationKey.universalSearch).visible).toBe(
      true,
    );
    expect(findEntry(map, adminNavigationKey.settings).visible).toBe(true);
    // Hidden mutate surfaces
    expect(findEntry(map, adminNavigationKey.webhooks).visible).toBe(false);
    expect(findEntry(map, adminNavigationKey.billingConsole).visible).toBe(
      false,
    );
    expect(findEntry(map, adminNavigationKey.breakGlassConsole).visible).toBe(
      false,
    );
  });

  test("role=admin exposes webhooks + billing (with step-up) but break-glass still gated", () => {
    const map = deriveNavigationMapForActor(
      adminOrgRole.admin,
      [platformScope.platform],
      allPermissions,
    );
    const webhooks = findEntry(map, adminNavigationKey.webhooks);
    expect(webhooks.visible).toBe(true);
    expect(webhooks.requiresStepUp).toBe(false);
    const billing = findEntry(map, adminNavigationKey.billingConsole);
    expect(billing.visible).toBe(true);
    expect(billing.requiresStepUp).toBe(true);
    const breakGlass = findEntry(map, adminNavigationKey.breakGlassConsole);
    expect(breakGlass.visible).toBe(true);
    expect(breakGlass.requiresStepUp).toBe(true);
  });

  test("role=owner clears billing step-up but keeps break-glass step-up", () => {
    const map = deriveNavigationMapForActor(
      adminOrgRole.owner,
      [platformScope.platform],
      allPermissions,
    );
    const billing = findEntry(map, adminNavigationKey.billingConsole);
    expect(billing.visible).toBe(true);
    expect(billing.requiresStepUp).toBe(false);
    const breakGlass = findEntry(map, adminNavigationKey.breakGlassConsole);
    expect(breakGlass.visible).toBe(true);
    expect(breakGlass.requiresStepUp).toBe(true);
  });

  test("missing permission hides the matching key even at owner role", () => {
    const map = deriveNavigationMapForActor(
      adminOrgRole.owner,
      [platformScope.platform],
      [],
    );
    expect(findEntry(map, adminNavigationKey.operationsHome).visible).toBe(
      false,
    );
    expect(findEntry(map, adminNavigationKey.tenantList).visible).toBe(false);
    expect(findEntry(map, adminNavigationKey.universalSearch).visible).toBe(
      false,
    );
    // Settings is always visible regardless of permissions
    expect(findEntry(map, adminNavigationKey.settings).visible).toBe(true);
  });

  test("missing platform scope hides scope-gated keys", () => {
    const map = deriveNavigationMapForActor(
      adminOrgRole.admin,
      [],
      allPermissions,
    );
    expect(findEntry(map, adminNavigationKey.operationsHome).visible).toBe(
      false,
    );
    expect(findEntry(map, adminNavigationKey.tenantList).visible).toBe(false);
    expect(findEntry(map, adminNavigationKey.universalSearch).visible).toBe(
      false,
    );
  });
});

describe("deriveHighRiskAffordances", () => {
  test("matches the registry-derived requiresAttachment list exactly", () => {
    const expected = reasonCatalogRegistry
      .filter((entry) => entry.requiresAttachment)
      .map((entry) => entry.id)
      .sort();
    const actual = deriveHighRiskAffordances()
      .map((a) => a.reasonId)
      .sort();
    expect(actual).toStrictEqual(expected);
  });

  test("every derived affordance flags both attachment + step-up", () => {
    for (const affordance of deriveHighRiskAffordances()) {
      expect(affordance.requiresAttachment).toBe(true);
      expect(affordance.requiresStepUp).toBe(true);
    }
  });

  test("accepts a caller-supplied registry override (pure projection)", () => {
    const result = deriveHighRiskAffordances([]);
    expect(result).toStrictEqual([]);
  });
});
