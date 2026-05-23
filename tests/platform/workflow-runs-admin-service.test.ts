/**
 * Workflow runs admin envelope platform service tests (admin-app
 * implementation plan §9 item 15). Pins owner-locked invariants
 * enforced ABOVE the injected `WorkflowRunsPort` +
 * `AdminOrganizationRoleLookupPort` in
 * `packages/platform/src/services/domains/workflow-runs-admin-service.ts`:
 *
 *   - anonymous list/detail/replay/cancel → Unauthorized, NO audit
 *   - support operator allowed to list + detail; denied write
 *   - admin-owner allowed to replay/cancel; admin-viewer denied
 *   - pageSize > maximum → WorkflowRunsAdminPageSizeTooLarge
 *   - reason not in catalog / action mismatch / missing attachment
 *     rejections (writes)
 *   - bounded list cache: identical key returns `fromCache: true`
 *     within TTL and re-derives after TTL expires; insertion-order
 *     eviction past `cacheMaxSize`; replay clears the cache
 *   - partialFailures pass-through populates the envelope
 *   - field-security: non-operator readers receive redacted
 *     `lastError` on summaries and redacted `payloadProjection` +
 *     `lastError` on detail; operators see raw values
 *   - audit appended exactly once per accepted operation
 */
import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  platformModuleId,
  platformScope,
  reasonCatalogId,
  workflowRunsAdminAuditAction,
  workflowRunStatus,
  type AuditEvent,
  type RequestContext,
  type WorkflowRunDetail,
  type WorkflowRunSummary,
  type WorkflowRunsListInput,
} from "@comvestec/contracts";
import {
  adminMemberRole,
  type AdminMemberRole,
  type AuditLogModuleService,
} from "@comvestec/modules";
import {
  makeStubWorkflowRunsPort,
  makeWorkflowRunsAdminService,
  WorkflowRunsAdminPageSizeTooLarge,
  WorkflowRunsAdminReasonActionMismatch,
  WorkflowRunsAdminReasonAttachmentRequired,
  WorkflowRunsAdminReasonNotInCatalog,
  WorkflowRunsAdminUnauthorized,
  type WorkflowRunsAdminRoleLookupPortService,
  type WorkflowRunsAdminFieldSecurityPortService,
  type WorkflowRunsAdminRuntimeBounds,
  type WorkflowRunsPortService,
} from "@comvestec/platform";

const tenant = {
  scope: platformScope.platform,
  scopeId: platformScope.platform,
} as const;

const operatorContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_op",
  sessionId: "sess_wfra",
  correlationId: "corr_wfra_op",
  reason: undefined,
  tenant,
};

const supportContext: RequestContext = {
  actorType: actorType.supportOperator,
  actorId: "usr_support",
  sessionId: "sess_wfra",
  correlationId: "corr_wfra_support",
  reason: undefined,
  tenant,
};

const orgMemberContext: RequestContext = {
  actorType: actorType.organizationMember,
  actorId: "usr_member",
  sessionId: "sess_wfra",
  correlationId: "corr_wfra_member",
  reason: undefined,
  tenant,
};

const anonymousContext: RequestContext = {
  actorType: actorType.anonymous,
  actorId: undefined,
  sessionId: undefined,
  correlationId: "corr_wfra_anon",
  reason: undefined,
  tenant,
};

const defaultBounds: WorkflowRunsAdminRuntimeBounds = {
  cacheMaxSize: 4,
  cacheTtlSeconds: 5,
  listPageSizeMax: 50,
};

type AuditCall = {
  readonly action: string;
  readonly target: string;
  readonly reason: string | undefined;
};

const createAuditDouble = () => {
  const calls: AuditCall[] = [];
  const service: AuditLogModuleService = {
    append: (input) => {
      calls.push({
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
        recordedAt: "2026-06-01T00:00:00.000Z",
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
): WorkflowRunsAdminRoleLookupPortService => ({
  lookupRole: (input) =>
    Effect.succeed({ role: rolesByActor.get(input.actorId) }),
});

const createDefaultFieldSecurity =
  (): WorkflowRunsAdminFieldSecurityPortService => ({
    redactRegulatedSensitive: (actorTypeValue) =>
      actorTypeValue !== actorType.platformOperator &&
      actorTypeValue !== actorType.supportOperator,
  });

const buildSummary = (
  overrides: Partial<WorkflowRunSummary> = {},
): WorkflowRunSummary => ({
  runId: "wf_run_1",
  moduleId: platformModuleId.workflowRunsAdmin,
  workflowKey: "demo.workflow",
  status: workflowRunStatus.failed,
  queuedAt: "2026-05-18T12:00:00.000Z",
  attempt: 1,
  lastError: "boom",
  ...overrides,
});

const buildDetail = (
  overrides: Partial<WorkflowRunDetail> = {},
): WorkflowRunDetail => ({
  runId: "wf_run_1",
  moduleId: platformModuleId.workflowRunsAdmin,
  workflowKey: "demo.workflow",
  status: workflowRunStatus.failed,
  queuedAt: "2026-05-18T12:00:00.000Z",
  attempt: 1,
  lastError: "boom",
  payloadProjection: '{"orderId":"ord_1"}',
  steps: [],
  auditCorrelationId: "corr_workflow_runs_admin_detail",
  ...overrides,
});

type PortOverrides = {
  readonly summaries?: ReadonlyArray<WorkflowRunSummary>;
  readonly detail?: WorkflowRunDetail | undefined;
  readonly partialFailures?: ReadonlyArray<{
    readonly bucket: string;
    readonly reason: string;
  }>;
};

const createPortDouble = (
  overrides: PortOverrides = {},
): WorkflowRunsPortService => {
  const stub = makeStubWorkflowRunsPort();
  return {
    ...stub,
    listRuns: () =>
      Effect.succeed({
        runs: overrides.summaries ?? [],
        ...(overrides.partialFailures === undefined
          ? {}
          : { partialFailures: overrides.partialFailures }),
      }),
    getRunDetail: () =>
      Effect.succeed(
        overrides.detail === undefined
          ? Option.none<WorkflowRunDetail>()
          : Option.some(overrides.detail),
      ),
    replayRun: () => Effect.succeed({ accepted: true as const }),
    cancelRun: () => Effect.succeed({ accepted: true as const }),
  };
};

type ServiceOverrides = {
  readonly port?: WorkflowRunsPortService;
  readonly rolesByActor?: ReadonlyMap<string, AdminMemberRole | undefined>;
  readonly bounds?: WorkflowRunsAdminRuntimeBounds;
  readonly now?: () => Date;
  readonly fieldSecurity?: WorkflowRunsAdminFieldSecurityPortService;
};

const buildService = (overrides: ServiceOverrides = {}) => {
  const audit = createAuditDouble();
  const port = overrides.port ?? createPortDouble();
  const roleLookupPort = createRoleLookupDouble(
    overrides.rolesByActor ?? new Map(),
  );
  const fieldSecurityPort =
    overrides.fieldSecurity ?? createDefaultFieldSecurity();
  const service = makeWorkflowRunsAdminService({
    auditLog: audit.service,
    workflowRunsPort: port,
    roleLookupPort,
    fieldSecurityPort,
    bounds: overrides.bounds ?? defaultBounds,
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
  });
  return { service, audit };
};

const defaultListInput: WorkflowRunsListInput = {
  requestContext: operatorContext,
  filters: {},
  pageSize: 25,
};

describe("workflow-runs-admin platform service", () => {
  it("rejects anonymous list with Unauthorized and emits no audit", async () => {
    const { service, audit } = buildService();
    const result = await Effect.runPromiseExit(
      service.listRuns({
        ...defaultListInput,
        requestContext: anonymousContext,
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      const cause = result.cause;
      expect(JSON.stringify(cause)).toContain("WorkflowRunsAdminUnauthorized");
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("allows platform-operator list and emits exactly one audit", async () => {
    const summary = buildSummary();
    const { service, audit } = buildService({
      port: createPortDouble({ summaries: [summary] }),
    });
    const view = await Effect.runPromise(service.listRuns(defaultListInput));
    expect(view.fromCache).toBe(false);
    expect(view.result.runs).toHaveLength(1);
    expect(view.result.runs[0]!.lastError).toBe("boom");
    expect(audit.calls).toEqual([
      {
        action: workflowRunsAdminAuditAction.listed,
        target: "pageSize:25",
        reason: reasonCatalogId.workflowRunsAdminReplay,
      },
    ]);
  });

  it("redacts regulated-sensitive `lastError` for non-operator readers", async () => {
    const summary = buildSummary();
    const detail = buildDetail();
    const port = createPortDouble({ summaries: [summary], detail });
    const rolesByActor = new Map<string, AdminMemberRole | undefined>([
      [orgMemberContext.actorId!, adminMemberRole.viewer],
    ]);
    const { service } = buildService({ port, rolesByActor });

    const list = await Effect.runPromise(
      service.listRuns({
        ...defaultListInput,
        requestContext: orgMemberContext,
      }),
    );
    expect(list.result.runs[0]!.lastError).toBe("[redacted]");

    const det = await Effect.runPromise(
      service.getRunDetail({
        requestContext: orgMemberContext,
        runId: detail.runId,
      }),
    );
    expect(Option.isSome(det.detail)).toBe(true);
    if (Option.isSome(det.detail)) {
      expect(det.detail.value.payloadProjection).toBe("[redacted]");
      expect(det.detail.value.lastError).toBe("[redacted]");
    }
  });

  it("denies support-operator write attempts", async () => {
    const { service, audit } = buildService();
    const result = await Effect.runPromiseExit(
      service.replayRun({
        requestContext: supportContext,
        runId: "wf_run_1",
        reason: reasonCatalogId.workflowRunsAdminReplay,
        reasonAttachmentText: "ticket COM-1",
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("Unauthorized");
    }
    expect(audit.calls).toHaveLength(0);
  });

  it("allows admin-owner replay and clears the list cache", async () => {
    const summary = buildSummary();
    const port = createPortDouble({ summaries: [summary] });
    const adminOwnerContext: RequestContext = {
      ...operatorContext,
      actorType: actorType.organizationAdmin,
      actorId: "usr_admin_owner",
    };
    const rolesByActor = new Map<string, AdminMemberRole | undefined>([
      [adminOwnerContext.actorId!, adminMemberRole.adminOwner],
    ]);
    const { service, audit } = buildService({ port, rolesByActor });

    const listView = await Effect.runPromise(
      service.listRuns(defaultListInput),
    );
    expect(listView.fromCache).toBe(false);
    const cachedAgain = await Effect.runPromise(
      service.listRuns(defaultListInput),
    );
    expect(cachedAgain.fromCache).toBe(true);

    const replay = await Effect.runPromise(
      service.replayRun({
        requestContext: adminOwnerContext,
        runId: summary.runId,
        reason: reasonCatalogId.workflowRunsAdminReplay,
        reasonAttachmentText: "ticket COM-7",
      }),
    );
    expect(replay.accepted).toBe(true);

    const afterReplay = await Effect.runPromise(
      service.listRuns(defaultListInput),
    );
    expect(afterReplay.fromCache).toBe(false);

    expect(audit.calls.map((c) => c.action)).toEqual([
      workflowRunsAdminAuditAction.listed,
      workflowRunsAdminAuditAction.listed,
      workflowRunsAdminAuditAction.replayed,
      workflowRunsAdminAuditAction.listed,
    ]);
  });

  it("denies admin-viewer write attempts", async () => {
    const viewerContext: RequestContext = {
      ...operatorContext,
      actorType: actorType.organizationMember,
      actorId: "usr_viewer",
    };
    const rolesByActor = new Map<string, AdminMemberRole | undefined>([
      [viewerContext.actorId!, adminMemberRole.viewer],
    ]);
    const { service } = buildService({ rolesByActor });
    const result = await Effect.runPromiseExit(
      service.cancelRun({
        requestContext: viewerContext,
        runId: "wf_run_1",
        reason: reasonCatalogId.workflowRunsAdminCancel,
        reasonAttachmentText: "ticket COM-9",
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("Unauthorized");
    }
  });

  it("rejects pageSize above the configured maximum", async () => {
    const { service } = buildService({
      bounds: { ...defaultBounds, listPageSizeMax: 10 },
    });
    const result = await Effect.runPromiseExit(
      service.listRuns({ ...defaultListInput, pageSize: 25 }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain(
        "WorkflowRunsAdminPageSizeTooLarge",
      );
    }
  });

  it("rejects reason not present in the catalog (write)", async () => {
    const { service } = buildService();
    const result = await Effect.runPromiseExit(
      service.replayRun({
        requestContext: operatorContext,
        runId: "wf_run_1",
        reason: "not-a-catalog-id",
        reasonAttachmentText: "ticket COM-10",
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("ReasonNotInCatalog");
    }
  });

  it("rejects reason that does not match the audit action", async () => {
    const { service } = buildService();
    const result = await Effect.runPromiseExit(
      service.replayRun({
        requestContext: operatorContext,
        runId: "wf_run_1",
        reason: reasonCatalogId.workflowRunsAdminCancel,
        reasonAttachmentText: "ticket COM-11",
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain("ReasonActionMismatch");
    }
  });

  it("rejects writes when the catalog-required attachment is missing", async () => {
    const { service } = buildService();
    const result = await Effect.runPromiseExit(
      service.replayRun({
        requestContext: operatorContext,
        runId: "wf_run_1",
        reason: reasonCatalogId.workflowRunsAdminReplay,
      }),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(JSON.stringify(result.cause)).toContain(
        "ReasonAttachmentRequired",
      );
    }
  });

  it("propagates partialFailures from the port into the envelope", async () => {
    const summary = buildSummary();
    const port = createPortDouble({
      summaries: [summary],
      partialFailures: [{ bucket: "novu", reason: "timeout" }],
    });
    const { service } = buildService({ port });
    const view = await Effect.runPromise(service.listRuns(defaultListInput));
    expect(view.result.partialFailures).toEqual([
      { bucket: "novu", reason: "timeout" },
    ]);
  });

  it("evicts in insertion-order once cacheMaxSize is exceeded", async () => {
    let portCalls = 0;
    const port: WorkflowRunsPortService = {
      ...makeStubWorkflowRunsPort(),
      listRuns: () => {
        portCalls += 1;
        return Effect.succeed({
          runs: [] as ReadonlyArray<WorkflowRunSummary>,
        });
      },
    };
    const { service } = buildService({
      port,
      bounds: { ...defaultBounds, cacheMaxSize: 2 },
    });

    // 3 distinct page sizes — evicts the first when the 3rd lands.
    await Effect.runPromise(
      service.listRuns({ ...defaultListInput, pageSize: 1 }),
    );
    await Effect.runPromise(
      service.listRuns({ ...defaultListInput, pageSize: 2 }),
    );
    await Effect.runPromise(
      service.listRuns({ ...defaultListInput, pageSize: 3 }),
    );
    expect(portCalls).toBe(3);

    // Repeating the FIRST key now misses (evicted) but the THIRD still hits.
    const evicted = await Effect.runPromise(
      service.listRuns({ ...defaultListInput, pageSize: 1 }),
    );
    expect(evicted.fromCache).toBe(false);
    const stillCached = await Effect.runPromise(
      service.listRuns({ ...defaultListInput, pageSize: 3 }),
    );
    expect(stillCached.fromCache).toBe(true);
  });

  it("re-derives after TTL expires", async () => {
    let portCalls = 0;
    const port: WorkflowRunsPortService = {
      ...makeStubWorkflowRunsPort(),
      listRuns: () => {
        portCalls += 1;
        return Effect.succeed({
          runs: [] as ReadonlyArray<WorkflowRunSummary>,
        });
      },
    };
    let nowMs = 1_700_000_000_000;
    const { service } = buildService({
      port,
      bounds: { ...defaultBounds, cacheTtlSeconds: 1 },
      now: () => new Date(nowMs),
    });
    await Effect.runPromise(service.listRuns(defaultListInput));
    nowMs += 500;
    const fresh = await Effect.runPromise(service.listRuns(defaultListInput));
    expect(fresh.fromCache).toBe(true);
    nowMs += 2_000;
    const stale = await Effect.runPromise(service.listRuns(defaultListInput));
    expect(stale.fromCache).toBe(false);
    expect(portCalls).toBe(2);
  });

  // Keep the error-class imports load-bearing for direct downstream
  // consumers without forcing the suite to introspect cause types.
  it("exports the documented typed error classes", () => {
    expect(WorkflowRunsAdminUnauthorized.name).toBe(
      "WorkflowRunsAdminUnauthorized",
    );
    expect(WorkflowRunsAdminPageSizeTooLarge.name).toBe(
      "WorkflowRunsAdminPageSizeTooLarge",
    );
    expect(WorkflowRunsAdminReasonNotInCatalog.name).toBe(
      "WorkflowRunsAdminReasonNotInCatalog",
    );
    expect(WorkflowRunsAdminReasonActionMismatch.name).toBe(
      "WorkflowRunsAdminReasonActionMismatch",
    );
    expect(WorkflowRunsAdminReasonAttachmentRequired.name).toBe(
      "WorkflowRunsAdminReasonAttachmentRequired",
    );
  });
});
