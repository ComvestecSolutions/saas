import { Effect } from "effect";
import { actorType, identityClaimKey } from "@comvestec/contracts";
import { platformAdapterServiceName } from "@comvestec/platform";
import {
  scheduleBillingConvergenceDispatchPlan,
  workflowJobsRetryMaxAttempts,
  workflowJobsScheduledRecoveryAttemptCount,
  workflowJobsRunningClaimTimeoutSeconds,
} from "../../convex/billingConvergenceScheduling";
import { requireWorkflowActorIdentity } from "../../convex/keycloakWorkflowIdentity";
import { buildSchedulerBackedConvexAdapter } from "../../convex/schedulerBackedConvexAdapter";

describe("convex workflow job runner adapter", () => {
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
    jest.resetModules();

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
      readonly primaryScheduled: boolean;
      readonly scheduledRecoveryAttemptCount: number;
      readonly expectedRecoveryAttemptCount: number;
    };
    type ScheduleMutationConfig = {
      readonly handler: (
        ctx: ScheduleMutationContext,
        args: ScheduleMutationArgs,
      ) => Promise<ScheduleMutationResult>;
    };

    const makeFunctionReference = jest.fn((path: string) => Symbol(path));
    const registeredMutations: ScheduleMutationConfig[] = [];
    const mutationGeneric = jest.fn((config: ScheduleMutationConfig) => {
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
    const runAt = jest.fn(
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
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    jest.doMock("convex/server", () => ({
      makeFunctionReference,
      mutationGeneric,
    }));
    jest.doMock("convex/values", () => ({
      v: {
        string: () => "string",
        boolean: () => "boolean",
        float64: () => "float64",
        object: <T extends object>(shape: T) => shape,
      },
    }));

    try {
      const workflowJobsModule = require("../../convex/workflowJobs") as {
        readonly scheduleBillingReconciliationWorkflowJob?: unknown;
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

      await expect(
        scheduleMutation.handler(
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
        scheduleMutation.handler(
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
    } finally {
      consoleSpy.mockRestore();
      jest.dontMock("convex/server");
      jest.dontMock("convex/values");
      jest.resetModules();
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
    const runAt = jest.fn(
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
    const runAt = jest.fn(async () => "scheduled-function-id");
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
    const runAt = jest.fn(async () => "scheduled-function-id");
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
    const runAt = jest.fn(
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
    const runAt = jest.fn(
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
    const runAt = jest.fn(
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
