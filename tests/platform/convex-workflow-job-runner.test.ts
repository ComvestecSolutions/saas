import { Effect } from "effect";
import { actorType, identityClaimKey } from "@comvestec/contracts";
import {
  executeWorkflowJobRecord,
  platformAdapterServiceName,
} from "@comvestec/platform";
import {
  scheduleBillingConvergenceDispatchPlan,
  workflowJobsRetryMaxAttempts,
  workflowJobsScheduledRecoveryAttemptCount,
  workflowJobsRunningClaimTimeoutSeconds,
} from "../../convex/billingConvergenceScheduling";
import { scheduleWorkflowJobDispatchPlan } from "../../convex/workflowScheduling";
import { requireWorkflowActorIdentity } from "../../convex/keycloakWorkflowIdentity";
import { buildSchedulerBackedConvexAdapter } from "../../convex/schedulerBackedConvexAdapter";

describe("convex workflow job runner adapter", () => {
  it("schedules a non-billing workflow dispatch plan through the generic scheduler helper", async () => {
    const scheduledCalls: Array<{
      readonly scheduledFor: Date;
      readonly functionReference: symbol;
      readonly args: {
        readonly jobId: string;
      };
    }> = [];
    const runSearchReindexJobAction = Symbol("runSearchReindexJob");
    const recoverSearchReindexJobAction = Symbol("recoverSearchReindexJob");
    const runAt = vi.fn(
      async (...input: [Date, symbol, { readonly jobId: string }]) => {
        const [scheduledFor, functionReference, args] = input;

        scheduledCalls.push({
          scheduledFor,
          functionReference,
          args,
        });

        return functionReference === runSearchReindexJobAction
          ? "search-primary-dispatch"
          : `search-recovery-${scheduledCalls.length}`;
      },
    );

    await expect(
      Effect.runPromise(
        scheduleWorkflowJobDispatchPlan({
          scheduler: { runAt },
          primaryFunctionReference: runSearchReindexJobAction,
          recoveryFunctionReference: recoverSearchReindexJobAction,
          jobId: "workflow-job-search-1",
          scheduledAt: "2026-05-02T10:00:00.000Z",
        }),
      ),
    ).resolves.toEqual({
      scheduledFunctionId: "search-primary-dispatch",
      scheduledFunctionIds: [
        "search-primary-dispatch",
        ...Array.from(
          { length: workflowJobsScheduledRecoveryAttemptCount },
          (_, index) => `search-recovery-${index + 2}`,
        ),
      ],
      primaryScheduled: true,
      scheduledRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
      expectedRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
    });

    expect(runAt).toHaveBeenCalledTimes(
      workflowJobsScheduledRecoveryAttemptCount + 1,
    );
    expect(scheduledCalls[0]).toMatchObject({
      functionReference: runSearchReindexJobAction,
      args: {
        jobId: "workflow-job-search-1",
      },
    });
    expect(scheduledCalls[0]?.scheduledFor.toISOString()).toBe(
      "2026-05-02T10:00:00.000Z",
    );
    expect(
      scheduledCalls
        .slice(1)
        .every(
          (scheduledCall) =>
            scheduledCall.functionReference === recoverSearchReindexJobAction,
        ),
    ).toBe(true);
  });

  it("executes workflow records through a module-supplied handler without billing-specific assumptions", async () => {
    type TestWorkflowRecord = {
      readonly jobId: string;
      readonly status: "scheduled" | "running";
      readonly moduleOutcome: "queued-repair" | "repaired";
      readonly attempt: number;
    };

    const scheduledRecord: TestWorkflowRecord = {
      jobId: "workflow-job-1",
      status: "scheduled",
      moduleOutcome: "queued-repair",
      attempt: 0,
    };
    const claimedRecord: TestWorkflowRecord = {
      ...scheduledRecord,
      status: "running",
      attempt: 1,
    };
    const rescheduledRecord: TestWorkflowRecord = {
      ...claimedRecord,
      status: "scheduled",
      attempt: 2,
    };
    const executionOrder: string[] = [];

    await expect(
      Effect.runPromise(
        executeWorkflowJobRecord({
          jobId: scheduledRecord.jobId,
          loadJob: ({ jobId }) => {
            executionOrder.push(`load:${jobId}`);

            return Effect.succeed(scheduledRecord);
          },
          shouldBlockStaleRunningJob: ({ job }) => {
            executionOrder.push(`stale-check:${job.status}`);

            return false;
          },
          blockStaleRunningJob: () => Effect.die("unexpected stale block"),
          claimScheduledJob: ({ jobId }) => {
            executionOrder.push(`claim:${jobId}`);

            return Effect.succeed(claimedRecord);
          },
          runClaimedJob: ({ job }) => {
            executionOrder.push(`run:${job.status}:${job.attempt}`);

            return Effect.succeed(rescheduledRecord);
          },
          recoverClaimedJobFailure: () =>
            Effect.die("unexpected claimed job recovery"),
          summarize: ({ record }) => {
            executionOrder.push(`summarize:${record.status}:${record.attempt}`);

            return Effect.succeed({
              jobId: record.jobId,
              status: record.status,
              moduleOutcome: record.moduleOutcome,
              attempt: record.attempt,
            });
          },
        }),
      ),
    ).resolves.toEqual({
      jobId: "workflow-job-1",
      status: "scheduled",
      moduleOutcome: "queued-repair",
      attempt: 2,
    });

    expect(executionOrder).toEqual([
      "load:workflow-job-1",
      "stale-check:scheduled",
      "claim:workflow-job-1",
      "run:running:1",
      "summarize:scheduled:2",
    ]);
  });

  it("accepts platform operators and service actors at the authenticated workflow boundary", () => {
    const platformOperatorIdentity = {
      issuer: "http://localhost:8080/realms/comvestec",
      subject: "usr_platform_operator",
      tokenIdentifier: "token-platform-operator",
      preferredUsername: "platform.operator",
      [identityClaimKey.actorType]: actorType.platformOperator,
    } satisfies NonNullable<Parameters<typeof requireWorkflowActorIdentity>[0]>;
    const serviceActorIdentity = {
      issuer: "http://localhost:8080/realms/comvestec",
      subject: "usr_convex_service_actor",
      tokenIdentifier: "token-service-actor",
      preferredUsername: "convex.billing.service",
      [identityClaimKey.actorType]: actorType.serviceActor,
    } satisfies NonNullable<Parameters<typeof requireWorkflowActorIdentity>[0]>;

    expect(
      Effect.runSync(
        requireWorkflowActorIdentity(
          platformOperatorIdentity,
          "Run due billing convergence jobs",
        ),
      ),
    ).toMatchObject({
      actorType: actorType.platformOperator,
      identity: expect.objectContaining({
        preferredUsername: "platform.operator",
      }),
    });
    expect(
      Effect.runSync(
        requireWorkflowActorIdentity(
          serviceActorIdentity,
          "Run due billing convergence jobs",
        ),
      ),
    ).toMatchObject({
      actorType: actorType.serviceActor,
      identity: expect.objectContaining({
        preferredUsername: "convex.billing.service",
      }),
    });
  });

  it("rejects authenticated identities without an allowed workflow actor claim", () => {
    const organizationMemberIdentity = {
      issuer: "http://localhost:8080/realms/comvestec",
      subject: "usr_org_member",
      tokenIdentifier: "token-org-member",
      preferredUsername: "org.member",
      [identityClaimKey.actorType]: actorType.organizationMember,
    } satisfies NonNullable<Parameters<typeof requireWorkflowActorIdentity>[0]>;

    expect(
      Effect.runSyncExit(
        requireWorkflowActorIdentity(
          organizationMemberIdentity,
          "Run due billing convergence jobs",
        ),
      ),
    ).toMatchObject({
      _tag: "Failure",
      cause: {
        _tag: "Fail",
        error: {
          _tag: "WorkflowActorIdentityError",
          reason:
            "Run due billing convergence jobs requires a platform-operator or service-actor Keycloak identity.",
        },
      },
    });
  });

  it("rejects missing authenticated workflow identities", () => {
    expect(
      Effect.runSyncExit(
        requireWorkflowActorIdentity(null, "Run due billing convergence jobs"),
      ),
    ).toMatchObject({
      _tag: "Failure",
      cause: {
        _tag: "Fail",
        error: {
          _tag: "WorkflowActorIdentityError",
          reason:
            "Run due billing convergence jobs requires an authenticated Keycloak identity.",
        },
      },
    });
  });

  it("schedules follow-up billing dispatches through the Internal Convex functions", async () => {
    vi.resetModules();

    type ScheduleMutationContext = {
      readonly auth: {
        readonly getUserIdentity: () => Promise<
          NonNullable<Parameters<typeof requireWorkflowActorIdentity>[0]>
        >;
      };
      readonly scheduler: {
        readonly runAt: (
          scheduledFor: Date,
          functionReference: symbol,
          args: { readonly jobId: string },
        ) => Promise<string>;
      };
    };
    type ScheduleMutationArgs = {
      readonly jobId: string;
      readonly scheduledAt: string;
    };
    type ScheduleMutationResult = {
      readonly scheduledFunctionId: string | null;
      readonly scheduledFunctionIds: string[];
      readonly primaryScheduled: boolean;
      readonly scheduledRecoveryAttemptCount: number;
      readonly expectedRecoveryAttemptCount: number;
    };
    type CancelMutationContext = {
      readonly auth: {
        readonly getUserIdentity: () => Promise<
          NonNullable<Parameters<typeof requireWorkflowActorIdentity>[0]>
        >;
      };
      readonly scheduler: {
        readonly cancel: (scheduledFunctionId: string) => Promise<void>;
      };
    };
    type CancelMutationArgs = {
      readonly scheduledFunctionId: string;
    };
    type RegisteredMutationConfig = {
      readonly handler: (ctx: unknown, args: unknown) => Promise<unknown>;
    };

    const makeFunctionReference = vi.fn((path: string) => Symbol(path));
    const registeredMutations: RegisteredMutationConfig[] = [];
    const mutationGeneric = vi.fn((config: RegisteredMutationConfig) => {
      registeredMutations.push(config);
      return config;
    });
    const scheduledCalls: Array<{
      readonly scheduledFor: Date;
      readonly functionReference: symbol;
      readonly args: {
        readonly jobId: string;
      };
    }> = [];
    const runAt = vi.fn(
      async (
        scheduledFor: Date,
        functionReference: symbol,
        args: { readonly jobId: string },
      ) => {
        scheduledCalls.push({
          scheduledFor,
          functionReference,
          args,
        });

        return "scheduled-function-id";
      },
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    vi.doMock("convex/server", () => ({
      makeFunctionReference,
      mutationGeneric,
    }));
    vi.doMock("convex/values", () => ({
      v: {
        string: () => "string",
        array: <T>(value: T) => value,
        boolean: () => "boolean",
        float64: () => "float64",
        null: () => "null",
        object: <T extends object>(shape: T) => shape,
      },
    }));

    try {
      const workflowJobsModule =
        (await import("../../convex/workflowJobs")) as {
          readonly scheduleBillingReconciliationWorkflowJob?: unknown;
          readonly cancelScheduledWorkflowJob?: unknown;
        };
      const scheduleMutation = registeredMutations.find(
        (config) =>
          config ===
          workflowJobsModule.scheduleBillingReconciliationWorkflowJob,
      );
      const scheduleArgs = {
        jobId: "workflow-job-1",
        scheduledAt: "2026-04-19T10:30:00.000Z",
      };

      if (!scheduleMutation) {
        throw new Error(
          "Expected scheduleBillingReconciliationWorkflowJob to register a mutation handler.",
        );
      }

      const runScheduleMutation = scheduleMutation.handler as (
        ctx: ScheduleMutationContext,
        args: ScheduleMutationArgs,
      ) => Promise<ScheduleMutationResult>;

      await expect(
        runScheduleMutation(
          {
            auth: {
              getUserIdentity: async () => ({
                issuer: "http://localhost:8080/realms/comvestec",
                subject: "usr_org_member",
                tokenIdentifier: "token-org-member",
                preferredUsername: "org.member",
                [identityClaimKey.actorType]: actorType.organizationMember,
              }),
            },
            scheduler: { runAt },
          },
          scheduleArgs,
        ),
      ).rejects.toThrow(
        "Billing reconciliation workflow scheduling requires a platform-operator or service-actor Keycloak identity.",
      );

      expect(runAt).not.toHaveBeenCalled();

      await expect(
        runScheduleMutation(
          {
            auth: {
              getUserIdentity: async () => ({
                issuer: "http://localhost:8080/realms/comvestec",
                subject: "usr_platform_operator",
                tokenIdentifier: "token-platform-operator",
                preferredUsername: "platform.operator",
                [identityClaimKey.actorType]: actorType.platformOperator,
              }),
            },
            scheduler: { runAt },
          },
          scheduleArgs,
        ),
      ).resolves.toEqual({
        scheduledFunctionId: "scheduled-function-id",
        scheduledFunctionIds: Array.from(
          { length: workflowJobsScheduledRecoveryAttemptCount + 1 },
          () => "scheduled-function-id",
        ),
        primaryScheduled: true,
        scheduledRecoveryAttemptCount:
          workflowJobsScheduledRecoveryAttemptCount,
        expectedRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
      });

      expect(runAt).toHaveBeenCalledTimes(
        workflowJobsScheduledRecoveryAttemptCount + 1,
      );
      expect(scheduledCalls[0]?.functionReference).toBeDefined();
      expect(scheduledCalls[0]?.functionReference.description).toBe(
        "workflowJobRunner:runBillingConvergenceJobInternal",
      );

      scheduledCalls.slice(1).forEach((call) => {
        expect(call.functionReference.description).toBe(
          "workflowJobRunner:recoverBillingConvergenceJobInternal",
        );
      });

      const cancelMutation = registeredMutations.find(
        (config) => config === workflowJobsModule.cancelScheduledWorkflowJob,
      );

      if (!cancelMutation) {
        throw new Error(
          "Expected cancelScheduledWorkflowJob to register a mutation handler.",
        );
      }

      const cancel = vi.fn(async () => undefined);
      const runCancelMutation = cancelMutation.handler as (
        ctx: CancelMutationContext,
        args: CancelMutationArgs,
      ) => Promise<null>;

      await expect(
        runCancelMutation(
          {
            auth: {
              getUserIdentity: async () => ({
                issuer: "http://localhost:8080/realms/comvestec",
                subject: "usr_platform_operator",
                tokenIdentifier: "token-platform-operator",
                preferredUsername: "platform.operator",
                [identityClaimKey.actorType]: actorType.platformOperator,
              }),
            },
            scheduler: { cancel },
          },
          {
            scheduledFunctionId: "scheduled-function-id",
          },
        ),
      ).resolves.toBeNull();

      expect(cancel).toHaveBeenCalledWith("scheduled-function-id");

      await expect(
        runCancelMutation(
          {
            auth: {
              getUserIdentity: async () => ({
                issuer: "http://localhost:8080/realms/comvestec",
                subject: "svc_workflow_runner",
                tokenIdentifier: "token-service-actor",
                preferredUsername: "workflow.runner",
                [identityClaimKey.actorType]: actorType.serviceActor,
              }),
            },
            scheduler: { cancel },
          },
          {
            scheduledFunctionId: "scheduled-function-id",
          },
        ),
      ).rejects.toThrow(
        "Billing reconciliation workflow cancellation requires a platform-operator Keycloak identity.",
      );

      expect(cancel).toHaveBeenCalledTimes(1);
    } finally {
      consoleSpy.mockRestore();
      vi.doUnmock("convex/server");
      vi.doUnmock("convex/values");
      vi.resetModules();
    }
  });

  it("registers the search workflow scheduling mutation against the expected internal action", async () => {
    vi.resetModules();

    type ScheduleMutationContext = {
      readonly auth: {
        readonly getUserIdentity: () => Promise<
          NonNullable<Parameters<typeof requireWorkflowActorIdentity>[0]>
        >;
      };
      readonly scheduler: {
        readonly runAt: (
          scheduledFor: Date,
          functionReference: symbol,
          args: { readonly jobId: string },
        ) => Promise<string>;
      };
    };
    type ScheduleMutationArgs = {
      readonly jobId: string;
      readonly scheduledAt: string;
    };
    type ScheduleMutationResult = {
      readonly scheduledFunctionId: string | null;
      readonly scheduledFunctionIds: string[];
      readonly primaryScheduled: boolean;
      readonly scheduledRecoveryAttemptCount: number;
      readonly expectedRecoveryAttemptCount: number;
    };
    type RegisteredMutationConfig = {
      readonly handler: (ctx: unknown, args: unknown) => Promise<unknown>;
    };

    const makeFunctionReference = vi.fn((path: string) => Symbol(path));
    const registeredMutations: RegisteredMutationConfig[] = [];
    const mutationGeneric = vi.fn((config: RegisteredMutationConfig) => {
      registeredMutations.push(config);
      return config;
    });
    const scheduledCalls: Array<{
      readonly scheduledFor: Date;
      readonly functionReference: symbol;
      readonly args: {
        readonly jobId: string;
      };
    }> = [];
    const runAt = vi.fn(
      async (
        scheduledFor: Date,
        functionReference: symbol,
        args: { readonly jobId: string },
      ) => {
        scheduledCalls.push({
          scheduledFor,
          functionReference,
          args,
        });

        return `search-scheduled-function-${scheduledCalls.length}`;
      },
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    vi.doMock("convex/server", () => ({
      makeFunctionReference,
      mutationGeneric,
    }));
    vi.doMock("convex/values", () => ({
      v: {
        string: () => "string",
        array: <T>(value: T) => value,
        boolean: () => "boolean",
        float64: () => "float64",
        null: () => "null",
        object: <T extends object>(shape: T) => shape,
      },
    }));

    try {
      const workflowJobsModule =
        (await import("../../convex/workflowJobs")) as {
          readonly scheduleSearchTenantIndexEnsureWorkflowJob?: unknown;
        };
      const scheduleMutation = registeredMutations.find(
        (config) =>
          config ===
          workflowJobsModule.scheduleSearchTenantIndexEnsureWorkflowJob,
      );

      if (!scheduleMutation) {
        throw new Error(
          "Expected scheduleSearchTenantIndexEnsureWorkflowJob to register a mutation handler.",
        );
      }

      const runScheduleMutation = scheduleMutation.handler as (
        ctx: ScheduleMutationContext,
        args: ScheduleMutationArgs,
      ) => Promise<ScheduleMutationResult>;

      await expect(
        runScheduleMutation(
          {
            auth: {
              getUserIdentity: async () => ({
                issuer: "http://localhost:8080/realms/comvestec",
                subject: "usr_org_member",
                tokenIdentifier: "token-org-member",
                preferredUsername: "org.member",
                [identityClaimKey.actorType]: actorType.organizationMember,
              }),
            },
            scheduler: { runAt },
          },
          {
            jobId: "workflow-job-search-1",
            scheduledAt: "2026-05-02T10:30:00.000Z",
          },
        ),
      ).rejects.toThrow(
        "Search tenant index ensure workflow scheduling requires a platform-operator or service-actor Keycloak identity.",
      );

      expect(runAt).not.toHaveBeenCalled();

      await expect(
        runScheduleMutation(
          {
            auth: {
              getUserIdentity: async () => ({
                issuer: "http://localhost:8080/realms/comvestec",
                subject: "usr_platform_operator",
                tokenIdentifier: "token-platform-operator",
                preferredUsername: "platform.operator",
                [identityClaimKey.actorType]: actorType.platformOperator,
              }),
            },
            scheduler: { runAt },
          },
          {
            jobId: "workflow-job-search-1",
            scheduledAt: "2026-05-02T10:30:00.000Z",
          },
        ),
      ).resolves.toMatchObject({
        scheduledFunctionId: "search-scheduled-function-1",
        scheduledFunctionIds: expect.arrayContaining([
          "search-scheduled-function-1",
        ]),
        primaryScheduled: true,
        scheduledRecoveryAttemptCount:
          workflowJobsScheduledRecoveryAttemptCount,
        expectedRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
      });

      expect(runAt).toHaveBeenCalledTimes(
        workflowJobsScheduledRecoveryAttemptCount + 1,
      );
      scheduledCalls.forEach((scheduledCall) => {
        expect(scheduledCall.functionReference.description).toBe(
          "workflowJobRunner:runSearchTenantIndexEnsureWorkflowJobInternal",
        );
      });
    } finally {
      consoleSpy.mockRestore();
      vi.doUnmock("convex/server");
      vi.doUnmock("convex/values");
      vi.resetModules();
    }
  });

  it("routes the search workflow action and internal action through the expected runtime clients", async () => {
    vi.resetModules();

    type RegisteredActionConfig = {
      readonly handler: (ctx: unknown, args: unknown) => Promise<unknown>;
    };

    const registeredActions: RegisteredActionConfig[] = [];
    const registeredInternalActions: RegisteredActionConfig[] = [];
    const actionGeneric = vi.fn((config: RegisteredActionConfig) => {
      registeredActions.push(config);
      return config;
    });
    const internalActionGeneric = vi.fn((config: RegisteredActionConfig) => {
      registeredInternalActions.push(config);
      return config;
    });
    const makeFunctionReference = vi.fn((path: string) => Symbol(path));
    const runSearchWorkflowService = vi.fn(() => Effect.succeed(undefined));
    const runSearchWorkflowClient = vi.fn(() => Effect.succeed(null));
    const runSearchFromConvexEnvironment = vi.fn((_: NodeJS.ProcessEnv, use) =>
      use({
        runSearchTenantIndexEnsureWorkflowJob: runSearchWorkflowService,
      } as {
        readonly runSearchTenantIndexEnsureWorkflowJob: typeof runSearchWorkflowService;
      }),
    );
    const makeAuthenticatedConvexWorkflowClient = vi.fn(() =>
      Effect.succeed({
        scheduleBillingReconciliationWorkflowJob: vi.fn(() =>
          Effect.die("unexpected billing schedule call"),
        ),
        scheduleSearchTenantIndexEnsureWorkflowJob: vi.fn(() =>
          Effect.die("unexpected search schedule call"),
        ),
        scheduleImportExportManagedFileSummaryWorkflowJob: vi.fn(() =>
          Effect.die("unexpected import-export managed-file schedule call"),
        ),
        scheduleImportExportSupportCaseSummaryWorkflowJob: vi.fn(() =>
          Effect.die("unexpected import-export support-case schedule call"),
        ),
        cancelScheduledWorkflowJob: vi.fn(() =>
          Effect.die("unexpected cancel call"),
        ),
        runBillingConvergenceJob: vi.fn(() =>
          Effect.die("unexpected billing run call"),
        ),
        recoverBillingConvergenceJob: vi.fn(() =>
          Effect.die("unexpected billing recover call"),
        ),
        runDueBillingConvergenceJobs: vi.fn(() =>
          Effect.die("unexpected due-job call"),
        ),
        runSearchTenantIndexEnsureWorkflowJob: runSearchWorkflowClient,
        runImportExportManagedFileSummaryWorkflowJob: vi.fn(() =>
          Effect.die("unexpected import-export managed-file run call"),
        ),
        runImportExportSupportCaseSummaryWorkflowJob: vi.fn(() =>
          Effect.die("unexpected import-export support-case run call"),
        ),
      }),
    );
    const resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment = vi.fn(
      () =>
        Effect.succeed({
          keycloakBaseUrl: "http://localhost:8080",
          keycloakRealm: "comvestec",
          keycloakClientId: "convex-service",
          keycloakClientSecret: "convex-secret",
          keycloakConvexServiceActorUsername: "convex.service",
          keycloakConvexServiceActorPassword: "password",
        }),
    );
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const originalCloudUrl = process.env.CONVEX_CLOUD_URL;
    const originalSiteUrl = process.env.CONVEX_SITE_URL;

    process.env.CONVEX_CLOUD_URL = "https://convex.example.cloud";
    process.env.CONVEX_SITE_URL = "https://convex.example.site";

    vi.doMock("convex/server", () => ({
      actionGeneric,
      internalActionGeneric,
      makeFunctionReference,
    }));
    vi.doMock("convex/values", () => ({
      v: {
        string: () => "string",
        array: <T>(value: T) => value,
        boolean: () => "boolean",
        float64: () => "float64",
        null: () => "null",
        optional: <T>(value: T) => value,
        object: <T extends object>(shape: T) => shape,
      },
    }));
    vi.doMock("../../packages/platform/src/adapters/storage/convex", () => ({
      makeAuthenticatedConvexWorkflowClient,
    }));
    vi.doMock(
      "../../packages/platform/src/services/domains/subscriber-journey",
      () => ({
        resolveSubscriberJourneyRuntimeOptionsFromConvexEnvironment,
        runSubscriberJourneyFromConvexEnvironment: vi.fn(() =>
          Effect.die("unexpected subscriber-journey runtime call"),
        ),
      }),
    );
    vi.doMock("../../packages/platform/src/services/domains/search", () => ({
      runSearchFromConvexEnvironment,
    }));
    vi.doMock(
      "../../packages/platform/src/services/domains/import-export",
      () => ({
        runImportExportFromEnvironment: vi.fn(() =>
          Effect.die("unexpected import-export runtime call"),
        ),
      }),
    );
    vi.doMock(
      "../../packages/platform/src/services/communication/notification-center",
      () => ({
        runNotificationCenterEmailDigestWorkflowJobFromEnvironment: vi.fn(() =>
          Effect.die("unexpected notification-center runtime call"),
        ),
      }),
    );
    vi.doMock(
      "../../packages/platform/src/services/communication/webhooks-api-access",
      () => ({
        runWebhookOutboundDeliveryWorkflowJobFromEnvironment: vi.fn(() =>
          Effect.die("unexpected webhook runtime call"),
        ),
      }),
    );
    vi.doMock(
      "../../packages/platform/src/services/domains/admin-tenant-management",
      () => ({
        runAdminTenantInvitationReminderWorkflowJobFromEnvironment: vi.fn(() =>
          Effect.die("unexpected invitation reminder runtime call"),
        ),
        runAdminTenantInvitationExpiryNotificationWorkflowJobFromEnvironment:
          vi.fn(() => Effect.die("unexpected invitation expiry runtime call")),
      }),
    );

    try {
      const workflowJobRunnerModule =
        (await import("../../convex/workflowJobRunner")) as {
          readonly runSearchTenantIndexEnsureWorkflowJob?: unknown;
          readonly runSearchTenantIndexEnsureWorkflowJobInternal?: unknown;
        };
      const searchAction = registeredActions.find(
        (config) =>
          config ===
          workflowJobRunnerModule.runSearchTenantIndexEnsureWorkflowJob,
      );
      const searchInternalAction = registeredInternalActions.find(
        (config) =>
          config ===
          workflowJobRunnerModule.runSearchTenantIndexEnsureWorkflowJobInternal,
      );

      if (!searchAction || !searchInternalAction) {
        throw new Error(
          "Expected search workflow action and internal action to register handlers.",
        );
      }

      const runSearchAction = searchAction.handler as (
        ctx: {
          readonly auth: {
            readonly getUserIdentity: () => Promise<
              NonNullable<Parameters<typeof requireWorkflowActorIdentity>[0]>
            >;
          };
        },
        args: { readonly jobId: string },
      ) => Promise<null>;
      const runSearchInternalAction = searchInternalAction.handler as (
        ctx: unknown,
        args: { readonly jobId: string },
      ) => Promise<null>;

      await expect(
        runSearchAction(
          {
            auth: {
              getUserIdentity: async () => ({
                issuer: "http://localhost:8080/realms/comvestec",
                subject: "usr_platform_operator",
                tokenIdentifier: "token-platform-operator",
                preferredUsername: "platform.operator",
                [identityClaimKey.actorType]: actorType.platformOperator,
              }),
            },
          },
          {
            jobId: "workflow-job-search-action-1",
          },
        ),
      ).resolves.toBeNull();

      expect(runSearchFromConvexEnvironment).toHaveBeenCalledTimes(1);
      expect(runSearchWorkflowService).toHaveBeenCalledWith({
        jobId: "workflow-job-search-action-1",
      });

      await expect(
        runSearchInternalAction(
          {},
          {
            jobId: "workflow-job-search-internal-1",
          },
        ),
      ).resolves.toBeNull();

      expect(makeAuthenticatedConvexWorkflowClient).toHaveBeenCalledWith(
        expect.objectContaining({
          deploymentUrl: "https://convex.example.cloud",
          siteUrl: "https://convex.example.site",
        }),
      );
      expect(runSearchWorkflowClient).toHaveBeenCalledWith({
        jobId: "workflow-job-search-internal-1",
      });
    } finally {
      consoleSpy.mockRestore();

      if (originalCloudUrl === undefined) {
        delete process.env.CONVEX_CLOUD_URL;
      } else {
        process.env.CONVEX_CLOUD_URL = originalCloudUrl;
      }

      if (originalSiteUrl === undefined) {
        delete process.env.CONVEX_SITE_URL;
      } else {
        process.env.CONVEX_SITE_URL = originalSiteUrl;
      }

      vi.doUnmock("convex/server");
      vi.doUnmock("convex/values");
      vi.doUnmock("../../packages/platform/src/adapters/storage/convex");
      vi.doUnmock(
        "../../packages/platform/src/services/domains/subscriber-journey",
      );
      vi.doUnmock("../../packages/platform/src/services/domains/search");
      vi.doUnmock("../../packages/platform/src/services/domains/import-export");
      vi.doUnmock(
        "../../packages/platform/src/services/communication/notification-center",
      );
      vi.doUnmock(
        "../../packages/platform/src/services/communication/webhooks-api-access",
      );
      vi.doUnmock(
        "../../packages/platform/src/services/domains/admin-tenant-management",
      );
      vi.resetModules();
    }
  });

  it("schedules billing convergence jobs with bounded targeted recovery attempts", async () => {
    const scheduledCalls: Array<{
      readonly scheduledFor: Date;
      readonly functionReference: symbol;
      readonly args: {
        readonly jobId: string;
      };
    }> = [];
    const runBillingConvergenceJobAction = Symbol("runBillingConvergenceJob");
    const recoverBillingConvergenceJobAction = Symbol(
      "recoverBillingConvergenceJob",
    );
    const runAt = vi.fn(
      async (...input: [Date, symbol, { readonly jobId: string }]) => {
        const [scheduledFor, functionReference, args] = input;

        scheduledCalls.push({
          scheduledFor,
          functionReference,
          args,
        });

        return functionReference === runBillingConvergenceJobAction
          ? "scheduled-function-id"
          : `recovery-function-${scheduledCalls.length}`;
      },
    );
    const adapter = buildSchedulerBackedConvexAdapter({
      scheduler: { runAt },
      primaryFunctionReference: runBillingConvergenceJobAction,
      recoveryFunctionReference: recoverBillingConvergenceJobAction,
      deploymentUrl: "http://127.0.0.1:3210",
      siteUrl: "http://127.0.0.1:3211",
    });

    await expect(
      Effect.runPromise(
        adapter.scheduleBillingReconciliationWorkflowJob({
          jobId: "workflow-job-1",
          scheduledAt: "2026-04-19T10:30:00.000Z",
        }),
      ),
    ).resolves.toEqual({
      scheduledFunctionId: "scheduled-function-id",
      scheduledFunctionIds: [
        "scheduled-function-id",
        ...Array.from(
          { length: workflowJobsScheduledRecoveryAttemptCount },
          (_, index) => `recovery-function-${index + 2}`,
        ),
      ],
      primaryScheduled: true,
      scheduledRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
      expectedRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
    });

    expect(workflowJobsScheduledRecoveryAttemptCount).toBe(
      workflowJobsRetryMaxAttempts + 2,
    );

    expect(adapter.serviceName).toBe(platformAdapterServiceName.convex);
    expect(runAt).toHaveBeenCalledTimes(
      workflowJobsScheduledRecoveryAttemptCount + 1,
    );

    expect(scheduledCalls[0]).toMatchObject({
      functionReference: runBillingConvergenceJobAction,
      args: {
        jobId: "workflow-job-1",
      },
    });
    expect(scheduledCalls[0]?.scheduledFor.toISOString()).toBe(
      "2026-04-19T10:30:00.000Z",
    );

    scheduledCalls.slice(1).forEach((scheduledCall, index) => {
      expect(scheduledCall.functionReference).toBe(
        recoverBillingConvergenceJobAction,
      );
      expect(scheduledCall.scheduledFor.toISOString()).toBe(
        new Date(
          Date.parse("2026-04-19T10:30:00.000Z") +
            workflowJobsRunningClaimTimeoutSeconds * 1_000 * (index + 1),
        ).toISOString(),
      );
      expect(scheduledCall.args).toEqual({
        jobId: "workflow-job-1",
      });
    });
  });

  it("returns a typed adapter error when scheduledAt is invalid", async () => {
    const runAt = vi.fn(async () => "scheduled-function-id");
    const adapter = buildSchedulerBackedConvexAdapter({
      scheduler: { runAt },
      primaryFunctionReference: Symbol("runBillingConvergenceJob"),
      recoveryFunctionReference: Symbol("recoverBillingConvergenceJob"),
      deploymentUrl: "http://127.0.0.1:3210",
      siteUrl: "http://127.0.0.1:3211",
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          adapter.scheduleBillingReconciliationWorkflowJob({
            jobId: "workflow-job-1",
            scheduledAt: "not-an-iso-timestamp",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ConvexAdapterRequestError",
      operation: "scheduleBillingReconciliationWorkflowJob",
      cause: {
        _tag: "BillingConvergenceScheduledAtInvalidError",
        scheduledAt: "not-an-iso-timestamp",
      },
    });

    expect(runAt).not.toHaveBeenCalled();
  });

  it("returns a typed adapter error when scheduledAt has an impossible ISO calendar date", async () => {
    const runAt = vi.fn(async () => "scheduled-function-id");
    const adapter = buildSchedulerBackedConvexAdapter({
      scheduler: { runAt },
      primaryFunctionReference: Symbol("runBillingConvergenceJob"),
      recoveryFunctionReference: Symbol("recoverBillingConvergenceJob"),
      deploymentUrl: "http://127.0.0.1:3210",
      siteUrl: "http://127.0.0.1:3211",
    });

    await expect(
      Effect.runPromise(
        Effect.flip(
          adapter.scheduleBillingReconciliationWorkflowJob({
            jobId: "workflow-job-1",
            scheduledAt: "2026-02-31T12:00:00.000Z",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "ConvexAdapterRequestError",
      operation: "scheduleBillingReconciliationWorkflowJob",
      cause: {
        _tag: "BillingConvergenceScheduledAtInvalidError",
        scheduledAt: "2026-02-31T12:00:00.000Z",
      },
    });

    expect(runAt).not.toHaveBeenCalled();
  });

  it("falls back to targeted recovery scheduling when the primary action cannot be enqueued", async () => {
    const scheduledFunctionReferences: symbol[] = [];
    const runAt = vi.fn(
      async (...input: [Date, symbol, { readonly jobId: string }]) => {
        const [, functionReference] = input;

        if (functionReference.description === "runBillingConvergenceJob") {
          throw new Error("primary unavailable");
        }

        scheduledFunctionReferences.push(functionReference);

        return "scheduled-function-id";
      },
    );
    const runBillingConvergenceJobAction = Symbol("runBillingConvergenceJob");
    const recoverBillingConvergenceJobAction = Symbol(
      "recoverBillingConvergenceJob",
    );

    await expect(
      Effect.runPromise(
        scheduleBillingConvergenceDispatchPlan({
          scheduler: { runAt },
          primaryFunctionReference: runBillingConvergenceJobAction,
          recoveryFunctionReference: recoverBillingConvergenceJobAction,
          jobId: "workflow-job-1",
          scheduledAt: "2026-04-19T10:30:00.000Z",
        }),
      ),
    ).resolves.toEqual({
      scheduledFunctionId: "scheduled-function-id",
      scheduledFunctionIds: Array.from(
        { length: workflowJobsScheduledRecoveryAttemptCount },
        () => "scheduled-function-id",
      ),
      primaryScheduled: false,
      scheduledRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
      expectedRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
    });

    expect(runAt).toHaveBeenCalledTimes(
      workflowJobsScheduledRecoveryAttemptCount + 1,
    );
    expect(scheduledFunctionReferences).toEqual(
      Array.from(
        { length: workflowJobsScheduledRecoveryAttemptCount },
        () => recoverBillingConvergenceJobAction,
      ),
    );
  });

  it("reports degraded coverage when recovery follow-up scheduling fails after the primary action is enqueued", async () => {
    const runBillingConvergenceJobAction = Symbol("runBillingConvergenceJob");
    const recoverBillingConvergenceJobAction = Symbol(
      "recoverBillingConvergenceJob",
    );
    const runAt = vi.fn(
      async (...input: [Date, symbol, { readonly jobId: string }]) => {
        const [, functionReference] = input;

        if (functionReference === recoverBillingConvergenceJobAction) {
          throw new Error("recovery unavailable");
        }

        return "scheduled-function-id";
      },
    );

    await expect(
      Effect.runPromise(
        scheduleBillingConvergenceDispatchPlan({
          scheduler: { runAt },
          primaryFunctionReference: runBillingConvergenceJobAction,
          recoveryFunctionReference: recoverBillingConvergenceJobAction,
          jobId: "workflow-job-1",
          scheduledAt: "2026-04-19T10:30:00.000Z",
        }),
      ),
    ).resolves.toEqual({
      scheduledFunctionId: "scheduled-function-id",
      scheduledFunctionIds: ["scheduled-function-id"],
      primaryScheduled: true,
      scheduledRecoveryAttemptCount: 0,
      expectedRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
    });

    expect(runAt).toHaveBeenCalledTimes(
      workflowJobsScheduledRecoveryAttemptCount + 1,
    );
  });

  it("keeps the exhausted-budget block observation when one recovery follow-up dispatch is missed", async () => {
    const runBillingConvergenceJobAction = Symbol("runBillingConvergenceJob");
    const recoverBillingConvergenceJobAction = Symbol(
      "recoverBillingConvergenceJob",
    );
    let recoveryDispatchAttemptCount = 0;
    const runAt = vi.fn(
      async (...input: [Date, symbol, { readonly jobId: string }]) => {
        const [, functionReference] = input;

        if (functionReference === recoverBillingConvergenceJobAction) {
          recoveryDispatchAttemptCount += 1;

          if (recoveryDispatchAttemptCount === 1) {
            throw new Error("one recovery dispatch was unavailable");
          }
        }

        return functionReference === runBillingConvergenceJobAction
          ? "scheduled-function-id"
          : `recovery-function-${recoveryDispatchAttemptCount}`;
      },
    );

    await expect(
      Effect.runPromise(
        scheduleBillingConvergenceDispatchPlan({
          scheduler: { runAt },
          primaryFunctionReference: runBillingConvergenceJobAction,
          recoveryFunctionReference: recoverBillingConvergenceJobAction,
          jobId: "workflow-job-1",
          scheduledAt: "2026-04-19T10:30:00.000Z",
        }),
      ),
    ).resolves.toEqual({
      scheduledFunctionId: "scheduled-function-id",
      scheduledFunctionIds: [
        "scheduled-function-id",
        ...Array.from(
          { length: workflowJobsScheduledRecoveryAttemptCount - 1 },
          (_, index) => `recovery-function-${index + 2}`,
        ),
      ],
      primaryScheduled: true,
      scheduledRecoveryAttemptCount:
        workflowJobsScheduledRecoveryAttemptCount - 1,
      expectedRecoveryAttemptCount: workflowJobsScheduledRecoveryAttemptCount,
    });

    expect(runAt).toHaveBeenCalledTimes(
      workflowJobsScheduledRecoveryAttemptCount + 1,
    );
  });
});
