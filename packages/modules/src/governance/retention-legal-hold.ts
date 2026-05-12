import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type PlaceRetentionLegalHoldInput,
  PlaceRetentionLegalHoldInputSchema,
  type ReleaseRetentionLegalHoldInput,
  ReleaseRetentionLegalHoldInputSchema,
  type RetentionGuardCheckInput,
  RetentionGuardCheckInputSchema,
  type RetentionGuardDecision,
  RetentionGuardDecisionSchema,
  type RetentionLegalHoldComplianceView,
  RetentionLegalHoldComplianceViewListSchema,
  RetentionLegalHoldComplianceViewSchema,
  type RetentionLegalHoldListRequest,
  RetentionLegalHoldListRequestSchema,
  RetentionLegalHoldRecordSchema,
  RetentionPolicyAdminViewListSchema,
  RetentionPolicyAdminViewSchema,
  type RetentionPolicyListRequest,
  RetentionPolicyListRequestSchema,
  retentionLegalHoldStatus,
  type RetentionPolicyRecord,
  type UpsertRetentionPolicyInput,
  UpsertRetentionPolicyInputSchema,
} from "@comvestec/contracts";
import {
  type RetentionLegalHoldPostgresRepositoryError,
  RetentionLegalHoldPostgresRepository,
} from "../persistence";

export type RetentionLegalHoldAlreadyExistsError = {
  readonly _tag: "RetentionLegalHoldAlreadyExistsError";
  readonly scope: PlaceRetentionLegalHoldInput["scope"];
  readonly scopeId: string;
  readonly dataType: PlaceRetentionLegalHoldInput["dataType"];
  readonly targetId: string;
};

export type RetentionLegalHoldNotFoundError = {
  readonly _tag: "RetentionLegalHoldNotFoundError";
  readonly legalHoldId: string;
};

export type RetentionLegalHoldReleaseUnavailableError = {
  readonly _tag: "RetentionLegalHoldReleaseUnavailableError";
  readonly legalHoldId: string;
};

export type RetentionLegalHoldModuleError =
  | ParseResult.ParseError
  | RetentionLegalHoldAlreadyExistsError
  | RetentionLegalHoldNotFoundError
  | RetentionLegalHoldReleaseUnavailableError
  | RetentionLegalHoldPostgresRepositoryError;

export type RetentionLegalHoldModuleService = {
  readonly upsertRetentionPolicy: (
    input: UpsertRetentionPolicyInput,
  ) => Effect.Effect<
    Schema.Schema.Type<typeof RetentionPolicyAdminViewSchema>,
    RetentionLegalHoldModuleError
  >;
  readonly listRetentionPolicies: (
    input: RetentionPolicyListRequest,
  ) => Effect.Effect<
    readonly Schema.Schema.Type<typeof RetentionPolicyAdminViewSchema>[],
    RetentionLegalHoldModuleError
  >;
  readonly placeRetentionLegalHold: (
    input: PlaceRetentionLegalHoldInput,
  ) => Effect.Effect<
    RetentionLegalHoldComplianceView,
    RetentionLegalHoldModuleError
  >;
  readonly getRetentionLegalHoldRecord: (
    legalHoldId: string,
  ) => Effect.Effect<
    Schema.Schema.Type<typeof RetentionLegalHoldRecordSchema>,
    RetentionLegalHoldModuleError
  >;
  readonly releaseRetentionLegalHold: (
    input: ReleaseRetentionLegalHoldInput,
  ) => Effect.Effect<
    RetentionLegalHoldComplianceView,
    RetentionLegalHoldModuleError
  >;
  readonly listRetentionLegalHolds: (
    input: RetentionLegalHoldListRequest,
  ) => Effect.Effect<
    readonly RetentionLegalHoldComplianceView[],
    RetentionLegalHoldModuleError
  >;
  readonly checkRetentionGuard: (
    input: RetentionGuardCheckInput,
  ) => Effect.Effect<RetentionGuardDecision, RetentionLegalHoldModuleError>;
};

export class RetentionLegalHoldModule extends Context.Tag(
  "RetentionLegalHoldModule",
)<RetentionLegalHoldModule, RetentionLegalHoldModuleService>() {}

const buildRetentionPolicyAdminView = (input: {
  readonly policy: RetentionPolicyRecord;
  readonly legalHoldActive: boolean;
}) =>
  Schema.decodeUnknown(RetentionPolicyAdminViewSchema)({
    policyId: input.policy.policyId,
    dataType: input.policy.dataType,
    retentionDays: input.policy.retentionDays,
    legalHoldActive: input.legalHoldActive,
  });

const buildRetentionLegalHoldComplianceView = (
  record: Schema.Schema.Type<typeof RetentionLegalHoldComplianceViewSchema> & {
    readonly legalHoldActive: boolean;
  },
) => Schema.decodeUnknown(RetentionLegalHoldComplianceViewSchema)(record);

export const makeRetentionLegalHoldModule = () =>
  Effect.gen(function* () {
    const repository = yield* RetentionLegalHoldPostgresRepository;

    return {
      upsertRetentionPolicy: (input: UpsertRetentionPolicyInput) =>
        Schema.decodeUnknown(UpsertRetentionPolicyInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const existingPolicy = yield* repository.findRetentionPolicy({
                scope: request.scope,
                scopeId: request.scopeId,
                dataType: request.dataType,
              });

              const policy = yield* repository.upsertRetentionPolicy({
                policyId:
                  existingPolicy?.policyId ??
                  [
                    "retention-policy",
                    request.scope,
                    request.scopeId,
                    request.dataType,
                  ].join(":"),
                scope: request.scope,
                scopeId: request.scopeId,
                dataType: request.dataType,
                retentionDays: request.retentionDays,
                changedBy: request.changedBy,
                createdAt:
                  existingPolicy?.createdAt ?? new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
              const holds = yield* repository.listRetentionLegalHolds({
                scope: request.scope,
                scopeId: request.scopeId,
              });

              return yield* buildRetentionPolicyAdminView({
                policy,
                legalHoldActive: holds.some(
                  (hold) =>
                    hold.dataType === request.dataType &&
                    hold.status === retentionLegalHoldStatus.active,
                ),
              });
            }),
          ),
        ),
      listRetentionPolicies: (input: RetentionPolicyListRequest) =>
        Schema.decodeUnknown(RetentionPolicyListRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const policies = yield* repository.listRetentionPolicies(request);
              const holds = yield* repository.listRetentionLegalHolds(request);
              const activeHoldTypes = new Set(
                holds
                  .filter(
                    (hold) => hold.status === retentionLegalHoldStatus.active,
                  )
                  .map((hold) => hold.dataType),
              );

              return yield* Effect.forEach(policies, (policy) =>
                buildRetentionPolicyAdminView({
                  policy,
                  legalHoldActive: activeHoldTypes.has(policy.dataType),
                }),
              ).pipe(
                Effect.flatMap((views) =>
                  Schema.decodeUnknown(RetentionPolicyAdminViewListSchema)(
                    views,
                  ),
                ),
              );
            }),
          ),
        ),
      placeRetentionLegalHold: (input: PlaceRetentionLegalHoldInput) =>
        Schema.decodeUnknown(PlaceRetentionLegalHoldInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const record = yield* repository
                .createRetentionLegalHold({
                  legalHoldId: [
                    "retention-legal-hold",
                    request.scope,
                    request.scopeId,
                    crypto.randomUUID(),
                  ].join(":"),
                  scope: request.scope,
                  scopeId: request.scopeId,
                  dataType: request.dataType,
                  targetId: request.targetId,
                  reason: request.reason,
                  evidence: request.evidence,
                  status: retentionLegalHoldStatus.active,
                  placedBy: request.placedBy,
                  placedAt: new Date().toISOString(),
                })
                .pipe(
                  Effect.mapError((error) =>
                    error._tag ===
                    "RetentionLegalHoldActiveHoldAlreadyExistsError"
                      ? ({
                          _tag: "RetentionLegalHoldAlreadyExistsError",
                          scope: error.scope,
                          scopeId: error.scopeId,
                          dataType: error.dataType,
                          targetId: error.targetId,
                        } satisfies RetentionLegalHoldAlreadyExistsError)
                      : error,
                  ),
                );

              return yield* buildRetentionLegalHoldComplianceView({
                legalHoldId: record.legalHoldId,
                dataType: record.dataType,
                targetId: record.targetId,
                status: record.status,
                placedAt: record.placedAt,
                ...(record.releasedAt !== undefined
                  ? { releasedAt: record.releasedAt }
                  : {}),
                evidence: record.evidence,
                legalHoldActive: true,
              });
            }),
          ),
        ),
      getRetentionLegalHoldRecord: (legalHoldId: string) =>
        Schema.decodeUnknown(Schema.NonEmptyString)(legalHoldId).pipe(
          Effect.flatMap((decodedLegalHoldId) =>
            Effect.gen(function* () {
              const record =
                yield* repository.getRetentionLegalHold(decodedLegalHoldId);

              if (record === undefined) {
                return yield* Effect.fail({
                  _tag: "RetentionLegalHoldNotFoundError",
                  legalHoldId: decodedLegalHoldId,
                } satisfies RetentionLegalHoldNotFoundError);
              }

              return record;
            }),
          ),
        ),
      releaseRetentionLegalHold: (input: ReleaseRetentionLegalHoldInput) =>
        Schema.decodeUnknown(ReleaseRetentionLegalHoldInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const existingHold = yield* repository.getRetentionLegalHold(
                request.legalHoldId,
              );

              if (existingHold === undefined) {
                return yield* Effect.fail({
                  _tag: "RetentionLegalHoldNotFoundError",
                  legalHoldId: request.legalHoldId,
                } satisfies RetentionLegalHoldNotFoundError);
              }

              if (existingHold.status !== retentionLegalHoldStatus.active) {
                return yield* Effect.fail({
                  _tag: "RetentionLegalHoldReleaseUnavailableError",
                  legalHoldId: request.legalHoldId,
                } satisfies RetentionLegalHoldReleaseUnavailableError);
              }

              const releasedHold = yield* repository.releaseRetentionLegalHold({
                legalHoldId: request.legalHoldId,
                releasedBy: request.releasedBy,
                releasedAt: new Date().toISOString(),
              });

              if (releasedHold === undefined) {
                return yield* Effect.fail({
                  _tag: "RetentionLegalHoldNotFoundError",
                  legalHoldId: request.legalHoldId,
                } satisfies RetentionLegalHoldNotFoundError);
              }

              return yield* buildRetentionLegalHoldComplianceView({
                legalHoldId: releasedHold.legalHoldId,
                dataType: releasedHold.dataType,
                targetId: releasedHold.targetId,
                status: releasedHold.status,
                placedAt: releasedHold.placedAt,
                ...(releasedHold.releasedAt !== undefined
                  ? { releasedAt: releasedHold.releasedAt }
                  : {}),
                evidence: releasedHold.evidence,
                legalHoldActive: false,
              });
            }),
          ),
        ),
      listRetentionLegalHolds: (input: RetentionLegalHoldListRequest) =>
        Schema.decodeUnknown(RetentionLegalHoldListRequestSchema)(input).pipe(
          Effect.flatMap((request) =>
            repository.listRetentionLegalHolds(request).pipe(
              Effect.flatMap((records) =>
                Effect.forEach(records, (record) =>
                  buildRetentionLegalHoldComplianceView({
                    legalHoldId: record.legalHoldId,
                    dataType: record.dataType,
                    targetId: record.targetId,
                    status: record.status,
                    placedAt: record.placedAt,
                    ...(record.releasedAt !== undefined
                      ? { releasedAt: record.releasedAt }
                      : {}),
                    evidence: record.evidence,
                    legalHoldActive:
                      record.status === retentionLegalHoldStatus.active,
                  }),
                ),
              ),
              Effect.flatMap((views) =>
                Schema.decodeUnknown(
                  RetentionLegalHoldComplianceViewListSchema,
                )(views),
              ),
            ),
          ),
        ),
      checkRetentionGuard: (input: RetentionGuardCheckInput) =>
        Schema.decodeUnknown(RetentionGuardCheckInputSchema)(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const policy = yield* repository.findRetentionPolicy({
                scope: request.scope,
                scopeId: request.scopeId,
                dataType: request.dataType,
              });
              const activeHold = yield* repository.findActiveRetentionLegalHold(
                {
                  scope: request.scope,
                  scopeId: request.scopeId,
                  dataType: request.dataType,
                  targetId: request.targetId,
                },
              );

              return yield* Schema.decodeUnknown(RetentionGuardDecisionSchema)({
                dataType: request.dataType,
                ...(policy !== undefined
                  ? {
                      retentionDays: policy.retentionDays,
                      policyId: policy.policyId,
                    }
                  : {}),
                legalHoldActive: activeHold !== undefined,
                purgeBlocked: activeHold !== undefined,
              });
            }),
          ),
        ),
    } satisfies RetentionLegalHoldModuleService;
  });

export const RetentionLegalHoldModuleLive = Layer.effect(
  RetentionLegalHoldModule,
  makeRetentionLegalHoldModule(),
);
