/**
 * Admin-app Capability snapshot v2 loader tests (admin-app
 * implementation plan §9 item 13 + Phase 2 Desk Core cutover).
 * Covers the discriminated-union mapping:
 *
 *   - `SubscriberJourneySessionIdMissingError` → `shell`
 *   - `IdentitySessionRequestContextNotFoundError` → `stale-session`
 *   - `CapabilitySnapshotV2MissingActorIdentity` → `stale-session`
 *   - `CapabilitySnapshotV2Unauthorized` → `denied`
 *   - boundary `ParseError` → `error`
 *   - happy path → `ready` carrying `snapshot` + `fromCache`
 */
import { describe, expect, it } from "vitest";
import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  adminOrgRole,
  permissionScope,
  platformScope,
  type CapabilitySnapshotV2,
  type RequestContext,
} from "@comvestec/contracts";
import { loadAdminCapabilitySnapshotV2RouteDataFromRequest } from "../../apps/admin-app/src/lib/capability-snapshot-v2-route-data";

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess-admin-capability-snapshot-v2-loader",
  correlationId: "corr-admin-capability-snapshot-v2-loader",
  reason: "capability-snapshot-v2 loader test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const buildSnapshot = (
  overrides: Partial<CapabilitySnapshotV2> = {},
): CapabilitySnapshotV2 => ({
  actorId: overrides.actorId ?? trustedRequestContext.actorId,
  actorType: overrides.actorType ?? trustedRequestContext.actorType,
  scopes: overrides.scopes ?? [platformScope.platform],
  permissions: overrides.permissions ?? [
    permissionScope.capabilitySnapshotV2Read,
  ],
  adminOrgRole: overrides.adminOrgRole ?? adminOrgRole.owner,
  navigationMap: overrides.navigationMap ?? [],
  highRiskAffordances: overrides.highRiskAffordances ?? [],
  derivedAt: overrides.derivedAt ?? "2026-01-01T00:00:00.000Z",
  correlationId: overrides.correlationId ?? trustedRequestContext.correlationId,
});

const buildRequest = (sessionId: string | undefined) =>
  new Request("https://admin.local/", {
    headers:
      sessionId === undefined ? {} : { "x-comvestec-session-id": sessionId },
  });

const resolveTrustedRequestContext = (
  _environment: unknown,
  sessionId: string,
) => Effect.succeed({ ...trustedRequestContext, sessionId });

describe("admin-app capability-snapshot-v2 loader", () => {
  it("returns shell when the subscriber-journey session id is missing", async () => {
    const result = await Effect.runPromise(
      loadAdminCapabilitySnapshotV2RouteDataFromRequest(
        buildRequest(undefined),
        {},
        resolveTrustedRequestContext,
        () => Effect.die(new Error("snapshot should not run")),
      ),
    );
    expect(result.kind).toBe("shell");
  });

  it("returns stale-session when the identity-session lookup misses", async () => {
    const result = await Effect.runPromise(
      loadAdminCapabilitySnapshotV2RouteDataFromRequest(
        buildRequest("sess-stale"),
        {},
        (_environment: unknown, sessionId: string) =>
          Effect.fail({
            _tag: "IdentitySessionRequestContextNotFoundError",
            sessionId,
          } as const),
        () => Effect.die(new Error("snapshot should not run")),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns stale-session when the service reports a missing actor identity", async () => {
    const result = await Effect.runPromise(
      loadAdminCapabilitySnapshotV2RouteDataFromRequest(
        buildRequest("sess-missing-actor"),
        {},
        resolveTrustedRequestContext,
        () =>
          Effect.fail({
            _tag: "CapabilitySnapshotV2MissingActorIdentity",
            args: { operation: "deriveSnapshot" as const },
          } as const),
      ),
    );
    expect(result.kind).toBe("stale-session");
  });

  it("returns denied when the service reports an unauthorized actor", async () => {
    const result = await Effect.runPromise(
      loadAdminCapabilitySnapshotV2RouteDataFromRequest(
        buildRequest("sess-unauthorized"),
        {},
        resolveTrustedRequestContext,
        () =>
          Effect.fail({
            _tag: "CapabilitySnapshotV2Unauthorized",
            args: {
              operation: "deriveSnapshot" as const,
              requestingActorId:
                trustedRequestContext.actorId ?? "unknown-actor",
              requestingActorType: actorType.individualUser,
            },
          } as const),
      ),
    );
    expect(result.kind).toBe("denied");
  });

  it("returns error when the boundary decode fails (ParseError)", async () => {
    const decode = Schema.decodeUnknown(Schema.Struct({ x: Schema.Number }));
    const result = await Effect.runPromise(
      loadAdminCapabilitySnapshotV2RouteDataFromRequest(
        buildRequest("sess-parse"),
        {},
        resolveTrustedRequestContext,
        () =>
          decode({ x: "not-a-number" }) as unknown as ReturnType<
            typeof Effect.fail<ParseResult.ParseError>
          >,
      ),
    );
    expect(result.kind).toBe("error");
  });

  it("returns ready with the snapshot and fromCache flag", async () => {
    const snapshot = buildSnapshot();
    const result = await Effect.runPromise(
      loadAdminCapabilitySnapshotV2RouteDataFromRequest(
        buildRequest("sess-ready"),
        {},
        resolveTrustedRequestContext,
        () =>
          Effect.succeed({
            snapshot,
            fromCache: true,
          }),
      ),
    );
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.snapshot.actorId).toBe(trustedRequestContext.actorId);
    expect(result.fromCache).toBe(true);
  });
});
