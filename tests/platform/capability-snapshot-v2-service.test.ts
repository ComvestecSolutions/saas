/**
 * Capability snapshot v2 platform service tests (admin-app
 * implementation plan §9 item 13). Exercises owner-locked invariants
 * enforced ABOVE the default AdminOrganizationRepository-backed role
 * lookup port in
 * `packages/platform/src/services/access/capability-snapshot-v2-service.ts`:
 *
 *   - anonymous → public-only snapshot (`adminOrgRole === 'none'`,
 *     every navigation key hidden, empty `highRiskAffordances`,
 *     still emits ONE `snapshotDerived` audit event)
 *   - operator + support-operator allowed regardless of admin-org
 *     membership; individual user with no admin-org → Unauthorized
 *   - admin-org bucket fold: adminOwner→owner; adminAdmin/adminOperator
 *     →admin; supportReviewer/billingOnly/compliance/viewer→viewer
 *   - per-bucket navigation surface matches the pure contract derivation
 *     (read-surfaces for viewer; +webhooks/billing/break-glass for admin
 *     and owner; settings always visible)
 *   - high-risk affordances pin to the reason-catalog registry projection
 *   - field-security port invoked over the navigation map BEFORE results
 *     leave the boundary; redactions surface in the snapshot
 *   - bounded cache + insertion-order eviction at `cacheMaxSize`
 *   - cache freshness reconciliation via `cacheTtlSeconds`
 *   - reason validation: caller-supplied reason that does not gate the
 *     audit action → ReasonActionMismatch (suppressing the audit)
 *   - reason validation: caller-supplied reason that is not in the catalog
 *     → ReasonNotInCatalog (suppressing the audit)
 *   - `invalidateCache` is platform-operator-only (support rejected) and
 *     emits exactly one `cacheInvalidated` audit per accepted call
 */
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  adminNavigationKey,
  adminOrgRole,
  capabilitySnapshotV2AuditAction,
  permissionScope,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  reasonCatalogRegistry,
  type AuditEvent,
  type NavigationMapEntry,
  type RequestContext,
} from "@comvestec/contracts";
import { adminMemberRole, type AdminMemberRole } from "@comvestec/modules";
import type { AuditLogModuleService } from "@comvestec/modules";
import {
  CapabilitySnapshotV2MissingActorIdentity,
  CapabilitySnapshotV2ReasonActionMismatch,
  CapabilitySnapshotV2ReasonNotInCatalog,
  CapabilitySnapshotV2Unauthorized,
  makeCapabilitySnapshotV2Service,
  type AdminOrganizationRoleLookupPortService,
  type CapabilitySnapshotV2FieldSecurityPortService,
  type CapabilitySnapshotV2RuntimeBounds,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const tenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
} as const;

const baseContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_capsnap_operator",
  sessionId: "sess_capsnap",
  correlationId: "corr_capsnap_operator",
  reason: undefined,
  tenant,
};

const supportContext: RequestContext = {
  ...baseContext,
  actorType: actorType.supportOperator,
  actorId: "usr_capsnap_support",
  correlationId: "corr_capsnap_support",
};

const individualContext: RequestContext = {
  ...baseContext,
  actorType: actorType.individualUser,
  actorId: "usr_capsnap_user",
  correlationId: "corr_capsnap_user",
};

const anonymousContext: RequestContext = {
  ...baseContext,
  actorType: actorType.anonymous,
  actorId: undefined,
  correlationId: "corr_capsnap_anon",
};

const defaultBounds: CapabilitySnapshotV2RuntimeBounds = {
  cacheMaxSize: 2,
  cacheTtlSeconds: 30,
};

// ---------------------------------------------------------------------------
// Doubles
// ---------------------------------------------------------------------------

type AuditCall = {
  readonly moduleId: string;
  readonly action: string;
  readonly target: string;
  readonly reason: string | undefined;
};

const createAuditDouble = () => {
  const calls: AuditCall[] = [];
  const service: AuditLogModuleService = {
    append: (input) => {
      calls.push({
        moduleId: input.moduleId,
        action: input.action,
        target: input.target,
        reason: input.reason,
      });
      return Effect.succeed({
        id: `evt_${calls.length}`,
        moduleId: input.moduleId,
        action: input.action,
        target: input.target,
        reason: input.reason,
        actorType: input.requestContext.actorType,
        actorId: input.requestContext.actorId ?? null,
        sessionId: input.requestContext.sessionId,
        correlationId: input.requestContext.correlationId,
        tenantScope: input.requestContext.tenant.scope,
        tenantScopeId: input.requestContext.tenant.scopeId,
        recordedAt: "2026-02-01T00:00:00.000Z",
      } as unknown as AuditEvent);
    },
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };
  return {
    service,
    get calls(): ReadonlyArray<AuditCall> {
      return calls;
    },
  };
};

const createRoleLookupDouble = (
  rolesByActor: ReadonlyMap<string, AdminMemberRole | undefined>,
): AdminOrganizationRoleLookupPortService & {
  readonly callsFor: (actorId: string) => number;
} => {
  const calls = new Map<string, number>();
  return {
    lookupRole: (input) => {
      calls.set(input.actorId, (calls.get(input.actorId) ?? 0) + 1);
      return Effect.succeed({ role: rolesByActor.get(input.actorId) });
    },
    callsFor: (actorId) => calls.get(actorId) ?? 0,
  };
};

const passThroughFieldSecurity: CapabilitySnapshotV2FieldSecurityPortService = {
  applyLabelSecurity: (input) =>
    Effect.succeed({ navigationMap: input.navigationMap }),
};

const hidingFieldSecurity = (
  hiddenKeys: ReadonlyArray<string>,
): CapabilitySnapshotV2FieldSecurityPortService => ({
  applyLabelSecurity: (input) =>
    Effect.succeed({
      navigationMap: input.navigationMap.map(
        (entry): NavigationMapEntry =>
          hiddenKeys.includes(entry.key) ? { ...entry, visible: false } : entry,
      ),
    }),
});

const makeService = (
  overrides: {
    readonly rolesByActor?: ReadonlyMap<string, AdminMemberRole | undefined>;
    readonly bounds?: CapabilitySnapshotV2RuntimeBounds;
    readonly fieldSecurity?: CapabilitySnapshotV2FieldSecurityPortService;
    readonly now?: () => Date;
  } = {},
) => {
  const audit = createAuditDouble();
  const lookup = createRoleLookupDouble(overrides.rolesByActor ?? new Map());
  const service = makeCapabilitySnapshotV2Service({
    auditLog: audit.service,
    roleLookupPort: lookup,
    fieldSecurityPort: overrides.fieldSecurity ?? passThroughFieldSecurity,
    bounds: overrides.bounds ?? defaultBounds,
    now: overrides.now ?? (() => new Date("2026-01-01T00:00:00.000Z")),
    generateCorrelationId: () => "corr_capsnap_generated",
  });
  return { service, audit, lookup };
};

const findEntry = (
  map: ReadonlyArray<NavigationMapEntry>,
  key: string,
): NavigationMapEntry => {
  const entry = map.find((m) => m.key === key);
  if (!entry) {
    throw new Error(`navigation entry not found: ${key}`);
  }
  return entry;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CapabilitySnapshotV2Service.deriveSnapshot", () => {
  it("returns public-only snapshot for anonymous actor and emits one audit", async () => {
    const { service, audit, lookup } = makeService();
    const result = await Effect.runPromise(
      service.deriveSnapshot({ requestContext: anonymousContext }),
    );
    expect(result.fromCache).toBe(false);
    expect(result.snapshot.adminOrgRole).toBe(adminOrgRole.none);
    expect(result.snapshot.scopes).toEqual([]);
    expect(result.snapshot.permissions).toEqual([]);
    expect(result.snapshot.highRiskAffordances).toEqual([]);
    expect(result.snapshot.navigationMap.every((e) => !e.visible)).toBe(true);
    expect(audit.calls).toHaveLength(1);
    expect(audit.calls[0]).toMatchObject({
      moduleId: platformModuleId.capabilitySnapshotV2,
      action: capabilitySnapshotV2AuditAction.snapshotDerived,
      reason: reasonCatalogId.capabilitySnapshotV2Read,
    });
    // Anonymous short-circuits without invoking the role lookup port.
    expect(lookup.callsFor(anonymousContext.actorId ?? "")).toBe(0);
  });

  it("allows platform-operator without any admin-org membership", async () => {
    const { service, audit } = makeService();
    const result = await Effect.runPromise(
      service.deriveSnapshot({ requestContext: baseContext }),
    );
    expect(result.snapshot.adminOrgRole).toBe(adminOrgRole.none);
    expect(result.snapshot.scopes).toEqual([platformScope.platform]);
    expect(result.snapshot.permissions).toContain(
      permissionScope.capabilitySnapshotV2Read,
    );
    expect(audit.calls).toHaveLength(1);
  });

  it("allows support-operator without any admin-org membership", async () => {
    const { service } = makeService();
    const result = await Effect.runPromise(
      service.deriveSnapshot({ requestContext: supportContext }),
    );
    expect(result.snapshot.scopes).toEqual([platformScope.platform]);
  });

  it("rejects individual user with no admin-org membership", async () => {
    const { service, audit } = makeService();
    const exit = await Effect.runPromiseExit(
      service.deriveSnapshot({ requestContext: individualContext }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = exit.cause._tag === "Fail" ? exit.cause.error : null;
      expect(failure).toBeInstanceOf(CapabilitySnapshotV2Unauthorized);
    }
    // Failed authz must not emit an audit event for derive.
    expect(audit.calls).toHaveLength(0);
  });

  it("buckets adminOwner → owner and includes admin permissions", async () => {
    const { service } = makeService({
      rolesByActor: new Map([
        [individualContext.actorId!, adminMemberRole.adminOwner],
      ]),
    });
    const result = await Effect.runPromise(
      service.deriveSnapshot({ requestContext: individualContext }),
    );
    expect(result.snapshot.adminOrgRole).toBe(adminOrgRole.owner);
    expect(result.snapshot.permissions).toContain(
      permissionScope.manualBreakGlassIssue,
    );
    expect(result.snapshot.permissions).toContain(permissionScope.billingRead);
    expect(result.snapshot.permissions).toContain(
      permissionScope.webhookManage,
    );
  });

  it("buckets adminAdmin → admin", async () => {
    const { service } = makeService({
      rolesByActor: new Map([
        [individualContext.actorId!, adminMemberRole.adminAdmin],
      ]),
    });
    const result = await Effect.runPromise(
      service.deriveSnapshot({ requestContext: individualContext }),
    );
    expect(result.snapshot.adminOrgRole).toBe(adminOrgRole.admin);
  });

  it("buckets adminOperator → admin", async () => {
    const { service } = makeService({
      rolesByActor: new Map([
        [individualContext.actorId!, adminMemberRole.adminOperator],
      ]),
    });
    const result = await Effect.runPromise(
      service.deriveSnapshot({ requestContext: individualContext }),
    );
    expect(result.snapshot.adminOrgRole).toBe(adminOrgRole.admin);
  });

  it("buckets viewer/billingOnly/compliance/supportReviewer → viewer (no admin permissions)", async () => {
    for (const role of [
      adminMemberRole.viewer,
      adminMemberRole.billingOnly,
      adminMemberRole.compliance,
      adminMemberRole.supportReviewer,
    ]) {
      const { service } = makeService({
        rolesByActor: new Map([[individualContext.actorId!, role]]),
      });
      const result = await Effect.runPromise(
        service.deriveSnapshot({ requestContext: individualContext }),
      );
      expect(result.snapshot.adminOrgRole).toBe(adminOrgRole.viewer);
      expect(result.snapshot.permissions).not.toContain(
        permissionScope.manualBreakGlassIssue,
      );
      expect(result.snapshot.permissions).not.toContain(
        permissionScope.webhookManage,
      );
    }
  });

  it("derives navigation map per bucket matching the pure contract rules", async () => {
    // owner -> webhooks, billing, breakGlass, settings all visible
    const ownerCtx = makeService({
      rolesByActor: new Map([
        [individualContext.actorId!, adminMemberRole.adminOwner],
      ]),
    });
    const ownerResult = await Effect.runPromise(
      ownerCtx.service.deriveSnapshot({ requestContext: individualContext }),
    );
    const ownerMap = ownerResult.snapshot.navigationMap;
    expect(findEntry(ownerMap, adminNavigationKey.webhooks).visible).toBe(true);
    expect(findEntry(ownerMap, adminNavigationKey.billingConsole).visible).toBe(
      true,
    );
    expect(
      findEntry(ownerMap, adminNavigationKey.breakGlassConsole).visible,
    ).toBe(true);
    expect(
      findEntry(ownerMap, adminNavigationKey.breakGlassConsole).requiresStepUp,
    ).toBe(true);
    expect(findEntry(ownerMap, adminNavigationKey.settings).visible).toBe(true);

    // viewer -> read surfaces only
    const viewerCtx = makeService({
      rolesByActor: new Map([
        [individualContext.actorId!, adminMemberRole.viewer],
      ]),
    });
    const viewerResult = await Effect.runPromise(
      viewerCtx.service.deriveSnapshot({ requestContext: individualContext }),
    );
    const viewerMap = viewerResult.snapshot.navigationMap;
    expect(findEntry(viewerMap, adminNavigationKey.webhooks).visible).toBe(
      false,
    );
    expect(
      findEntry(viewerMap, adminNavigationKey.breakGlassConsole).visible,
    ).toBe(false);
    expect(findEntry(viewerMap, adminNavigationKey.auditLog).visible).toBe(
      true,
    );
  });

  it("pins high-risk affordances to attachment-required reason-catalog registry entries", async () => {
    const { service } = makeService({
      rolesByActor: new Map([
        [individualContext.actorId!, adminMemberRole.adminOwner],
      ]),
    });
    const result = await Effect.runPromise(
      service.deriveSnapshot({ requestContext: individualContext }),
    );
    const expectedIds = Object.values(reasonCatalogRegistry)
      .filter((e) => e.requiresAttachment)
      .map((e) => e.id)
      .sort();
    const actualIds = result.snapshot.highRiskAffordances
      .map((a) => a.reasonId)
      .sort();
    expect(actualIds).toEqual(expectedIds);
    expect(
      result.snapshot.highRiskAffordances.every((a) => a.requiresStepUp),
    ).toBe(true);
  });

  it("invokes the field-security port over the navigation map before returning", async () => {
    const { service } = makeService({
      rolesByActor: new Map([
        [individualContext.actorId!, adminMemberRole.adminOwner],
      ]),
      fieldSecurity: hidingFieldSecurity([adminNavigationKey.billingConsole]),
    });
    const result = await Effect.runPromise(
      service.deriveSnapshot({ requestContext: individualContext }),
    );
    expect(
      findEntry(
        result.snapshot.navigationMap,
        adminNavigationKey.billingConsole,
      ).visible,
    ).toBe(false);
  });

  it("serves repeat calls from the bounded cache (same actor + tenant)", async () => {
    const { service, audit, lookup } = makeService();
    await Effect.runPromise(
      service.deriveSnapshot({ requestContext: baseContext }),
    );
    const second = await Effect.runPromise(
      service.deriveSnapshot({ requestContext: baseContext }),
    );
    expect(second.fromCache).toBe(true);
    expect(audit.calls).toHaveLength(2);
    // Role lookup port should be called only once for operator (the
    // first call) — the cache short-circuits on the second.
    expect(lookup.callsFor(baseContext.actorId!)).toBe(1);
  });

  it("evicts the oldest entry when cacheMaxSize is exceeded", async () => {
    const actorA = { ...individualContext, actorId: "usr_a" };
    const actorB = { ...individualContext, actorId: "usr_b" };
    const actorC = { ...individualContext, actorId: "usr_c" };
    const { service, lookup } = makeService({
      bounds: { cacheMaxSize: 2, cacheTtlSeconds: 30 },
      rolesByActor: new Map<string, AdminMemberRole | undefined>([
        ["usr_a", adminMemberRole.adminOwner],
        ["usr_b", adminMemberRole.adminOwner],
        ["usr_c", adminMemberRole.adminOwner],
      ]),
    });
    await Effect.runPromise(service.deriveSnapshot({ requestContext: actorA }));
    await Effect.runPromise(service.deriveSnapshot({ requestContext: actorB }));
    await Effect.runPromise(service.deriveSnapshot({ requestContext: actorC }));
    // actor A should have been evicted; calling again triggers a live lookup.
    await Effect.runPromise(service.deriveSnapshot({ requestContext: actorA }));
    expect(lookup.callsFor("usr_a")).toBe(2);
    // actor B was kept (most-recent prior insertion) — its second call hits cache.
    await Effect.runPromise(service.deriveSnapshot({ requestContext: actorB }));
    expect(lookup.callsFor("usr_b")).toBe(2);
  });

  it("re-derives when the cached entry has aged past cacheTtlSeconds", async () => {
    let nowMs = 1_700_000_000_000;
    const { service, lookup } = makeService({
      bounds: { cacheMaxSize: 4, cacheTtlSeconds: 5 },
      now: () => new Date(nowMs),
    });
    await Effect.runPromise(
      service.deriveSnapshot({ requestContext: baseContext }),
    );
    nowMs += 10_000; // 10s elapsed > 5s ttl
    await Effect.runPromise(
      service.deriveSnapshot({ requestContext: baseContext }),
    );
    expect(lookup.callsFor(baseContext.actorId!)).toBe(2);
  });

  it("rejects a reason that is not in the catalog and suppresses the audit", async () => {
    const { service, audit } = makeService();
    const exit = await Effect.runPromiseExit(
      service.deriveSnapshot({
        requestContext: { ...baseContext, reason: "not_a_real_reason" },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(
        CapabilitySnapshotV2ReasonNotInCatalog,
      );
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("rejects a reason that does not gate snapshotDerived", async () => {
    const { service, audit } = makeService();
    // Pick a reason that exists but gates a different action.
    const otherReason = Object.values(reasonCatalogRegistry).find(
      (e) => e.id !== reasonCatalogId.capabilitySnapshotV2Read,
    );
    if (!otherReason) {
      throw new Error("expected at least one other reason in the registry");
    }
    const exit = await Effect.runPromiseExit(
      service.deriveSnapshot({
        requestContext: { ...baseContext, reason: otherReason.id },
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(
        CapabilitySnapshotV2ReasonActionMismatch,
      );
    }
    expect(audit.calls).toHaveLength(0);
  });
});

describe("CapabilitySnapshotV2Service.invalidateCache", () => {
  it("rejects support-operator (platform-operator-only)", async () => {
    const { service, audit } = makeService();
    const exit = await Effect.runPromiseExit(
      service.invalidateCache({
        requestContext: supportContext,
        actorId: "usr_target",
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(CapabilitySnapshotV2Unauthorized);
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("rejects when actorId is missing on the request context", async () => {
    const { service } = makeService();
    const exit = await Effect.runPromiseExit(
      service.invalidateCache({
        requestContext: { ...baseContext, actorId: undefined },
        actorId: "usr_target",
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit) && exit.cause._tag === "Fail") {
      expect(exit.cause.error).toBeInstanceOf(
        CapabilitySnapshotV2MissingActorIdentity,
      );
    }
  });

  it("evicts cached snapshots for the given actor and emits one audit", async () => {
    const targetActor = { ...individualContext, actorId: "usr_target" };
    const { service, audit, lookup } = makeService({
      rolesByActor: new Map([["usr_target", adminMemberRole.adminOwner]]),
    });
    // Seed the cache for the target actor.
    await Effect.runPromise(
      service.deriveSnapshot({ requestContext: targetActor }),
    );
    expect(lookup.callsFor("usr_target")).toBe(1);
    // Operator invalidates.
    const result = await Effect.runPromise(
      service.invalidateCache({
        requestContext: baseContext,
        actorId: "usr_target",
      }),
    );
    expect(result.accepted).toBe(true);
    expect(result.evictedCount).toBe(1);
    // Next derive triggers a fresh role lookup.
    await Effect.runPromise(
      service.deriveSnapshot({ requestContext: targetActor }),
    );
    expect(lookup.callsFor("usr_target")).toBe(2);
    // Audit events: derive(target) + invalidate(operator) + derive(target).
    expect(audit.calls).toHaveLength(3);
    expect(audit.calls[1]).toMatchObject({
      action: capabilitySnapshotV2AuditAction.cacheInvalidated,
      target: "usr_target",
      reason: reasonCatalogId.capabilitySnapshotV2Read,
    });
  });
});
