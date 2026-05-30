/**
 * Admin-app governance-config v2 loader tests (admin-app
 * implementation plan §8.5 + §11 — Phase 3 Governance &
 * access commit 1). Covers the discriminated-union mapping of
 * the `/desk/config` loader trio backed live by
 * `listAdminRuntimeConfig{Overrides,Proposals}FromSessionId`
 * in `packages/platform/src/services/apps/admin-governance-actions.ts`:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `AdminGovernanceReadAccessDeniedError` → `denied`
 *   - `AdminGovernanceRequestContext{NotFound,Malformed}Error` → `stale-session`
 *   - boundary error → `error`
 *   - happy path → `ready` carrying overrides + proposals
 *   - optional `key` filter narrows `selected*`
 *
 * Mirrors `tests/platform/admin-app-audit-log-v2-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { platformModuleId } from "@comvestec/contracts";
import {
  loadAdminGovernanceConfigV2RouteDataFromRequest,
  type AdminGovernanceConfigV2Dependencies,
} from "../../apps/admin-app/src/lib/governance-config-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleOverrides = [
  {
    key: "runtime-config.example.key",
    moduleId: platformModuleId.runtimeConfig,
    value: "current-value",
  },
  {
    key: "runtime-config.other.key",
    moduleId: platformModuleId.runtimeConfig,
    value: 7,
  },
];

const sampleProposals = [
  {
    proposalId: "prop_01",
    key: "runtime-config.example.key",
    moduleId: platformModuleId.runtimeConfig,
    value: "proposed-value",
    runtimeValue: "current-value",
    codeValue: "declared-default",
  },
  {
    proposalId: "prop_02",
    key: "runtime-config.unrelated.key",
    moduleId: platformModuleId.runtimeConfig,
    value: null,
  },
];

const succeedingDependencies = {
  listOverrides: () => Effect.succeed(sampleOverrides),
  listProposals: () => Effect.succeed(sampleProposals),
} as unknown as AdminGovernanceConfigV2Dependencies;

const failingDependencies = (
  tag: string,
): AdminGovernanceConfigV2Dependencies =>
  ({
    listOverrides: () => Effect.fail({ _tag: tag } as const),
    listProposals: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminGovernanceConfigV2Dependencies;

const throwingDependencies = (
  error: unknown,
): AdminGovernanceConfigV2Dependencies =>
  ({
    listOverrides: () => Effect.fail(error),
    listProposals: () => Effect.fail(error),
  }) as unknown as AdminGovernanceConfigV2Dependencies;

describe("admin-app governance-config v2 loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceConfigV2RouteDataFromRequest(
        buildRequest(undefined),
        {},
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with overrides + proposals when no key filter is set", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceConfigV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        {},
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.moduleId).toBe(platformModuleId.runtimeConfig);
    expect(result.overrides).toHaveLength(2);
    expect(result.proposals).toHaveLength(2);
    expect(result.selectedKey).toBeUndefined();
    expect(result.selectedOverride).toBeUndefined();
    expect(result.selectedProposals).toHaveLength(0);
  });

  it("narrows selectedOverride + selectedProposals when key is set", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceConfigV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        { key: "runtime-config.example.key" },
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.selectedKey).toBe("runtime-config.example.key");
    expect(result.selectedOverride?.value).toBe("current-value");
    expect(result.selectedProposals).toHaveLength(1);
    expect(result.selectedProposals[0]?.runtimeValue).toBe("current-value");
    expect(result.selectedProposals[0]?.codeValue).toBe("declared-default");
  });

  it("stringifies runtime-config values into display-safe primitives", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceConfigV2RouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        {},
        succeedingDependencies,
      ),
    );
    if (result.kind !== "ready") return;
    expect(result.overrides[1]?.value).toBe("7");
    expect(result.proposals[1]?.value).toBeNull();
  });

  it("returns denied when the platform helper raises AdminGovernanceReadAccessDeniedError", async () => {
    const result = await Effect.runPromise(
      loadAdminGovernanceConfigV2RouteDataFromRequest(
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
      loadAdminGovernanceConfigV2RouteDataFromRequest(
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
      loadAdminGovernanceConfigV2RouteDataFromRequest(
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
      loadAdminGovernanceConfigV2RouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        {},
        throwingDependencies(
          new Error("Upstream runtime-config aggregate unavailable."),
        ),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("Runtime config unavailable");
    expect(result.description).toBe(
      "Upstream runtime-config aggregate unavailable.",
    );
  });
});
