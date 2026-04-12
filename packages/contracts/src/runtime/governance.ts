import { Schema } from "effect";
import { PlatformModuleIdSchema } from "../module-registry/modules";
import { PlatformScopeSchema } from "../access/platform-scopes";
import { AuditActionSchema } from "./audit-actions";

const RuntimeResolutionSourceConstantSchema = Schema.Struct({
  codeDefault: Schema.Literal("code-default"),
  runtimeOverride: Schema.Literal("runtime-override"),
  unentitledDefault: Schema.Literal("unentitled-default"),
});

export const runtimeResolutionSource = Schema.validateSync(
  RuntimeResolutionSourceConstantSchema,
)({
  codeDefault: "code-default",
  runtimeOverride: "runtime-override",
  unentitledDefault: "unentitled-default",
} satisfies Schema.Schema.Type<typeof RuntimeResolutionSourceConstantSchema>);

export const persistedConfigSource = {
  codeDefault: runtimeResolutionSource.codeDefault,
  runtimeOverride: runtimeResolutionSource.runtimeOverride,
} as const;

export const persistedConfigSources = [
  persistedConfigSource.codeDefault,
  persistedConfigSource.runtimeOverride,
] as const;

export const PersistedConfigSourceSchema = Schema.Literal(
  ...persistedConfigSources,
);

export type PersistedConfigSource = Schema.Schema.Type<
  typeof PersistedConfigSourceSchema
>;

export const runtimeResolutionSources = [
  runtimeResolutionSource.codeDefault,
  runtimeResolutionSource.runtimeOverride,
  runtimeResolutionSource.unentitledDefault,
] as const;

export const RuntimeResolutionSourceSchema = Schema.Literal(
  ...runtimeResolutionSources,
);

export type RuntimeResolutionSource = Schema.Schema.Type<
  typeof RuntimeResolutionSourceSchema
>;

const RuntimeChangeProposalActionConstantSchema = Schema.Struct({
  create: Schema.Literal("create"),
  update: Schema.Literal("update"),
  rename: Schema.Literal("rename"),
  retire: Schema.Literal("retire"),
});

export const runtimeChangeProposalAction = Schema.validateSync(
  RuntimeChangeProposalActionConstantSchema,
)({
  create: "create",
  update: "update",
  rename: "rename",
  retire: "retire",
} satisfies Schema.Schema.Type<
  typeof RuntimeChangeProposalActionConstantSchema
>);

export const runtimeChangeProposalActions = [
  runtimeChangeProposalAction.create,
  runtimeChangeProposalAction.update,
  runtimeChangeProposalAction.rename,
  runtimeChangeProposalAction.retire,
] as const;

export const RuntimeChangeProposalActionSchema = Schema.Literal(
  ...runtimeChangeProposalActions,
);

export type RuntimeChangeProposalAction = Schema.Schema.Type<
  typeof RuntimeChangeProposalActionSchema
>;

export const ConfigOverrideSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  key: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  value: Schema.Unknown,
  source: PersistedConfigSourceSchema,
  changedBy: Schema.NonEmptyString,
  changedAt: Schema.NonEmptyString,
});

export type ConfigOverride = Schema.Schema.Type<typeof ConfigOverrideSchema>;

export const EntitlementSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  featureKey: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  active: Schema.Boolean,
  grantedAt: Schema.NonEmptyString,
  expiresAt: Schema.optional(Schema.NonEmptyString),
});

export type Entitlement = Schema.Schema.Type<typeof EntitlementSchema>;

export const AuditEventSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
  timestamp: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  action: AuditActionSchema,
  target: Schema.NonEmptyString,
  reason: Schema.optional(Schema.NonEmptyString),
  correlationId: Schema.optional(Schema.NonEmptyString),
});

export type AuditEvent = Schema.Schema.Type<typeof AuditEventSchema>;

export const ConfigChangeEventSchema = Schema.Struct({
  eventId: Schema.NonEmptyString,
  timestamp: Schema.NonEmptyString,
  actorId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  key: Schema.NonEmptyString,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  previousValue: Schema.Unknown,
  newValue: Schema.Unknown,
  source: PersistedConfigSourceSchema,
});

export type ConfigChangeEvent = Schema.Schema.Type<
  typeof ConfigChangeEventSchema
>;

export const ModuleHealthIndicatorSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  healthy: Schema.Boolean,
  details: Schema.optional(Schema.NonEmptyString),
});

export type ModuleHealthIndicator = Schema.Schema.Type<
  typeof ModuleHealthIndicatorSchema
>;
