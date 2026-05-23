/**
 * Run-as banner state contracts tests (admin-app implementation
 * plan §9 item 14). Pin:
 *
 *   - schema round-trip on `RunAsBannerStateSchema` (active +
 *     inactive variants) and `RunAsBannerStateInputSchema`
 *   - registry membership of `permissionScope.runAsBannerStateRead`,
 *     `platformModuleId.runAsBannerState`, and the two
 *     `runAsBannerStateAuditAction.*` entries
 *   - reason-catalog entry `run-as-banner-state.release` is present,
 *     owned by the run-as-banner-state module, requires an
 *     attachment, and gates the `released` audit action
 */
import { Schema } from "effect";
import { describe, expect, test } from "vitest";
import {
  auditActions,
  permissionScope,
  permissionScopes,
  platformModuleId,
  platformModuleIds,
  reasonCatalogId,
  reasonCatalogRegistry,
  runAsBannerStateAuditAction,
  RunAsBannerStateInputSchema,
  RunAsBannerStateSchema,
  type RunAsBannerState,
  type RunAsBannerStateInput,
} from "@comvestec/contracts";

const decodeBanner = Schema.decodeUnknownSync(RunAsBannerStateSchema);
const decodeBannerInput = Schema.decodeUnknownSync(RunAsBannerStateInputSchema);

describe("RunAsBannerState schemas", () => {
  test("RunAsBannerStateInputSchema decodes a minimal request-context-only input", () => {
    const input: RunAsBannerStateInput = {
      requestContext: {
        actorType: "support-operator",
        actorId: "usr_support",
        sessionId: "sess_rab",
        correlationId: "corr_rab",
        tenant: {
          scope: "platform",
          scopeId: "platform",
        },
      },
    };
    expect(decodeBannerInput(input)).toStrictEqual(input);
  });

  test("RunAsBannerStateSchema round-trips the inactive variant", () => {
    const banner: RunAsBannerState = {
      active: false,
      releasable: false,
    };
    expect(decodeBanner(banner)).toStrictEqual(banner);
  });

  test("RunAsBannerStateSchema round-trips a populated active variant", () => {
    const banner: RunAsBannerState = {
      active: true,
      grantId: "grant_rab_1",
      actingAsActorId: "usr_support",
      actingAsActorType: "support-operator",
      reasonId: reasonCatalogId.runAsBannerStateRelease,
      reasonText: "Incident triage INC-42",
      reasonAttachmentText: "https://runbooks.example.com/inc-42",
      grantedAt: "2026-05-18T12:00:00.000Z",
      expiresAt: "2026-05-18T12:30:00.000Z",
      secondsRemaining: 600,
      releasable: true,
    };
    expect(decodeBanner(banner)).toStrictEqual(banner);
  });

  test("RunAsBannerStateSchema rejects negative secondsRemaining", () => {
    expect(() =>
      decodeBanner({ active: true, releasable: true, secondsRemaining: -1 }),
    ).toThrow();
  });
});

describe("RunAsBannerState registry pins", () => {
  test("permissionScope.runAsBannerStateRead is in the canonical list", () => {
    expect(permissionScope.runAsBannerStateRead).toBe(
      "run-as-banner-state:read",
    );
    expect(permissionScopes).toContain(permissionScope.runAsBannerStateRead);
  });

  test("platformModuleId.runAsBannerState is in the canonical list", () => {
    expect(platformModuleId.runAsBannerState).toBe("run-as-banner-state");
    expect(platformModuleIds).toContain(platformModuleId.runAsBannerState);
  });

  test("runAsBannerStateAuditAction.{queried,released} are in the canonical list", () => {
    expect(runAsBannerStateAuditAction.queried).toBe(
      "run-as-banner-state.queried",
    );
    expect(runAsBannerStateAuditAction.released).toBe(
      "run-as-banner-state.released",
    );
    expect(auditActions).toContain(runAsBannerStateAuditAction.queried);
    expect(auditActions).toContain(runAsBannerStateAuditAction.released);
  });

  test("reasonCatalogId.runAsBannerStateRelease has requiresAttachment: true and gates the released audit action", () => {
    expect(reasonCatalogId.runAsBannerStateRelease).toBe(
      "run-as-banner-state.release",
    );
    const entry = reasonCatalogRegistry.find(
      (e) => e.id === reasonCatalogId.runAsBannerStateRelease,
    );
    expect(entry).toBeDefined();
    if (entry === undefined) {
      throw new Error("registry entry missing");
    }
    expect(entry.moduleId).toBe(platformModuleId.runAsBannerState);
    expect(entry.requiresAttachment).toBe(true);
    expect(entry.auditActionsGated).toEqual([
      runAsBannerStateAuditAction.released,
    ]);
  });
});
