import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  AuditActionSchema,
  AuditEventSchema,
  auditLogAuditAction,
  authorizationAuditAction,
  billingAndMeteringAuditAction,
  fileStorageAuditAction,
  fieldSecurityAuditAction,
  platformModuleId,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
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

export const AuditEventTargetQuerySchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  target: Schema.NonEmptyString,
});

export type AuditEventTargetQuery = Schema.Schema.Type<
  typeof AuditEventTargetQuerySchema
>;

export const AuditEventActorQuerySchema = Schema.Struct({
  actorId: Schema.NonEmptyString,
});

export type AuditEventActorQuery = Schema.Schema.Type<
  typeof AuditEventActorQuerySchema
>;

export const AuditEventTenantQuerySchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
});

export type AuditEventTenantQuery = Schema.Schema.Type<
  typeof AuditEventTenantQuerySchema
>;

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
    moduleId: platformModuleId.authorization,
    action: authorizationAuditAction.tupleChanged,
    reasonRequired: true,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.fieldSecurity,
    action: fieldSecurityAuditAction.sensitiveRead,
    reasonRequired: true,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.auditLog,
    action: auditLogAuditAction.exported,
    reasonRequired: false,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.runtimeConfig,
    action: runtimeConfigAuditAction.overrideProposed,
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
    moduleId: platformModuleId.runtimeConfig,
    action: runtimeConfigAuditAction.proposalReviewed,
    reasonRequired: true,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.supportOperations,
    action: supportOperationsAuditAction.impersonationStarted,
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
    moduleId: platformModuleId.supportOperations,
    action: supportOperationsAuditAction.breakGlassReviewed,
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
  {
    moduleId: platformModuleId.tenantManagement,
    action: tenantManagementAuditAction.membershipsInspected,
    reasonRequired: false,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.tenantManagement,
    action: tenantManagementAuditAction.invitationsInspected,
    reasonRequired: false,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.tenantManagement,
    action: tenantManagementAuditAction.invitationIssued,
    reasonRequired: true,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.tenantManagement,
    action: tenantManagementAuditAction.invitationRedeemed,
    reasonRequired: false,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.tenantManagement,
    action: tenantManagementAuditAction.invitationRevoked,
    reasonRequired: true,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.tenantManagement,
    action: tenantManagementAuditAction.membershipGranted,
    reasonRequired: true,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.tenantManagement,
    action: tenantManagementAuditAction.membershipRevoked,
    reasonRequired: true,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.tenantManagement,
    action: tenantManagementAuditAction.onboardingInspected,
    reasonRequired: false,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.fileStorage,
    action: fileStorageAuditAction.registered,
    reasonRequired: false,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.fileStorage,
    action: fileStorageAuditAction.downloadResolved,
    reasonRequired: false,
    correlationRequired: true,
  },
  {
    moduleId: platformModuleId.fileStorage,
    action: fileStorageAuditAction.deleted,
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
  ) => Effect.Effect<readonly AuditEvent[], AuditLogModuleError>;
  readonly queryByTarget: (
    input: AuditEventTargetQuery,
  ) => Effect.Effect<readonly AuditEvent[], AuditLogModuleError>;
  readonly queryByActor: (
    input: AuditEventActorQuery,
  ) => Effect.Effect<readonly AuditEvent[], AuditLogModuleError>;
  readonly queryByTenant: (
    input: AuditEventTenantQuery,
  ) => Effect.Effect<readonly AuditEvent[], AuditLogModuleError>;
  readonly requirements: Effect.Effect<readonly AuditEventRequirement[]>;
};

export class AuditLogModule extends Context.Tag("AuditLogModule")<
  AuditLogModule,
  AuditLogModuleService
>() {}

const createAuditEventId = (input: BuildAuditEventInput) =>
  `${input.moduleId}:${input.action}:${input.target}:${input.requestContext.correlationId}:${crypto.randomUUID()}`;

export const buildAuditEvent = (input: BuildAuditEventInput) =>
  Schema.decodeUnknown(BuildAuditEventInputSchema)(input).pipe(
    Effect.flatMap((decodedInput) =>
      Schema.decodeUnknown(AuditEventSchema)({
        eventId: createAuditEventId(decodedInput),
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
    queryByModule: (moduleId) => repository.queryByModule(moduleId),
    queryByTarget: (input) =>
      Schema.decodeUnknown(AuditEventTargetQuerySchema)(input).pipe(
        Effect.flatMap((query) => repository.queryByTarget(query)),
      ),
    queryByActor: (input) =>
      Schema.decodeUnknown(AuditEventActorQuerySchema)(input).pipe(
        Effect.flatMap((query) => repository.queryByActor(query.actorId)),
      ),
    queryByTenant: (input) =>
      Schema.decodeUnknown(AuditEventTenantQuerySchema)(input).pipe(
        Effect.flatMap((query) => repository.queryByTenant(query)),
      ),
    requirements: Effect.succeed([...defaultAuditEventRequirements]),
  });

export const AuditLogModuleLive = Layer.effect(
  AuditLogModule,
  AuditLogPostgresRepository.pipe(Effect.flatMap(makeAuditLogModule)),
);
