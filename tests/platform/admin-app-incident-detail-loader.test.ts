/**
 * Admin-app Incident-detail loader tests (admin-app
 * implementation plan §8.8 + §11 — Phase 5 Support / compliance
 * / integrations operator screens commit 1). Covers the
 * discriminated-union mapping of the `/r/incident/$incidentId`
 * loader trio backed live by
 * `getSupportBreakGlassIncidentFromSessionId`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `SupportOperationsReadAccessDeniedError` → `denied`
 *   - `SupportOperationsBreakGlassIncidentNotFoundError` → `error`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying the incident support view
 *
 * Mirrors `tests/platform/admin-app-domain-detail-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { supportOperationsBreakGlassIncidentStatus } from "@comvestec/contracts";
import {
  loadAdminIncidentDetailRouteDataFromRequest,
  type AdminIncidentDetailDependencies,
  type AdminIncidentDetailInput,
} from "../../apps/admin-app/src/lib/incident-detail-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleIncident = {
  caseId: "incident_demo",
  status: supportOperationsBreakGlassIncidentStatus.pendingReview,
  startedAt: new Date(0).toISOString(),
  approvedBy: "operator_demo",
  reason: "Tenant unblock for billing reconciliation",
  expiresAt: new Date(60_000).toISOString(),
};

const baseInput: AdminIncidentDetailInput = { incidentId: "incident_demo" };

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  getSupportBreakGlassIncident: () => Effect.succeed(sampleIncident),
} as unknown as AdminIncidentDetailDependencies;

const failingResolveContext = (tag: string): AdminIncidentDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getSupportBreakGlassIncident: () => Effect.succeed(sampleIncident),
  }) as unknown as AdminIncidentDetailDependencies;

const failingIncident = (tag: string): AdminIncidentDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getSupportBreakGlassIncident: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminIncidentDetailDependencies;

const throwingDependencies = (
  error: unknown,
): AdminIncidentDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getSupportBreakGlassIncident: () => Effect.fail(error),
  }) as unknown as AdminIncidentDetailDependencies;

describe("admin-app incident-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminIncidentDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the incident support view when deps succeed", async () => {
    const result = await Effect.runPromise(
      loadAdminIncidentDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.incident.caseId).toBe("incident_demo");
    expect(result.incident.approvedBy).toBe("operator_demo");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminIncidentDetailRouteDataFromRequest(
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
      loadAdminIncidentDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingIncident("SupportOperationsReadAccessDeniedError"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns error with not-found copy when the helper raises a not-found error", async () => {
    const result = await Effect.runPromise(
      loadAdminIncidentDetailRouteDataFromRequest(
        buildRequest("sess-missing"),
        {},
        baseInput,
        failingIncident("SupportOperationsBreakGlassIncidentNotFoundError"),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Incident not found");
  });

  it("returns error when the support helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminIncidentDetailRouteDataFromRequest(
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
    expect(result.title).toBe("Incident detail unavailable");
    expect(result.description).toBe(
      "Upstream support-operations adapter unreachable.",
    );
  });
});
