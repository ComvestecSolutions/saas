import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  ModuleHealthIndicatorSchema,
  PermissionScopeSchema,
  platformModuleId,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
  RequestContextSchema,
  TelemetryKindSchema,
} from "@comvestec/contracts";

export const TelemetryEnvelopeSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  kind: TelemetryKindSchema,
  correlationId: Schema.NonEmptyString,
  actorId: Schema.optional(Schema.NonEmptyString),
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  permissionScope: Schema.optional(PermissionScopeSchema),
  deploymentVersion: Schema.NonEmptyString,
  configVersion: Schema.NonEmptyString,
});

export type TelemetryEnvelope = Schema.Schema.Type<
  typeof TelemetryEnvelopeSchema
>;

export const ServiceLevelObjectiveSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  target: Schema.Number,
  window: Schema.NonEmptyString,
  indicator: Schema.NonEmptyString,
});

export type ServiceLevelObjective = Schema.Schema.Type<
  typeof ServiceLevelObjectiveSchema
>;

const ServiceLevelObjectiveListSchema = Schema.Array(
  ServiceLevelObjectiveSchema,
);

export const defaultServiceLevelObjectives = Schema.validateSync(
  ServiceLevelObjectiveListSchema,
)([
  {
    name: "platform.availability.monthly",
    moduleId: platformModuleId.observability,
    target: 99.9,
    window: "30d",
    indicator: "availability.rate",
  },
  {
    name: "product-app.route-loader.p95",
    moduleId: platformModuleId.tenantManagement,
    target: 500,
    window: "1h",
    indicator: "route_loader_latency_ms.p95",
  },
  {
    name: "runtime-config.sync.freshness",
    moduleId: platformModuleId.runtimeConfig,
    target: 300,
    window: "15m",
    indicator: "sync_freshness_seconds.max",
  },
  {
    name: "audit-log.ingest.delay",
    moduleId: platformModuleId.auditLog,
    target: 60,
    window: "15m",
    indicator: "audit_ingest_delay_seconds.p95",
  },
] satisfies readonly ServiceLevelObjective[]);

const healthIndicators = Schema.validateSync(
  Schema.Array(ModuleHealthIndicatorSchema),
)([
  {
    moduleId: platformModuleId.authorization,
    healthy: true,
    details: "Tuple explainability responses available.",
  },
  {
    moduleId: platformModuleId.runtimeConfig,
    healthy: true,
    details: "Change proposal artifact generation configured.",
  },
  {
    moduleId: platformModuleId.billingAndMetering,
    healthy: true,
    details:
      "Quota evaluation and internal cost allocation scaffolds available.",
  },
] satisfies readonly Schema.Schema.Type<typeof ModuleHealthIndicatorSchema>[]);

const BuildTelemetryEnvelopeInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  moduleId: PlatformModuleIdSchema,
  kind: TelemetryKindSchema,
  permissionScope: Schema.optional(PermissionScopeSchema),
  deploymentVersion: Schema.NonEmptyString,
  configVersion: Schema.NonEmptyString,
});

export type ObservabilityModuleService = {
  readonly buildTelemetryEnvelope: (
    input: unknown,
  ) => Effect.Effect<TelemetryEnvelope, ParseResult.ParseError>;
  readonly listSlos: Effect.Effect<readonly ServiceLevelObjective[]>;
  readonly listHealthIndicators: Effect.Effect<
    readonly Schema.Schema.Type<typeof ModuleHealthIndicatorSchema>[]
  >;
};

export class ObservabilityModule extends Context.Tag("ObservabilityModule")<
  ObservabilityModule,
  ObservabilityModuleService
>() {}

export const makeObservabilityModule = () =>
  Effect.succeed<ObservabilityModuleService>({
    buildTelemetryEnvelope: (input: unknown) =>
      Schema.decodeUnknown(BuildTelemetryEnvelopeInputSchema)(input).pipe(
        Effect.flatMap((request) =>
          Schema.decodeUnknown(TelemetryEnvelopeSchema)({
            moduleId: request.moduleId,
            kind: request.kind,
            correlationId: request.requestContext.correlationId,
            actorId: request.requestContext.actorId,
            tenantScope: request.requestContext.tenant.scope,
            tenantScopeId: request.requestContext.tenant.scopeId,
            permissionScope: request.permissionScope,
            deploymentVersion: request.deploymentVersion,
            configVersion: request.configVersion,
          }),
        ),
      ),
    listSlos: Effect.succeed([...defaultServiceLevelObjectives]),
    listHealthIndicators: Effect.succeed([...healthIndicators]),
  });

export const ObservabilityModuleLive = Layer.effect(
  ObservabilityModule,
  makeObservabilityModule(),
);
