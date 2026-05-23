/**
 * Admin-app Support-cases loader tests (admin-app implementation
 * plan §8.8 + §11 — Phase 5 Support / compliance / integrations
 * operator screens commit 1). Covers the discriminated-union
 * mapping of the `/r/support` loader trio backed live by the
 * Phase 1 by-session helpers:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `SupportOperationsReadAccessDeniedError` → `denied`
 *   - `SupportOperationsReadUnauthenticatedActorError` → `stale-session`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying cases + incidents + impersonation
 *     sessions + selectedIncidentId passthrough
 *
 * Mirrors `tests/platform/admin-app-branding-list-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  platformScope,
  supportOperationsBreakGlassIncidentStatus,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  supportOperationsImpersonationSessionStatus,
} from "@comvestec/contracts";
import {
  loadAdminSupportCasesRouteDataFromRequest,
  type AdminSupportCasesDependencies,
  type AdminSupportCasesInput,
} from "../../apps/admin-app/src/lib/support-cases-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleCase = {
  caseId: "case_demo",
  supportAgent: "agent_demo",
  tenantScope: platformScope.organization,
  tenantScopeId: "org_demo",
  summary: "Tenant unable to sign in",
  status: supportOperationsCaseStatus.open,
  priority: supportOperationsCasePriority.high,
  startedAt: new Date(0).toISOString(),
  lastUpdatedAt: new Date(0).toISOString(),
};

const sampleIncident = {
  caseId: "incident_demo",
  status: supportOperationsBreakGlassIncidentStatus.pendingReview,
  startedAt: new Date(0).toISOString(),
  approvedBy: "operator_demo",
  reason: "Tenant unblock for billing reconciliation",
  expiresAt: new Date(60_000).toISOString(),
};

const sampleImpersonationSession = {
  caseId: "imp_demo",
  status: supportOperationsImpersonationSessionStatus.active,
  startedAt: new Date(0).toISOString(),
};

const baseInput: AdminSupportCasesInput = {};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  listSupportCases: () => Effect.succeed([sampleCase]),
  listSupportBreakGlassIncidents: () => Effect.succeed([sampleIncident]),
  listSupportImpersonationSessions: () =>
    Effect.succeed([sampleImpersonationSession]),
} as unknown as AdminSupportCasesDependencies;

const failingResolveContext = (tag: string): AdminSupportCasesDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    listSupportCases: () => Effect.succeed([sampleCase]),
    listSupportBreakGlassIncidents: () => Effect.succeed([sampleIncident]),
    listSupportImpersonationSessions: () =>
      Effect.succeed([sampleImpersonationSession]),
  }) as unknown as AdminSupportCasesDependencies;

const failingSupport = (tag: string): AdminSupportCasesDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listSupportCases: () => Effect.fail({ _tag: tag } as const),
    listSupportBreakGlassIncidents: () => Effect.succeed([sampleIncident]),
    listSupportImpersonationSessions: () =>
      Effect.succeed([sampleImpersonationSession]),
  }) as unknown as AdminSupportCasesDependencies;

const throwingDependencies = (error: unknown): AdminSupportCasesDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listSupportCases: () => Effect.fail(error),
    listSupportBreakGlassIncidents: () => Effect.succeed([sampleIncident]),
    listSupportImpersonationSessions: () =>
      Effect.succeed([sampleImpersonationSession]),
  }) as unknown as AdminSupportCasesDependencies;

describe("admin-app support-cases loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminSupportCasesRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with cases, incidents, and impersonation sessions when deps succeed", async () => {
    const result = await Effect.runPromise(
      loadAdminSupportCasesRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.cases).toHaveLength(1);
    expect(result.incidents).toHaveLength(1);
    expect(result.impersonationSessions).toHaveLength(1);
    expect(result.incidents[0]?.caseId).toBe("incident_demo");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminSupportCasesRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the support helper raises access-denied", async () => {
    const result = await Effect.runPromise(
      loadAdminSupportCasesRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingSupport("SupportOperationsReadAccessDeniedError"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the support helper raises an unauthenticated-actor error", async () => {
    const result = await Effect.runPromise(
      loadAdminSupportCasesRouteDataFromRequest(
        buildRequest("sess-unauth"),
        {},
        baseInput,
        failingSupport("SupportOperationsReadUnauthenticatedActorError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when the support helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminSupportCasesRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(
          new Error("Upstream support-operations adapter unreachable."),
        ),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Support workspace unavailable");
    expect(result.description).toBe(
      "Upstream support-operations adapter unreachable.",
    );
  });

  it("preserves selectedIncidentId in the ready payload", async () => {
    const result = await Effect.runPromise(
      loadAdminSupportCasesRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { ...baseInput, selectedIncidentId: "incident_demo" },
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.selectedIncidentId).toBe("incident_demo");
  });
});
