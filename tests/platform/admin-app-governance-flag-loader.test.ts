/**
 * Admin-app governance-flag v2 loader tests (admin-app
 * implementation plan §8.6 + §11 — Phase 3 Governance &
 * access commit 1). Covers the discriminated-union mapping of
 * the `/r/flag` loader trio backed live by
 * `listAdminFeatureFlagsFromSessionId` in
 * `packages/platform/src/services/apps/admin-governance-actions.ts`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `AdminGovernanceReadAccessDeniedError` → `denied`
 *   - `AdminGovernanceRequestContext{NotFound,Malformed}Error` → `stale-session`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying flags
 *   - optional `flagKey` filter narrows `selectedFlag`
 *
 * Mirrors `tests/platform/admin-app-audit-log-v2-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { featureFlagLifecycle, platformModuleId } from "@comvestec/contracts";
import {
  loadAdminGovernanceFlagV2RouteDataFromRequest,
  type AdminGovernanceFlagV2Dependencies,
} from "../../apps/admin-app/src/lib/governance-flag-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleFlags = [
  {
    key: "feature-flags.tenant.experimental",
    moduleId: platformModuleId.featureFlags,
    lifecycle: featureFlagLifecycle.active,
    enabled: true,
  },
  {
    key: "feature-flags.tenant.deprecated",
    moduleId: platformModuleId.featureFlags,
    lifecycle: featureFlagLifecycle.deprecated,
    enabled: false,
  },
];

const succeedingDependencies = {
  listFlags: () => Effect.succeed(sampleFlags),
} as unknown as AdminGovernanceFlagV2Dependencies;

const failingDependencies = (tag: string): AdminGovernanceFlagV2Dependencies =>
  ({
    listFlags: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminGovernanceFlagV2Dependencies;

const throwingDependencies = (
  error: unknown,
): AdminGovernanceFlagV2Dependencies =>
  ({
    listFlags: () => Effect.fail(error),
  }) as unknown as AdminGovernanceFlagV2Dependencies;

describe("admin-app governance-flag v2 loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceFlagV2RouteDataFromRequest(
        buildRequest(undefined),
        {},
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the full flag list when no flagKey filter is set", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceFlagV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.moduleId).toBe(platformModuleId.featureFlags);
    expect(result.flags).toHaveLength(2);
    expect(result.selectedFlagKey).toBeUndefined();
    expect(result.selectedFlag).toBeUndefined();
  });

  it("narrows selectedFlag when flagKey is set", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceFlagV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { flagKey: "feature-flags.tenant.experimental" },
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.selectedFlagKey).toBe("feature-flags.tenant.experimental");
    expect(result.selectedFlag?.lifecycle).toBe(featureFlagLifecycle.active);
  });

  it("returns denied when the platform helper raises AdminGovernanceReadAccessDeniedError", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceFlagV2RouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        {},
        failingDependencies("AdminGovernanceReadAccessDeniedError"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceFlagV2RouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        {},
        failingDependencies("AdminGovernanceRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns stale-session when the request context is malformed", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceFlagV2RouteDataFromRequest(
        buildRequest("sess-malformed"),
        {},
        {},
        failingDependencies("AdminGovernanceRequestContextMalformedError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when the platform helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceFlagV2RouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        {},
        throwingDependencies(
          new Error("Upstream feature-flag aggregate unavailable."),
        ),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Feature flags unavailable");
    expect(result.description).toBe(
      "Upstream feature-flag aggregate unavailable.",
    );
  });
});
