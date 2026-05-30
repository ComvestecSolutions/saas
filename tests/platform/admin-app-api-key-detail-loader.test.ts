/**
 * Admin-app API-key-detail loader tests (admin-app
 * implementation plan §8.12 + §11 — Phase 5 Support /
 * compliance / integrations operator screens commit 3).
 * Covers the discriminated-union mapping of the
 * `/desk/api-key/$keyId` loader trio backed live by
 * `listWebhookApiKeysFromSessionId` through
 * `resolveTrustedRequestContextFromSessionId` and filtered to
 * the requested api-key id under the documented escape hatch:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `WebhooksApiAccessAccessDeniedError` → `denied`
 *   - `WebhooksApiAccessUnauthenticatedActorError` → `stale-session`
 *   - filter miss → `error` with the not-found copy
 *   - boundary error → `error`
 *   - happy path → `ready` carrying the api-key + scope echo
 *
 * Mirrors `tests/platform/admin-app-legal-hold-detail-loader.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { platformScope, webhookApiKeyStatus } from "@comvestec/contracts";
import {
  loadAdminApiKeyDetailRouteDataFromRequest,
  type AdminApiKeyDetailDependencies,
  type AdminApiKeyDetailInput,
} from "../../apps/admin-app/src/lib/api-key-detail-route-data";

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const sampleApiKey = {
  apiKeyId: "api_demo_01",
  label: "Demo key",
  prefix: "demo_01",
  status: webhookApiKeyStatus.active,
  createdAt: new Date(0).toISOString(),
};

const baseInput: AdminApiKeyDetailInput = {
  keyId: "api_demo_01",
  scope: platformScope.organization,
  scopeId: "org_demo",
};

const succeedingDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  listWebhookApiKeys: () => Effect.succeed([sampleApiKey]),
} as unknown as AdminApiKeyDetailDependencies;

const emptyListDependencies = {
  resolveTrustedRequestContext: () => Effect.succeed({}),
  listWebhookApiKeys: () => Effect.succeed([]),
} as unknown as AdminApiKeyDetailDependencies;

const failingResolveContext = (tag: string): AdminApiKeyDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.fail({ _tag: tag } as const),
    listWebhookApiKeys: () => Effect.succeed([sampleApiKey]),
  }) as unknown as AdminApiKeyDetailDependencies;

const failingApiKeys = (tag: string): AdminApiKeyDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listWebhookApiKeys: () => Effect.fail({ _tag: tag } as const),
  }) as unknown as AdminApiKeyDetailDependencies;

const throwingDependencies = (error: unknown): AdminApiKeyDetailDependencies =>
  ({
    resolveTrustedRequestContext: () => Effect.succeed({}),
    listWebhookApiKeys: () => Effect.fail(error),
  }) as unknown as AdminApiKeyDetailDependencies;

describe("admin-app api-key-detail loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminApiKeyDetailRouteDataFromRequest(
        buildRequest(undefined),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns ready with the matching api key", async () => {
    const result = await Effect.runPromise(
      loadAdminApiKeyDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        succeedingDependencies,
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.apiKey.apiKeyId).toBe("api_demo_01");
    expect(result.scope).toBe(platformScope.organization);
    expect(result.scopeId).toBe("org_demo");
  });

  it("returns not-found error when the api-key id is absent", async () => {
    const result = await Effect.runPromise(
      loadAdminApiKeyDetailRouteDataFromRequest(
        buildRequest("sess-ok"),
        {},
        baseInput,
        emptyListDependencies,
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("API key not found");
  });

  it("returns stale-session when the request context cannot be resolved", async () => {
    const result = await Effect.runPromise(
      loadAdminApiKeyDetailRouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        baseInput,
        failingResolveContext("IdentitySessionRequestContextNotFoundError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the api-key helper raises access-denied", async () => {
    const result = await Effect.runPromise(
      loadAdminApiKeyDetailRouteDataFromRequest(
        buildRequest("sess-denied"),
        {},
        baseInput,
        failingApiKeys("WebhooksApiAccessAccessDeniedError"),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns stale-session when the api-key helper raises unauthenticated-actor", async () => {
    const result = await Effect.runPromise(
      loadAdminApiKeyDetailRouteDataFromRequest(
        buildRequest("sess-unauth"),
        {},
        baseInput,
        failingApiKeys("WebhooksApiAccessUnauthenticatedActorError"),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns error when the api-key helper raises an untagged Error", async () => {
    const result = await Effect.runPromise(
      loadAdminApiKeyDetailRouteDataFromRequest(
        buildRequest("sess-boom"),
        {},
        baseInput,
        throwingDependencies(new Error("Upstream api-key adapter down.")),
      ),
    );
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.title).toBe("API key detail unavailable");
    expect(result.description).toBe("Upstream api-key adapter down.");
  });
});
