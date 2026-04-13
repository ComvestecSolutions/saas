import { Schema } from "effect";
import type { PlatformModuleId } from "./modules";

type TypedStringSchema<TValue extends string> = Schema.Schema<TValue, string>;

export type ModuleScopedKey<
  TModule extends PlatformModuleId = PlatformModuleId,
> = `${TModule}.${string}`;

export type ModuleConfigKey<
  TModule extends PlatformModuleId = PlatformModuleId,
> = ModuleScopedKey<TModule>;

export type ModuleFeatureFlagKey<
  TModule extends PlatformModuleId = PlatformModuleId,
> = ModuleScopedKey<TModule>;

export type ModuleRuntimeValueKey<
  TModule extends PlatformModuleId = PlatformModuleId,
> = ModuleScopedKey<TModule>;

export type ModuleEntitlementFeatureKey<
  TModule extends PlatformModuleId = PlatformModuleId,
> = ModuleFeatureFlagKey<TModule>;

export type ModuleMeterKey<
  TModule extends PlatformModuleId = PlatformModuleId,
> = ModuleEntitlementFeatureKey<TModule>;

const ModuleScopedKeySchemaBase = Schema.NonEmptyString.pipe(
  Schema.pattern(/^[a-z0-9-]+\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/),
);

export const ModuleScopedKeySchema =
  ModuleScopedKeySchemaBase as TypedStringSchema<ModuleScopedKey>;

const ModuleFeatureFlagDefaultsSchema = Schema.Struct({
  enabled: Schema.Literal("enabled"),
});

export const moduleFeatureFlagDefaults = Schema.validateSync(
  ModuleFeatureFlagDefaultsSchema,
)({
  enabled: "enabled",
} satisfies Schema.Schema.Type<typeof ModuleFeatureFlagDefaultsSchema>);

export const DeclaredModuleConfigKeySchema = ModuleScopedKeySchema;

export type DeclaredModuleConfigKey = Schema.Schema.Type<
  typeof DeclaredModuleConfigKeySchema
>;

export const DeclaredModuleFeatureFlagKeySchema = ModuleScopedKeySchema;

export type DeclaredModuleFeatureFlagKey = Schema.Schema.Type<
  typeof DeclaredModuleFeatureFlagKeySchema
>;

export const DeclaredRuntimeGovernedKeySchema = ModuleScopedKeySchema;

export type DeclaredRuntimeGovernedKey = Schema.Schema.Type<
  typeof DeclaredRuntimeGovernedKeySchema
>;

export const DeclaredModuleRuntimeValueKeySchema = ModuleScopedKeySchema;

export type DeclaredModuleRuntimeValueKey = Schema.Schema.Type<
  typeof DeclaredModuleRuntimeValueKeySchema
>;

export const DeclaredModuleEntitlementFeatureKeySchema =
  DeclaredModuleFeatureFlagKeySchema;

export type DeclaredModuleEntitlementFeatureKey = Schema.Schema.Type<
  typeof DeclaredModuleEntitlementFeatureKeySchema
>;

export const DeclaredModuleMeterKeySchema =
  DeclaredModuleEntitlementFeatureKeySchema;

export type DeclaredModuleMeterKey = Schema.Schema.Type<
  typeof DeclaredModuleMeterKeySchema
>;

export const GovernanceEntitlementFeatureKeySchema =
  DeclaredRuntimeGovernedKeySchema;

export type GovernanceEntitlementFeatureKey = Schema.Schema.Type<
  typeof GovernanceEntitlementFeatureKeySchema
>;

const defineModuleScopedKeys = <
  const TModule extends PlatformModuleId,
  const TSuffixes extends Record<string, string>,
>(
  moduleId: TModule,
  suffixes: TSuffixes,
): {
  readonly [K in keyof TSuffixes]: `${TModule}.${TSuffixes[K] & string}`;
} => {
  const result: Record<string, string> = {};
  for (const [key, suffix] of Object.entries(suffixes)) {
    result[key] = `${moduleId}.${suffix}`;
  }
  return result as never;
};

export const defineModuleConfigKeys = <
  const TModule extends PlatformModuleId,
  const TSuffixes extends Record<string, string>,
>(
  moduleId: TModule,
  suffixes: TSuffixes,
): {
  readonly [K in keyof TSuffixes]: `${TModule}.${TSuffixes[K] & string}`;
} => defineModuleScopedKeys(moduleId, suffixes);

type ModuleFeatureFlagDefinitions<
  TModule extends PlatformModuleId,
  TSuffixes extends Record<string, string>,
> = {
  readonly enabled: `${TModule}.${typeof moduleFeatureFlagDefaults.enabled}`;
} & {
  readonly [K in keyof TSuffixes]: `${TModule}.${TSuffixes[K] & string}`;
};

export const defineModuleFeatureFlags = <
  const TModule extends PlatformModuleId,
  const TSuffixes extends Record<string, string>,
>(
  moduleId: TModule,
  suffixes: TSuffixes & { readonly enabled?: never },
): ModuleFeatureFlagDefinitions<TModule, TSuffixes> =>
  defineModuleScopedKeys(moduleId, {
    ...suffixes,
    ...moduleFeatureFlagDefaults,
  }) as ModuleFeatureFlagDefinitions<TModule, TSuffixes>;

export const defineModuleRuntimeValueKeys = <
  const TModule extends PlatformModuleId,
  const TSuffixes extends Record<string, string>,
>(
  moduleId: TModule,
  suffixes: TSuffixes,
): {
  readonly [K in keyof TSuffixes]: `${TModule}.${TSuffixes[K] & string}`;
} => defineModuleScopedKeys(moduleId, suffixes);
