/**
 * Manual break-glass platform-service tests (admin-app
 * implementation plan §9 item 5). A fake repository (in-memory map)
 * + fake audit log assert the owner-locked cross-cutting invariants
 * the service enforces above the repository:
 *
 *   - reasonCatalogId decoded against ReasonCatalogIdSchema
 *     (BreakGlassReasonNotInCatalog on mismatch — typed, not string-compare)
 *   - TTL ceiling: expiresAt in (now, now + maxTtlMinutes] →
 *     BreakGlassTtlExceeded at one ms over the boundary
 *   - active-cap per grantee: BreakGlassActiveLimitExceeded at the
 *     exact `maxActiveGrantsPerSupportOperator` boundary
 *   - issue restricted to actorType.platformOperator
 *     (BreakGlassUnauthorized otherwise)
 *   - release allowed for platformOperator OR the grantee themselves
 *     (BreakGlassUnauthorized otherwise — tenant isolation)
 *   - currentBreakGlassContextForActor returns the cached entry,
 *     reconciles expired entries via computeStatusForNow, and
 *     enforces insertion-order cache eviction at cacheMaxSize
 *   - audit emission on issue / release / autoExpire keyed by
 *     platformModuleId.manualBreakGlass and the canonical
 *     manualBreakGlassAuditAction.* + reasonCatalogId.breakGlass*
 *     pair
 *   - autoExpireStaleGrants emits exactly one audit per non-empty
 *     sweep
 */
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  manualBreakGlassAuditAction,
  manualBreakGlassGrantStatus,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  type ManualBreakGlassGrant,
  type RequestContext,
} from "@comvestec/contracts";
import {
  ManualBreakGlassGrantAlreadyReleasedError,
  ManualBreakGlassGrantNotFoundError,
  type AuditLogModuleService,
  type BuildAuditEventInput,
  type ManualBreakGlassRepositoryService,
} from "@comvestec/modules";
import {
  BreakGlassActiveLimitExceeded,
  BreakGlassGrantAlreadyReleased,
  BreakGlassReasonAttachmentRequired,
  BreakGlassReasonNotInCatalog,
  BreakGlassReasonActionMismatch,
  BreakGlassTtlExceeded,
  BreakGlassUnauthorized,
  ManualBreakGlassMissingActorIdentity,
  makeManualBreakGlassService,
  type ManualBreakGlassRuntimeBounds,
  type ManualBreakGlassServiceImpl,
} from "@comvestec/platform";

const platformOperatorContext = (overrides?: {
  readonly actorId?: string;
  readonly correlationId?: string;
}): RequestContext => ({
  actorType: actorType.platformOperator,
  actorId: overrides?.actorId ?? "subject-platform-op",
  sessionId: "sess-mbg",
  correlationId: overrides?.correlationId ?? "corr-mbg-1",
  reason: "manual-break-glass service unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

const supportOperatorContext = (overrides?: {
  readonly actorId?: string;
}): RequestContext => ({
  actorType: actorType.supportOperator,
  actorId: overrides?.actorId ?? "subject-support-1",
  sessionId: "sess-mbg-support",
  correlationId: "corr-mbg-support-1",
  reason: "manual-break-glass support unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
});

const baseGrantInput = (overrides?: {
  readonly grantedTo?: string;
  readonly reasonCatalogId?: string;
  readonly reasonAttachmentText?: string;
  readonly expiresAt?: string;
}) => ({
  grantedTo: overrides?.grantedTo ?? "subject-support-1",
  targetTenant: {
    scope: platformScope.organization,
    scopeId: "tenant-acme",
  },
  reasonCatalogId:
    overrides?.reasonCatalogId ?? reasonCatalogId.breakGlassIssue,
  reasonNarrative: "Investigating webhook delivery failures",
  reasonAttachmentText:
    overrides?.reasonAttachmentText ?? "runbook://incident/INC-1042",
  expiresAt: overrides?.expiresAt ?? "2026-01-01T00:30:00.000Z",
});

const buildGrant = (
  overrides: Partial<ManualBreakGlassGrant>,
): ManualBreakGlassGrant => ({
  id: overrides.id ?? "grant-1",
  grantedTo: overrides.grantedTo ?? "subject-support-1",
  grantedBy: overrides.grantedBy ?? "subject-platform-op",
  targetTenant: overrides.targetTenant ?? {
    scope: platformScope.organization,
    scopeId: "tenant-acme",
  },
  reasonCatalogId: overrides.reasonCatalogId ?? reasonCatalogId.breakGlassIssue,
  reasonNarrative: overrides.reasonNarrative ?? "Investigating",
  issuedAt: overrides.issuedAt ?? "2026-01-01T00:00:00.000Z",
  expiresAt: overrides.expiresAt ?? "2026-01-01T00:30:00.000Z",
  status: overrides.status ?? manualBreakGlassGrantStatus.active,
  correlationId: overrides.correlationId ?? "corr-mbg-1",
  ...(overrides.releasedAt === undefined
    ? {}
    : { releasedAt: overrides.releasedAt }),
  ...(overrides.releasedBy === undefined
    ? {}
    : { releasedBy: overrides.releasedBy }),
  ...(overrides.releaseReasonCatalogId === undefined
    ? {}
    : { releaseReasonCatalogId: overrides.releaseReasonCatalogId }),
});

const createAuditFake = () => {
  const calls: BuildAuditEventInput[] = [];
  const service: AuditLogModuleService = {
    append: (input) =>
      Effect.sync(() => {
        calls.push(input);
        return {
          eventId: `evt_${calls.length}`,
          timestamp: new Date().toISOString(),
          actorId:
            input.requestContext.actorId ??
            `${input.requestContext.actorType}:anonymous`,
          tenantScope: input.requestContext.tenant.scope,
          tenantScopeId: input.requestContext.tenant.scopeId,
          moduleId: input.moduleId,
          action: input.action,
          target: input.target,
          reason: input.reason ?? input.requestContext.reason,
          correlationId: input.requestContext.correlationId,
        };
      }),
    queryByModule: () => Effect.succeed([]),
    queryByTarget: () => Effect.succeed([]),
    queryByActor: () => Effect.succeed([]),
    queryByTenant: () => Effect.succeed([]),
    requirements: Effect.succeed([]),
  };
  return { service, calls };
};

const createRepositoryFake = () => {
  const rows = new Map<string, ManualBreakGlassGrant>();
  let sequence = 0;
  const service: ManualBreakGlassRepositoryService = {
    issueGrant: (input) =>
      Effect.sync(() => {
        sequence += 1;
        const id = `grant-${sequence}`;
        const grant = buildGrant({
          id,
          grantedTo: input.grantedTo,
          grantedBy: input.grantedBy,
          targetTenant: input.targetTenant,
          reasonCatalogId: input.reasonCatalogId,
          reasonNarrative: input.reasonNarrative,
          issuedAt: input.issuedAt,
          expiresAt: input.expiresAt,
          correlationId: input.correlationId,
          status: manualBreakGlassGrantStatus.active,
        });
        rows.set(id, grant);
        return grant;
      }),
    getGrant: (id) =>
      Effect.sync(() => {
        const row = rows.get(id);
        return row === undefined ? Option.none() : Option.some(row);
      }),
    listActiveForSubject: (subjectId) =>
      Effect.sync(() =>
        [...rows.values()].filter(
          (g) =>
            g.grantedTo === subjectId &&
            g.status === manualBreakGlassGrantStatus.active,
        ),
      ),
    countActiveForSubject: (subjectId) =>
      Effect.sync(
        () =>
          [...rows.values()].filter(
            (g) =>
              g.grantedTo === subjectId &&
              g.status === manualBreakGlassGrantStatus.active,
          ).length,
      ),
    releaseGrant: (input) =>
      Effect.gen(function* () {
        const existing = rows.get(input.id);
        if (existing === undefined) {
          return yield* Effect.fail(
            new ManualBreakGlassGrantNotFoundError({ id: input.id }),
          );
        }
        if (existing.status !== manualBreakGlassGrantStatus.active) {
          return yield* Effect.fail(
            new ManualBreakGlassGrantAlreadyReleasedError({
              id: input.id,
              currentStatus: existing.status,
            }),
          );
        }
        const next: ManualBreakGlassGrant = {
          ...existing,
          status: manualBreakGlassGrantStatus.released,
          releasedAt: input.releasedAt,
          releasedBy: input.releasedBy,
          releaseReasonCatalogId: input.releaseReasonCatalogId,
        };
        rows.set(input.id, next);
        return next;
      }),
    autoExpireStaleGrants: ({ now }) =>
      Effect.sync(() => {
        const expired: string[] = [];
        for (const [id, row] of rows.entries()) {
          if (
            row.status === manualBreakGlassGrantStatus.active &&
            new Date(row.expiresAt).getTime() <= now.getTime()
          ) {
            rows.set(id, {
              ...row,
              status: manualBreakGlassGrantStatus.expired,
            });
            expired.push(id);
          }
        }
        return expired;
      }),
  };
  return { service, rows };
};

const baseBounds: ManualBreakGlassRuntimeBounds = {
  maxTtlMinutes: 60,
  maxActiveGrantsPerSupportOperator: 3,
  cacheMaxSize: 2,
};

const buildService = (overrides?: {
  readonly bounds?: Partial<ManualBreakGlassRuntimeBounds>;
  readonly now?: () => Date;
}): {
  readonly service: ManualBreakGlassServiceImpl;
  readonly audit: ReturnType<typeof createAuditFake>;
  readonly repo: ReturnType<typeof createRepositoryFake>;
} => {
  const repo = createRepositoryFake();
  const audit = createAuditFake();
  const bounds: ManualBreakGlassRuntimeBounds = {
    ...baseBounds,
    ...(overrides?.bounds ?? {}),
  };
  const service = makeManualBreakGlassService(
    repo.service,
    audit.service,
    bounds,
    overrides?.now === undefined ? undefined : { now: overrides.now },
  );
  return { service, audit, repo };
};

const collectFailure = <T>(
  cause: unknown,
  ctor: new (...args: never[]) => T,
): T | undefined => {
  if (cause === null || typeof cause !== "object") return undefined;
  if (cause instanceof ctor) return cause;
  if ("error" in cause) {
    const e = (cause as { error: unknown }).error;
    if (e instanceof ctor) return e;
  }
  for (const key of ["left", "right", "cause"] as const) {
    if (key in cause) {
      const next = collectFailure(
        (cause as Record<string, unknown>)[key],
        ctor,
      );
      if (next !== undefined) return next;
    }
  }
  return undefined;
};

describe("platform manual-break-glass service", () => {
  describe("issueGrant", () => {
    it("rejects non-platform-operator actors with BreakGlassUnauthorized", async () => {
      const { service } = buildService({
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      });
      const exit = await Effect.runPromiseExit(
        service.issueGrant({
          requestContext: supportOperatorContext(),
          grant: baseGrantInput(),
        }),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        const failure = collectFailure(exit.cause, BreakGlassUnauthorized);
        expect(failure?.args.operation).toBe("issue");
      }
    });

    it("rejects missing actorId with ManualBreakGlassMissingActorIdentity", async () => {
      const { service } = buildService({
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      });
      const ctx: RequestContext = {
        actorType: actorType.platformOperator,
        sessionId: "sess",
        correlationId: "corr",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      };
      const exit = await Effect.runPromiseExit(
        service.issueGrant({ requestContext: ctx, grant: baseGrantInput() }),
      );
      if (exit._tag === "Failure") {
        const failure = collectFailure(
          exit.cause,
          ManualBreakGlassMissingActorIdentity,
        );
        expect(failure?.args.operation).toBe("issue");
      } else {
        throw new Error("expected failure");
      }
    });

    it("rejects reasons outside the central reason-catalog with a typed channel", async () => {
      const { service } = buildService({
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      });
      const exit = await Effect.runPromiseExit(
        service.issueGrant({
          requestContext: platformOperatorContext(),
          grant: baseGrantInput({ reasonCatalogId: "not-a-catalog-entry" }),
        }),
      );
      if (exit._tag === "Failure") {
        const failure = collectFailure(
          exit.cause,
          BreakGlassReasonNotInCatalog,
        );
        expect(failure?.args.reasonCatalogId).toBe("not-a-catalog-entry");
        expect(failure?.args.operation).toBe("issue");
      } else {
        throw new Error("expected failure");
      }
    });

    it("rejects a parseable but wrong-catalog reason on issue (reason/action mismatch)", async () => {
      const { service } = buildService({
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      });
      const exit = await Effect.runPromiseExit(
        service.issueGrant({
          requestContext: platformOperatorContext(),
          grant: baseGrantInput({
            reasonCatalogId: reasonCatalogId.breakGlassRelease,
          }),
        }),
      );
      if (exit._tag === "Failure") {
        const failure = collectFailure(
          exit.cause,
          BreakGlassReasonActionMismatch,
        );
        expect(failure?.args.reasonCatalogId).toBe(
          reasonCatalogId.breakGlassRelease,
        );
        expect(failure?.args.operation).toBe("issue");
      } else {
        throw new Error("expected failure");
      }
    });

    it("rejects whitespace-only reasonAttachmentText for a requiresAttachment reason (BreakGlassReasonAttachmentRequired, no audit emission)", async () => {
      const { service, audit } = buildService({
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      });
      const exit = await Effect.runPromiseExit(
        service.issueGrant({
          requestContext: platformOperatorContext(),
          grant: baseGrantInput({ reasonAttachmentText: "   " }),
        }),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        const failure = collectFailure(
          exit.cause,
          BreakGlassReasonAttachmentRequired,
        );
        expect(failure?.args.reasonCatalogId).toBe(
          reasonCatalogId.breakGlassIssue,
        );
        expect(failure?.args.operation).toBe("issue");
      }
      expect(audit.calls).toHaveLength(0);
    });

    it("accepts expiresAt exactly at the maxTtlMinutes boundary and rejects one ms over", async () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const max = baseBounds.maxTtlMinutes * 60 * 1000;
      const atBoundary = new Date(now.getTime() + max).toISOString();
      const overBoundary = new Date(now.getTime() + max + 1).toISOString();

      {
        const { service, audit } = buildService({ now: () => now });
        const created = await Effect.runPromise(
          service.issueGrant({
            requestContext: platformOperatorContext(),
            grant: baseGrantInput({ expiresAt: atBoundary }),
          }),
        );
        expect(created.status).toBe(manualBreakGlassGrantStatus.active);
        expect(audit.calls).toHaveLength(1);
        expect(audit.calls[0]?.moduleId).toBe(
          platformModuleId.manualBreakGlass,
        );
        expect(audit.calls[0]?.action).toBe(manualBreakGlassAuditAction.issue);
        expect(audit.calls[0]?.reason).toBe(reasonCatalogId.breakGlassIssue);
      }

      {
        const { service } = buildService({ now: () => now });
        const exit = await Effect.runPromiseExit(
          service.issueGrant({
            requestContext: platformOperatorContext(),
            grant: baseGrantInput({ expiresAt: overBoundary }),
          }),
        );
        if (exit._tag === "Failure") {
          const failure = collectFailure(exit.cause, BreakGlassTtlExceeded);
          expect(failure?.args.maxTtlMinutes).toBe(baseBounds.maxTtlMinutes);
        } else {
          throw new Error("expected failure");
        }
      }
    });

    it("rejects when the grantee already holds maxActiveGrantsPerSupportOperator active grants", async () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const { service } = buildService({
        bounds: { maxActiveGrantsPerSupportOperator: 2 },
        now: () => now,
      });
      await Effect.runPromise(
        service.issueGrant({
          requestContext: platformOperatorContext({ correlationId: "c1" }),
          grant: baseGrantInput(),
        }),
      );
      await Effect.runPromise(
        service.issueGrant({
          requestContext: platformOperatorContext({ correlationId: "c2" }),
          grant: baseGrantInput(),
        }),
      );
      const exit = await Effect.runPromiseExit(
        service.issueGrant({
          requestContext: platformOperatorContext({ correlationId: "c3" }),
          grant: baseGrantInput(),
        }),
      );
      if (exit._tag === "Failure") {
        const failure = collectFailure(
          exit.cause,
          BreakGlassActiveLimitExceeded,
        );
        expect(failure?.args.activeCount).toBe(2);
        expect(failure?.args.maxActiveGrantsPerSupportOperator).toBe(2);
      } else {
        throw new Error("expected failure");
      }
    });
  });

  describe("releaseGrant", () => {
    it("allows the grantee to release their own grant", async () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const { service, audit, repo } = buildService({ now: () => now });
      const created = await Effect.runPromise(
        service.issueGrant({
          requestContext: platformOperatorContext(),
          grant: baseGrantInput(),
        }),
      );
      const released = await Effect.runPromise(
        service.releaseGrant({
          requestContext: supportOperatorContext({
            actorId: created.grantedTo,
          }),
          release: {
            id: created.id,
            releaseReasonCatalogId: reasonCatalogId.breakGlassRelease,
          },
        }),
      );
      expect(released.status).toBe(manualBreakGlassGrantStatus.released);
      expect(released.releasedBy).toBe(created.grantedTo);
      expect(repo.rows.get(created.id)?.status).toBe(
        manualBreakGlassGrantStatus.released,
      );
      const releaseAuditCall = audit.calls.find(
        (call) => call.action === manualBreakGlassAuditAction.release,
      );
      expect(releaseAuditCall?.reason).toBe(reasonCatalogId.breakGlassRelease);
      expect(releaseAuditCall?.target).toBe(created.id);
    });

    it("rejects unrelated subjects with BreakGlassUnauthorized (tenant isolation)", async () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const { service } = buildService({ now: () => now });
      const created = await Effect.runPromise(
        service.issueGrant({
          requestContext: platformOperatorContext(),
          grant: baseGrantInput(),
        }),
      );
      const exit = await Effect.runPromiseExit(
        service.releaseGrant({
          requestContext: supportOperatorContext({ actorId: "intruder" }),
          release: {
            id: created.id,
            releaseReasonCatalogId: reasonCatalogId.breakGlassRelease,
          },
        }),
      );
      if (exit._tag === "Failure") {
        const failure = collectFailure(exit.cause, BreakGlassUnauthorized);
        expect(failure?.args.operation).toBe("release");
        expect(failure?.args.requestingActorId).toBe("intruder");
      } else {
        throw new Error("expected failure");
      }
    });

    it("remaps double-release into BreakGlassGrantAlreadyReleased", async () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const { service } = buildService({ now: () => now });
      const created = await Effect.runPromise(
        service.issueGrant({
          requestContext: platformOperatorContext(),
          grant: baseGrantInput(),
        }),
      );
      await Effect.runPromise(
        service.releaseGrant({
          requestContext: platformOperatorContext(),
          release: {
            id: created.id,
            releaseReasonCatalogId: reasonCatalogId.breakGlassRelease,
          },
        }),
      );
      const exit = await Effect.runPromiseExit(
        service.releaseGrant({
          requestContext: platformOperatorContext(),
          release: {
            id: created.id,
            releaseReasonCatalogId: reasonCatalogId.breakGlassRelease,
          },
        }),
      );
      if (exit._tag === "Failure") {
        const failure = collectFailure(
          exit.cause,
          BreakGlassGrantAlreadyReleased,
        );
        expect(failure?.args.id).toBe(created.id);
      } else {
        throw new Error("expected failure");
      }
    });
  });

  describe("currentBreakGlassContextForActor", () => {
    it("invalidates an expired cache entry instead of returning it", async () => {
      let nowMs = new Date("2026-01-01T00:00:00.000Z").getTime();
      const { service } = buildService({
        now: () => new Date(nowMs),
      });
      const created = await Effect.runPromise(
        service.issueGrant({
          requestContext: platformOperatorContext(),
          grant: baseGrantInput({
            expiresAt: "2026-01-01T00:05:00.000Z",
          }),
        }),
      );
      // Prime cache while still active
      const primed = await Effect.runPromise(
        service.currentBreakGlassContextForActor({
          requestContext: platformOperatorContext(),
          subjectId: created.grantedTo,
        }),
      );
      expect(Option.isSome(primed)).toBe(true);

      // Advance past expiresAt — cached entry must be evicted, and
      // because the repository still has the row as `active` but it
      // is computed-stale, no Some is returned.
      nowMs = new Date("2026-01-01T00:10:00.000Z").getTime();
      const afterExpiry = await Effect.runPromise(
        service.currentBreakGlassContextForActor({
          requestContext: platformOperatorContext(),
          subjectId: created.grantedTo,
        }),
      );
      expect(Option.isNone(afterExpiry)).toBe(true);
    });

    it("evicts the oldest cached subject when cacheMaxSize is exceeded", async () => {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const { service, repo } = buildService({
        bounds: { cacheMaxSize: 2 },
        now: () => now,
      });
      // Three different subjects, each with one active grant.
      for (const subjectId of ["s-1", "s-2", "s-3"]) {
        await Effect.runPromise(
          service.issueGrant({
            requestContext: platformOperatorContext({
              correlationId: `c-${subjectId}`,
            }),
            grant: baseGrantInput({ grantedTo: subjectId }),
          }),
        );
      }
      // Prime cache for s-1 and s-2.
      await Effect.runPromise(
        service.currentBreakGlassContextForActor({
          requestContext: platformOperatorContext(),
          subjectId: "s-1",
        }),
      );
      await Effect.runPromise(
        service.currentBreakGlassContextForActor({
          requestContext: platformOperatorContext(),
          subjectId: "s-2",
        }),
      );
      // Now flip s-1 to released directly in the repository so we
      // can detect cache vs. repository. If the s-1 entry is still
      // cached, the next call returns Some (stale). If eviction
      // worked when s-3 was loaded, s-1 will re-query and return None.
      for (const grant of repo.rows.values()) {
        if (grant.grantedTo === "s-1") {
          repo.rows.set(grant.id, {
            ...grant,
            status: manualBreakGlassGrantStatus.released,
          });
        }
      }
      // Loading s-3 should evict s-1 (the oldest).
      await Effect.runPromise(
        service.currentBreakGlassContextForActor({
          requestContext: platformOperatorContext(),
          subjectId: "s-3",
        }),
      );
      const reloaded = await Effect.runPromise(
        service.currentBreakGlassContextForActor({
          requestContext: platformOperatorContext(),
          subjectId: "s-1",
        }),
      );
      // s-1 must be re-queried and now returns None (released).
      expect(Option.isNone(reloaded)).toBe(true);
    });
  });

  describe("autoExpireStaleGrants", () => {
    it("emits exactly one audit per non-empty sweep keyed by manualBreakGlassAuditAction.autoExpire", async () => {
      const baseNow = new Date("2026-01-01T00:00:00.000Z");
      const { service, audit, repo } = buildService({ now: () => baseNow });
      await Effect.runPromise(
        service.issueGrant({
          requestContext: platformOperatorContext({ correlationId: "c-stale" }),
          grant: baseGrantInput({
            expiresAt: "2026-01-01T00:01:00.000Z",
          }),
        }),
      );
      await Effect.runPromise(
        service.issueGrant({
          requestContext: platformOperatorContext({ correlationId: "c-fresh" }),
          grant: baseGrantInput({
            grantedTo: "subject-support-2",
            expiresAt: "2026-01-01T00:55:00.000Z",
          }),
        }),
      );
      const issueAudits = audit.calls.length;
      const expired = await Effect.runPromise(
        service.autoExpireStaleGrants({
          requestContext: platformOperatorContext(),
          now: new Date("2026-01-01T00:30:00.000Z"),
        }),
      );
      expect(expired).toHaveLength(1);
      const sweepAudits = audit.calls.slice(issueAudits);
      expect(sweepAudits).toHaveLength(1);
      expect(sweepAudits[0]?.action).toBe(
        manualBreakGlassAuditAction.autoExpire,
      );
      expect(sweepAudits[0]?.moduleId).toBe(platformModuleId.manualBreakGlass);

      // No-op second sweep emits no audit.
      const expired2 = await Effect.runPromise(
        service.autoExpireStaleGrants({
          requestContext: platformOperatorContext(),
          now: new Date("2026-01-01T00:31:00.000Z"),
        }),
      );
      expect(expired2).toHaveLength(0);
      expect(audit.calls.length).toBe(issueAudits + 1);

      // The fresh row stayed active.
      const stillActive = [...repo.rows.values()].filter(
        (g) => g.status === manualBreakGlassGrantStatus.active,
      );
      expect(stillActive).toHaveLength(1);
      expect(stillActive[0]?.grantedTo).toBe("subject-support-2");
    });
  });
});
