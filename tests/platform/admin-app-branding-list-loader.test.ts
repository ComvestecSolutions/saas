/**
 * Admin-app Branding-list loader tests (admin-app implementation
 * plan §8.10 + §11 — Phase 4 Domain operator screens commit 2).
 * Covers the discriminated-union mapping of the `/desk/branding`
 * loader trio backed live by
 * `getTenantBrandingSupportSafeViewFromSessionId`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `TenantBrandingAccessDeniedError` → `denied`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying rows + selectedTenantId
 *   - unsupported scope → `ready` row flagged `unsupported`
 *
 * Mirrors `tests/platform/admin-app-billing-list-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { platformScope } from "@comvestec/contracts";
import {
  loadAdminBrandingListRouteDataFromRequest,
  type AdminBrandingListDependencies,
  type AdminBrandingListInput,
} from "../../apps/admin-app/src/lib/branding-list-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleBranding = {
  scope: platformScope.organization,
  scopeId: "org_demo",
  companyName: "Fixture Org",
  customDomainStatus: "verifying",
  effectiveScope: platformScope.organization,
  changedAt: new Date(0).toISOString(),
};

const baseInput: AdminBrandingListInput = {
  tenantTargets: [{ scope: platformScope.organization, scopeId: "org_demo" }],
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  getTenantBrandingSupportSafeView: () => Effect.succeed(sampleBranding),
} as unknown as AdminBrandingListDependencies;

const failingResolveContext = (tag: string): AdminBrandingListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    getTenantBrandingSupportSafeView: () => Effect.succeed(sampleBranding),
  }) as unknown as AdminBrandingListDependencies;

const failingBranding = (tag: string): AdminBrandingListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getTenantBrandingSupportSafeView: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminBrandingListDependencies;

const throwingDependencies = (error: unknown): AdminBrandingListDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    getTenantBrandingSupportSafeView: () => Effect.fail(error),
  }) as unknown as AdminBrandingListDependencies;

describe("admin-app branding-list loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminBrandingListRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with per-tenant rows when deps succeed", async () => {
    const result = await Effect.runPromise(
      loadAdminBrandingListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.unsupported).toBe(false);
    expect(result.rows[0]?.branding?.companyName).toBe("Fixture Org");
  });

  it("flags individual/platform-scope rows as unsupported", async () => {
    const result = await Effect.runPromise(
      loadAdminBrandingListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        {
          tenantTargets: [
            { scope: platformScope.individual, scopeId: "usr_demo" },
            { scope: platformScope.platform, scopeId: "platform" },
          ],
        },
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.unsupported).toBe(true);
    expect(result.rows[1]?.unsupported).toBe(true);
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminBrandingListRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the branding helper raises access-denied", async () => {
    const result = await Effect.runPromise(
      loadAdminBrandingListRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingBranding("TenantBrandingAccessDeniedError"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns error when the branding helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminBrandingListRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(
          new Error("Upstream tenant-branding adapter unreachable."),
        ),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Branding posture unavailable");
    expect(result.description).toBe(
      "Upstream tenant-branding adapter unreachable.",
    );
  });

  it("preserves selectedTenantId in the ready payload", async () => {
    const result = await Effect.runPromise(
      loadAdminBrandingListRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { ...baseInput, selectedTenantId: "org_demo" },
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.selectedTenantId).toBe("org_demo");
  });
});
