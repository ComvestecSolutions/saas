/**
 * Admin-app Domain-detail loader tests (admin-app implementation
 * plan §8.10 + §11 — Phase 4 Domain operator screens commit 2).
 * Covers the discriminated-union mapping of the
 * `/desk/domain/$hostname` loader trio backed live by
 * `getCustomDomainVerificationFromSessionId`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `TenantBrandingAccessDeniedError` → `denied`
 *   - unsupported scope → `denied` (short-circuited at boundary)
 *   - not found → `not-found`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying hostname, lifecycle, DNS
 *
 * Mirrors `tests/platform/admin-app-billing-list-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { platformScope } from "@comvestec/contracts";
import {
  loadAdminDomainDetailRouteDataFromRequest,
  type AdminDomainDetailDependencies,
  type AdminDomainDetailInput,
} from "../../apps/admin-app/src/lib/domain-detail-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleBranding = {
  verificationId:
    "tenant-branding:custom-domain:organization:org_demo:verification_1",
  scope: platformScope.organization,
  scopeId: "org_demo",
  requestedHost: "ops.fixture.tenant.example",
  lifecycleState: "verifying",
  dnsProof: {
    records: [
      {
        recordType: "TXT",
        host: "_comvestec-verify.ops.fixture.tenant.example",
        value: "comvestec-domain-verify=organization:org_demo",
      },
      {
        recordType: "CNAME",
        host: "ops.fixture.tenant.example",
        value: "tenant-edge.comvestec.app",
      },
    ],
  },
  changedAt: new Date(0).toISOString(),
};

const baseInput: AdminDomainDetailInput = {
  hostname: "ops.fixture.tenant.example",
  tenant: { scope: platformScope.organization, scopeId: "org_demo" },
};

const succeedingDependencies = {
  getCustomDomainVerification: () => Effect.succeed(sampleBranding),
} as unknown as AdminDomainDetailDependencies;

const failingBranding = (tag: string): AdminDomainDetailDependencies =>
  ({
    getCustomDomainVerification: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminDomainDetailDependencies;

const throwingDependencies = (error: unknown): AdminDomainDetailDependencies =>
  ({
    getCustomDomainVerification: () => Effect.fail(error),
  }) as unknown as AdminDomainDetailDependencies;

describe("admin-app domain-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminDomainDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with lifecycle state and live DNS proof records when deps succeed", async () => {
    const result = await Effect.runPromise(
      loadAdminDomainDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.hostname).toBe("ops.fixture.tenant.example");
    expect(result.lifecycleState).toBe("verifying");
    expect(result.dnsRecords).toHaveLength(2);
    expect(result.dnsRecords[0]).toEqual({
      recordType: "TXT",
      host: "_comvestec-verify.ops.fixture.tenant.example",
      value: "comvestec-domain-verify=organization:org_demo",
    });
    expect(result.dnsRecords[1]).toEqual({
      recordType: "CNAME",
      host: "ops.fixture.tenant.example",
      value: "tenant-edge.comvestec.app",
    });
  });

  it("returns ready with an empty dnsRecords list when the verification omits publishable proof rows", async () => {
    const result = await Effect.runPromise(
      loadAdminDomainDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        {
          getCustomDomainVerification: () =>
            Effect.succeed({
              ...sampleBranding,
              dnsProof: undefined,
            }),
        } as unknown as AdminDomainDetailDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.dnsRecords).toEqual([]);
  });

  it("short-circuits to denied when tenant scope is individual or platform", async () => {
    const result = await Effect.runPromise(
      loadAdminDomainDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        {
          hostname: "ops.fixture.example",
          tenant: { scope: platformScope.individual, scopeId: "usr_demo" },
        },
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminDomainDetailRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingBranding("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the branding helper raises access-denied", async () => {
    const result = await Effect.runPromise(
      loadAdminDomainDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingBranding("TenantBrandingAccessDeniedError"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns not-found state when the verification record is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminDomainDetailRouteDataFromRequest(
        buildRequest("sess-missing"),
        {},
        baseInput,
        failingBranding("TenantBrandingCustomDomainVerificationNotFoundError"),
      ),
    );
    expect(result.kind).toBe("not-found");
    if (result.kind !== "not-found") return;
    expect(result.title).toBe("Domain not found");
  });

  it("returns error when the branding helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminDomainDetailRouteDataFromRequest(
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
    expect(result.title).toBe("Domain detail unavailable");
    expect(result.description).toBe(
      "Upstream tenant-branding adapter unreachable.",
    );
  });
});
