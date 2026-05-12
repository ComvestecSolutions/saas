import { Effect } from "effect";
import {
  platformScope,
  retentionDataType,
  retentionLegalHoldStatus,
  type RetentionLegalHoldRecord,
  type RetentionPolicyRecord,
} from "@comvestec/contracts";
import {
  makeRetentionLegalHoldPostgresRepository,
  makeRetentionLegalHoldModule,
  RetentionLegalHoldPostgresRepository,
} from "@comvestec/modules";

const createRetentionRepositoryDouble = () => {
  const policies = new Map<string, RetentionPolicyRecord>();
  const holds = new Map<string, RetentionLegalHoldRecord>();

  const policyKey = (input: {
    readonly scope: string;
    readonly scopeId: string;
    readonly dataType: string;
  }) => [input.scope, input.scopeId, input.dataType].join(":");

  return {
    service: {
      upsertRetentionPolicy: (input: RetentionPolicyRecord) => {
        policies.set(policyKey(input), input);

        return Effect.succeed(input);
      },
      findRetentionPolicy: (input: {
        readonly scope: RetentionPolicyRecord["scope"];
        readonly scopeId: string;
        readonly dataType: RetentionPolicyRecord["dataType"];
      }) => Effect.succeed(policies.get(policyKey(input))),
      listRetentionPolicies: (input: {
        readonly scope: RetentionPolicyRecord["scope"];
        readonly scopeId: string;
      }) =>
        Effect.succeed(
          [...policies.values()].filter(
            (policy) =>
              policy.scope === input.scope && policy.scopeId === input.scopeId,
          ),
        ),
      createRetentionLegalHold: (input: RetentionLegalHoldRecord) => {
        holds.set(input.legalHoldId, input);

        return Effect.succeed(input);
      },
      getRetentionLegalHold: (legalHoldId: string) =>
        Effect.succeed(holds.get(legalHoldId)),
      findActiveRetentionLegalHold: (input: {
        readonly scope: RetentionLegalHoldRecord["scope"];
        readonly scopeId: string;
        readonly dataType: RetentionLegalHoldRecord["dataType"];
        readonly targetId: string;
      }) =>
        Effect.succeed(
          [...holds.values()].find(
            (hold) =>
              hold.scope === input.scope &&
              hold.scopeId === input.scopeId &&
              hold.dataType === input.dataType &&
              hold.targetId === input.targetId &&
              hold.status === retentionLegalHoldStatus.active,
          ),
        ),
      listRetentionLegalHolds: (input: {
        readonly scope: RetentionLegalHoldRecord["scope"];
        readonly scopeId: string;
      }) =>
        Effect.succeed(
          [...holds.values()].filter(
            (hold) =>
              hold.scope === input.scope && hold.scopeId === input.scopeId,
          ),
        ),
      releaseRetentionLegalHold: (input: {
        readonly legalHoldId: string;
        readonly releasedBy: string;
        readonly releasedAt: string;
      }) => {
        const existingHold = holds.get(input.legalHoldId);

        if (existingHold === undefined) {
          return Effect.succeed(undefined);
        }

        const releasedHold = {
          ...existingHold,
          status: retentionLegalHoldStatus.released,
          releasedBy: input.releasedBy,
          releasedAt: input.releasedAt,
        } satisfies RetentionLegalHoldRecord;

        holds.set(input.legalHoldId, releasedHold);

        return Effect.succeed(releasedHold);
      },
    },
  };
};

describe("retention legal hold module", () => {
  it("upserts retention policies and reports active legal-hold summaries", async () => {
    const repository = createRetentionRepositoryDouble();
    const module = await Effect.runPromise(
      makeRetentionLegalHoldModule().pipe(
        Effect.provideService(
          RetentionLegalHoldPostgresRepository,
          repository.service,
        ),
      ),
    );

    const createdPolicy = await Effect.runPromise(
      module.upsertRetentionPolicy({
        scope: platformScope.organization,
        scopeId: "org_1",
        dataType: retentionDataType.fileObject,
        retentionDays: 365,
        changedBy: "usr_support_1",
      }),
    );
    const initialPolicies = await Effect.runPromise(
      module.listRetentionPolicies({
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );

    await Effect.runPromise(
      module.placeRetentionLegalHold({
        scope: platformScope.organization,
        scopeId: "org_1",
        dataType: retentionDataType.fileObject,
        targetId: "file_1",
        reason: "Compliance investigation",
        evidence: "case-42",
        placedBy: "usr_support_1",
      }),
    );

    const policiesWithHold = await Effect.runPromise(
      module.listRetentionPolicies({
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );

    expect(createdPolicy).toMatchObject({
      dataType: retentionDataType.fileObject,
      retentionDays: 365,
      legalHoldActive: false,
    });
    expect(initialPolicies).toEqual([
      expect.objectContaining({
        dataType: retentionDataType.fileObject,
        legalHoldActive: false,
      }),
    ]);
    expect(policiesWithHold).toEqual([
      expect.objectContaining({
        dataType: retentionDataType.fileObject,
        legalHoldActive: true,
      }),
    ]);
  });

  it("maps Postgres duplicate active-hold conflicts to a typed repository error", async () => {
    const repository = await Effect.runPromise(
      makeRetentionLegalHoldPostgresRepository({
        upsertRetentionPolicy: async () => {
          throw new Error("Unexpected retention policy upsert query.");
        },
        findRetentionPolicy: async () => {
          throw new Error("Unexpected retention policy lookup query.");
        },
        listRetentionPoliciesByScope: async () => {
          throw new Error("Unexpected retention policy list query.");
        },
        createRetentionLegalHold: async () => {
          const duplicateError = new Error("duplicate active hold");

          Object.assign(duplicateError, { code: "23505" });
          throw duplicateError;
        },
        getRetentionLegalHoldById: async () => {
          throw new Error("Unexpected legal hold lookup query.");
        },
        findActiveRetentionLegalHold: async () => {
          throw new Error("Unexpected active legal hold lookup query.");
        },
        listRetentionLegalHoldsByScope: async () => {
          throw new Error("Unexpected legal hold list query.");
        },
        releaseRetentionLegalHold: async () => {
          throw new Error("Unexpected legal hold release query.");
        },
      }),
    );

    const result = await Effect.runPromise(
      Effect.either(
        repository.createRetentionLegalHold({
          legalHoldId: "retention-legal-hold:organization:org_1:1",
          scope: platformScope.organization,
          scopeId: "org_1",
          dataType: retentionDataType.fileObject,
          targetId: "file_1",
          reason: "Compliance investigation",
          evidence: "case-42",
          status: retentionLegalHoldStatus.active,
          placedBy: "usr_support_1",
          placedAt: "2026-04-27T19:00:00.000Z",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RetentionLegalHoldActiveHoldAlreadyExistsError",
        scope: platformScope.organization,
        scopeId: "org_1",
        dataType: retentionDataType.fileObject,
        targetId: "file_1",
      },
    });
  });

  it("rejects duplicate active legal holds for the same target", async () => {
    const repository = createRetentionRepositoryDouble();
    const repositoryService = {
      ...repository.service,
      createRetentionLegalHold: (input: RetentionLegalHoldRecord) =>
        repository.service
          .findActiveRetentionLegalHold({
            scope: input.scope,
            scopeId: input.scopeId,
            dataType: input.dataType,
            targetId: input.targetId,
          })
          .pipe(
            Effect.flatMap((existingHold) =>
              existingHold === undefined
                ? repository.service.createRetentionLegalHold(input)
                : Effect.fail({
                    _tag: "RetentionLegalHoldActiveHoldAlreadyExistsError",
                    scope: input.scope,
                    scopeId: input.scopeId,
                    dataType: input.dataType,
                    targetId: input.targetId,
                  } as const),
            ),
          ),
    };
    const module = await Effect.runPromise(
      makeRetentionLegalHoldModule().pipe(
        Effect.provideService(
          RetentionLegalHoldPostgresRepository,
          repositoryService,
        ),
      ),
    );

    await Effect.runPromise(
      module.placeRetentionLegalHold({
        scope: platformScope.organization,
        scopeId: "org_1",
        dataType: retentionDataType.fileObject,
        targetId: "file_1",
        reason: "Compliance investigation",
        evidence: "case-42",
        placedBy: "usr_support_1",
      }),
    );

    const duplicateResult = await Effect.runPromise(
      Effect.either(
        module.placeRetentionLegalHold({
          scope: platformScope.organization,
          scopeId: "org_1",
          dataType: retentionDataType.fileObject,
          targetId: "file_1",
          reason: "Duplicate request",
          evidence: "case-43",
          placedBy: "usr_support_2",
        }),
      ),
    );

    expect(duplicateResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "RetentionLegalHoldAlreadyExistsError",
        targetId: "file_1",
      },
    });
  });

  it("releases legal holds and stops blocking purge checks", async () => {
    const repository = createRetentionRepositoryDouble();
    const module = await Effect.runPromise(
      makeRetentionLegalHoldModule().pipe(
        Effect.provideService(
          RetentionLegalHoldPostgresRepository,
          repository.service,
        ),
      ),
    );

    await Effect.runPromise(
      module.upsertRetentionPolicy({
        scope: platformScope.organization,
        scopeId: "org_1",
        dataType: retentionDataType.fileObject,
        retentionDays: 365,
        changedBy: "usr_support_1",
      }),
    );

    const placedHold = await Effect.runPromise(
      module.placeRetentionLegalHold({
        scope: platformScope.organization,
        scopeId: "org_1",
        dataType: retentionDataType.fileObject,
        targetId: "file_1",
        reason: "Compliance investigation",
        evidence: "case-42",
        placedBy: "usr_support_1",
      }),
    );
    const blockedDecision = await Effect.runPromise(
      module.checkRetentionGuard({
        scope: platformScope.organization,
        scopeId: "org_1",
        dataType: retentionDataType.fileObject,
        targetId: "file_1",
      }),
    );
    const releasedHold = await Effect.runPromise(
      module.releaseRetentionLegalHold({
        legalHoldId: placedHold.legalHoldId,
        releasedBy: "usr_support_2",
      }),
    );
    const unblockedDecision = await Effect.runPromise(
      module.checkRetentionGuard({
        scope: platformScope.organization,
        scopeId: "org_1",
        dataType: retentionDataType.fileObject,
        targetId: "file_1",
      }),
    );

    expect(blockedDecision).toMatchObject({
      dataType: retentionDataType.fileObject,
      legalHoldActive: true,
      purgeBlocked: true,
    });
    expect(releasedHold).toMatchObject({
      legalHoldId: placedHold.legalHoldId,
      status: retentionLegalHoldStatus.released,
      legalHoldActive: false,
    });
    expect(unblockedDecision).toMatchObject({
      dataType: retentionDataType.fileObject,
      legalHoldActive: false,
      purgeBlocked: false,
    });
  });
});
