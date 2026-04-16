import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  AuditActionSchema,
  AuditEventSchema,
  authorizationAuditAction,
  billingAndMeteringAuditAction,
  fieldSecurityAuditAction,
  platformModuleId,
  PlatformModuleIdSchema,
  RequestContextSchema,
  runtimeConfigAuditAction,
  supportOperationsAuditAction,
  tenantManagementAuditAction,
  type AuditEvent,
} from "@comvestec/contracts";
import {
  AuditLogPostgresRepository,
  type AuditLogPostgresRepositoryError,
} from "../persistence/postgres/governance";

export const AuditEventRequirementSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  action: AuditActionSchema,
  reasonRequired: Schema.Boolean,
  correlationRequired: Schema.Boolean,
});

export type AuditEventRequirement = Schema.Schema.Type<
  typeof AuditEventRequirementSchema
>;

export const AuditEventRequirementListSchema = Schema.Array(
  AuditEventRequirementSchema,
);

export const defaultAuditEventRequirements = Schema.validateSync(
  AuditEventRequirementListSchema,
)([
  {
    moduleId: platformModuleId.authorization,
    action: authorizationAuditAction.decisionPrivileged,
    reasonRequired: false,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.fieldSecurity,
    action: fieldSecurityAuditAction.sensitiveRead,
    reasonRequired: true,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.runtimeConfig,
    action: runtimeConfigAuditAction.overrideChanged,
    reasonRequired: true,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.supportOperations,
    action: supportOperationsAuditAction.breakGlassStarted,
    reasonRequired: true,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.billingAndMetering,
    action: billingAndMeteringAuditAction.quotaBlocked,
    reasonRequired: false,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.tenantManagement,
    action: tenantManagementAuditAction.onboardingCompleted,
    reasonRequired: false,
    correlationRequired: true,
  },
] satisfies readonly AuditEventRequirement[]);

const BuildAuditEventInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  action: AuditActionSchema,
  target: Schema.NonEmptyString,
  reason: Schema.optional(Schema.NonEmptyString),
});

export type BuildAuditEventInput = Schema.Schema.Type<
  typeof BuildAuditEventInputSchema
>;

export type AuditLogParseError = ParseResult.ParseError;

export type AuditLogModuleError =
  | AuditLogParseError
  | AuditLogPostgresRepositoryError;

export type AuditLogModuleService = {
  readonly append: (
    input: BuildAuditEventInput,
  ) => Effect.Effect<AuditEvent, AuditLogModuleError>;
  readonly queryByModule: (
    moduleId: BuildAuditEventInput["moduleId"],
  ) => Effect.Effect<readonly AuditEvent[]>;
  readonly requirements: Effect.Effect<readonly AuditEventRequirement[]>;
};

export class AuditLogModule extends Context.Tag("AuditLogModule")<
  AuditLogModule,
  AuditLogModuleService
>() {}

export const buildAuditEvent = (input: BuildAuditEventInput) =>
  Schema.decodeUnknown(BuildAuditEventInputSchema)(input).pipe(
    Effect.flatMap((decodedInput) =>
      Schema.decodeUnknown(AuditEventSchema)({
        eventId: `${decodedInput.moduleId}:${decodedInput.action}:${decodedInput.requestContext.correlationId}`,
        timestamp: new Date().toISOString(),
        actorId:
          decodedInput.requestContext.actorId ??
          `${decodedInput.requestContext.actorType}:anonymous`,
        tenantScope: decodedInput.requestContext.tenant.scope,
        tenantScopeId: decodedInput.requestContext.tenant.scopeId,
        moduleId: decodedInput.moduleId,
        action: decodedInput.action,
        target: decodedInput.target,
        reason: decodedInput.reason ?? decodedInput.requestContext.reason,
        correlationId: decodedInput.requestContext.correlationId,
      }),
    ),
  );

export const makeAuditLogModule = (
  repository: AuditLogPostgresRepository["Type"],
) =>
  Effect.succeed<AuditLogModuleService>({
    append: (input: BuildAuditEventInput) =>
      buildAuditEvent(input).pipe(
        Effect.flatMap((event) => repository.insertAuditEvent(event)),
      ),
    queryByModule: (moduleId) =>
      repository.queryByModule(moduleId).pipe(Effect.orElseSucceed(() => [])),
    requirements: Effect.succeed([...defaultAuditEventRequirements]),
  });

export const AuditLogModuleLive = Layer.effect(
  AuditLogModule,
  AuditLogPostgresRepository.pipe(Effect.flatMap(makeAuditLogModule)),
);
