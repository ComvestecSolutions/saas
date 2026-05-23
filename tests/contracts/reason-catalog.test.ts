import "../type-assertions";

import { Option, Schema } from "effect";
import { describe, expect, test } from "vitest";
import {
  actorType,
  AuditActionSchema,
  adminOrganizationAuditAction,
  adminSavedViewsAuditAction,
  adminWorkspacesAuditAction,
  getReasonCatalogEntry,
  manualBreakGlassAuditAction,
  openMeterUsageQueryAuditAction,
  operationsHomeAuditAction,
  operatorWebhookDeliveryAuditAction,
  platformModuleId,
  polarRevenueProjectionAuditAction,
  reasonCatalogId,
  reasonCatalogIds,
  reasonCatalogRegistry,
  ReasonCatalogEntrySchema,
  ReasonCatalogIdSchema,
  tenantWorkspaceAuditAction,
  universalSearchAuditAction,
  validateReasonForAction,
  type AuditAction,
  type ReasonCatalogEntry,
  type ReasonCatalogId,
} from "@comvestec/contracts";

const decodeEntry = Schema.decodeUnknownSync(ReasonCatalogEntrySchema);
const decodeAuditAction = Schema.decodeUnknownSync(AuditActionSchema);
const decodeReasonId = Schema.decodeUnknownSync(ReasonCatalogIdSchema);

const moduleIdValues = new Set<string>(Object.values(platformModuleId));

const highRiskRequiresAttachment: ReadonlyArray<ReasonCatalogId> = [
  reasonCatalogId.breakGlassIssue,
  reasonCatalogId.operatorWebhookDeliveryReplay,
  reasonCatalogId.polarRevenueProjectionBackfill,
  reasonCatalogId.openMeterUsageQueryBackfill,
  reasonCatalogId.universalSearchReindex,
  reasonCatalogId.runAsBannerStateRelease,
  reasonCatalogId.workflowRunsAdminReplay,
  reasonCatalogId.workflowRunsAdminCancel,
  reasonCatalogId.notificationCenterAdminResend,
  reasonCatalogId.adminOperatorTestTokensIssue,
];

describe("reasonCatalogRegistry", () => {
  test("every entry passes ReasonCatalogEntrySchema", () => {
    for (const entry of reasonCatalogRegistry) {
      expect(() => decodeEntry(entry)).not.toThrow();
    }
  });

  test("every reasonCatalogId.* constant has exactly one registry entry", () => {
    const seen = new Map<ReasonCatalogId, number>();
    for (const entry of reasonCatalogRegistry) {
      seen.set(entry.id, (seen.get(entry.id) ?? 0) + 1);
    }
    for (const id of reasonCatalogIds) {
      expect(seen.get(id)).toBe(1);
    }
    expect(seen.size).toBe(reasonCatalogIds.length);
  });

  test("every entry's moduleId is in platformModuleId.*", () => {
    for (const entry of reasonCatalogRegistry) {
      expect(moduleIdValues.has(entry.moduleId)).toBe(true);
    }
  });

  test("every auditActionsGated[] entry decodes against AuditActionSchema", () => {
    for (const entry of reasonCatalogRegistry) {
      for (const action of entry.auditActionsGated) {
        expect(() => decodeAuditAction(action)).not.toThrow();
      }
    }
  });

  test("every minimumActorClass is platformOperator or supportOperator", () => {
    const allowed = new Set<string>([
      actorType.platformOperator,
      actorType.supportOperator,
    ]);
    for (const entry of reasonCatalogRegistry) {
      expect(allowed.has(entry.minimumActorClass)).toBe(true);
    }
  });

  test("requiresAttachment is true exactly for the documented high-risk surfaces", () => {
    const expected = new Set<ReasonCatalogId>(highRiskRequiresAttachment);
    for (const entry of reasonCatalogRegistry) {
      expect(entry.requiresAttachment).toBe(expected.has(entry.id));
    }
  });
});

describe("getReasonCatalogEntry", () => {
  test("returns Option.some for a representative entry per module", () => {
    const samples: ReadonlyArray<{
      readonly id: ReasonCatalogId;
      readonly moduleId: string;
    }> = [
      {
        id: reasonCatalogId.adminOrganizationInviteMember,
        moduleId: platformModuleId.adminOrganization,
      },
      {
        id: reasonCatalogId.adminSavedViewCreate,
        moduleId: platformModuleId.adminSavedViews,
      },
      {
        id: reasonCatalogId.adminWorkspaceDelete,
        moduleId: platformModuleId.adminWorkspaces,
      },
      {
        id: reasonCatalogId.breakGlassIssue,
        moduleId: platformModuleId.manualBreakGlass,
      },
      {
        id: reasonCatalogId.operatorWebhookDeliveryReplay,
        moduleId: platformModuleId.operatorWebhookDelivery,
      },
      {
        id: reasonCatalogId.polarRevenueProjectionBackfill,
        moduleId: platformModuleId.polarRevenueProjection,
      },
      {
        id: reasonCatalogId.openMeterUsageQueryBackfill,
        moduleId: platformModuleId.openMeterUsageQuery,
      },
      {
        id: reasonCatalogId.vendorHealthAggregatorRead,
        moduleId: platformModuleId.vendorHealthAggregator,
      },
      {
        id: reasonCatalogId.universalSearchReindex,
        moduleId: platformModuleId.universalSearch,
      },
    ];
    for (const sample of samples) {
      const entry = getReasonCatalogEntry(sample.id);
      expect(Option.isSome(entry)).toBe(true);
      if (Option.isSome(entry)) {
        expect(entry.value.id).toBe(sample.id);
        expect(entry.value.moduleId).toBe(sample.moduleId);
      }
    }
  });

  test("returns Option.none for a non-catalog id (cast through unknown)", () => {
    const bogus = "not-a-real.reason" as unknown as ReasonCatalogId;
    expect(Option.isNone(getReasonCatalogEntry(bogus))).toBe(true);
  });
});

describe("validateReasonForAction", () => {
  test("accepts a reason that gates the supplied audit action", () => {
    expect(
      validateReasonForAction(
        reasonCatalogId.breakGlassIssue,
        manualBreakGlassAuditAction.issue,
      ),
    ).toBe(true);
    expect(
      validateReasonForAction(
        reasonCatalogId.adminOrganizationBootstrapOwner,
        adminOrganizationAuditAction.ownerSeeded,
      ),
    ).toBe(true);
    expect(
      validateReasonForAction(
        reasonCatalogId.breakGlassRelease,
        manualBreakGlassAuditAction.release,
      ),
    ).toBe(true);
    expect(
      validateReasonForAction(
        reasonCatalogId.operatorWebhookDeliveryReplay,
        operatorWebhookDeliveryAuditAction.replayed,
      ),
    ).toBe(true);
    expect(
      validateReasonForAction(
        reasonCatalogId.polarRevenueProjectionBackfill,
        polarRevenueProjectionAuditAction.backfillRequested,
      ),
    ).toBe(true);
    expect(
      validateReasonForAction(
        reasonCatalogId.openMeterUsageQueryBackfill,
        openMeterUsageQueryAuditAction.backfillRequested,
      ),
    ).toBe(true);
    expect(
      validateReasonForAction(
        reasonCatalogId.universalSearchReindex,
        universalSearchAuditAction.reindexRequested,
      ),
    ).toBe(true);
    expect(
      validateReasonForAction(
        reasonCatalogId.universalSearchRead,
        universalSearchAuditAction.queryExecuted,
      ),
    ).toBe(true);
    // multi-action gating (pinned + unpinned)
    expect(
      validateReasonForAction(
        reasonCatalogId.adminSavedViewPin,
        adminSavedViewsAuditAction.unpinned,
      ),
    ).toBe(true);
  });

  test("rejects a reason that does not gate the supplied audit action", () => {
    expect(
      validateReasonForAction(
        reasonCatalogId.breakGlassIssue,
        manualBreakGlassAuditAction.release,
      ),
    ).toBe(false);
    expect(
      validateReasonForAction(
        reasonCatalogId.adminOrganizationInviteMember,
        adminOrganizationAuditAction.ownerSeeded,
      ),
    ).toBe(false);
    expect(
      validateReasonForAction(
        reasonCatalogId.universalSearchRead,
        universalSearchAuditAction.reindexRequested,
      ),
    ).toBe(false);
    expect(
      validateReasonForAction(
        reasonCatalogId.universalSearchReindex,
        universalSearchAuditAction.queryExecuted,
      ),
    ).toBe(false);
    expect(
      validateReasonForAction(
        reasonCatalogId.polarRevenueProjectionRead,
        polarRevenueProjectionAuditAction.backfillRequested,
      ),
    ).toBe(false);
  });

  test("rejects when reason id is not in the catalog (cast through unknown)", () => {
    const bogus = "not-a-real.reason" as unknown as ReasonCatalogId;
    expect(
      validateReasonForAction(bogus, manualBreakGlassAuditAction.issue),
    ).toBe(false);
  });
});

describe("ReasonCatalogId / AuditAction wiring (smoke)", () => {
  test("decodeReasonId / decodeAuditAction accept the canonical samples", () => {
    expect(decodeReasonId(reasonCatalogId.universalSearchReindex)).toBe(
      reasonCatalogId.universalSearchReindex,
    );
    const action: AuditAction = operationsHomeAuditAction.read;
    expect(decodeAuditAction(action)).toBe(operationsHomeAuditAction.read);
    const tenant: AuditAction = tenantWorkspaceAuditAction.read;
    expect(decodeAuditAction(tenant)).toBe(tenantWorkspaceAuditAction.read);
    const wsDelete: AuditAction = adminWorkspacesAuditAction.delete;
    expect(decodeAuditAction(wsDelete)).toBe(adminWorkspacesAuditAction.delete);
  });

  test("ReasonCatalogEntry shape exposes the documented surface (compile + runtime)", () => {
    const entry: ReasonCatalogEntry =
      reasonCatalogRegistry[reasonCatalogRegistry.length - 1]!;
    expect(typeof entry.id).toBe("string");
    expect(typeof entry.displayLabel).toBe("string");
    expect(typeof entry.moduleId).toBe("string");
    expect(typeof entry.minimumActorClass).toBe("string");
    expect(typeof entry.requiresAttachment).toBe("boolean");
    expect(Array.isArray(entry.auditActionsGated)).toBe(true);
    expect(entry.auditActionsGated.length).toBeGreaterThan(0);
  });
});
