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
} from "@comvestec/contracts";

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

export type AuditLogModuleService = {
  readonly append: (
    input: unknown,
  ) => Effect.Effect<
    Schema.Schema.Type<typeof AuditEventSchema>,
    AuditLogParseError
  >;
  readonly queryByModule: (
    moduleId: BuildAuditEventInput["moduleId"],
  ) => Effect.Effect<readonly Schema.Schema.Type<typeof AuditEventSchema>[]>;
  readonly requirements: Effect.Effect<readonly AuditEventRequirement[]>;
};

export class AuditLogModule extends Context.Tag("AuditLogModule")<
  AuditLogModule,
  AuditLogModuleService
>() {}

export const buildAuditEvent = (input: unknown) =>
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

export const makeAuditLogModule = () =>
  Effect.sync<AuditLogModuleService>(() => {
    const events: Schema.Schema.Type<typeof AuditEventSchema>[] = [];

    return {
      append: (input: unknown) =>
        buildAuditEvent(input).pipe(
          Effect.tap((event) =>
            Effect.sync(() => {
              events.push(event);
            }),
          ),
        ),
      queryByModule: (moduleId) =>
        Effect.succeed(events.filter((event) => event.moduleId === moduleId)),
      requirements: Effect.succeed([...defaultAuditEventRequirements]),
    };
  });

export const AuditLogModuleLive = Layer.effect(
  AuditLogModule,
  makeAuditLogModule(),
);
