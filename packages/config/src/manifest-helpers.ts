import { Schema } from "effect";
import type {
  ConfigSchemaType,
  DataClassificationDeclaration,
  PermissionScope,
  PlatformScope,
  ProjectionDescriptor,
} from "@comvestec/contracts";
import {
  PlatformModuleManifestSchema,
  type PlatformModuleId,
} from "./module-types";

type ModuleScopedKey<TModule extends PlatformModuleId> = `${TModule}.${string}`;

export type ModuleConfigKey<TModule extends PlatformModuleId> =
  ModuleScopedKey<TModule>;

export type ModuleFeatureFlagKey<TModule extends PlatformModuleId> =
  ModuleScopedKey<TModule>;

export type ModuleRuntimeValueKey<TModule extends PlatformModuleId> =
  ModuleScopedKey<TModule>;

type ModuleConfigDeclarationSeed<TModule extends PlatformModuleId> = {
  key: ModuleConfigKey<TModule>;
  description: string;
  schema: ConfigSchemaType;
  defaultValue: unknown;
  billable: boolean;
  allowedScopes: readonly PlatformScope[];
  owner: TModule;
};

type ModuleFeatureFlagDeclarationSeed<TModule extends PlatformModuleId> = {
  key: ModuleFeatureFlagKey<TModule>;
  description: string;
  owner: TModule;
  purpose: string;
  defaultEnabled: boolean;
  billable: boolean;
  allowedScopes: readonly PlatformScope[];
  retirementPlan: string;
};

type ModuleManifestSeed<TModule extends PlatformModuleId> = {
  moduleId: TModule;
  configKeys: readonly ModuleConfigDeclarationSeed<TModule>[];
  featureFlags: readonly ModuleFeatureFlagDeclarationSeed<TModule>[];
  permissionScopes: readonly PermissionScope[];
  fieldClassifications: readonly DataClassificationDeclaration[];
  projectionProfiles: readonly ProjectionDescriptor[];
};

export const defineModuleConfigKeys = <
  const TModule extends PlatformModuleId,
  const TSuffixes extends Record<string, string>,
>(
  moduleId: TModule,
  suffixes: TSuffixes,
): {
  readonly [K in keyof TSuffixes]: `${TModule}.${TSuffixes[K] & string}`;
} => {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(suffixes)) {
    result[k] = `${moduleId}.${v}`;
  }
  return result as never;
};

export const defineModuleFeatureFlags = <
  const TModule extends PlatformModuleId,
  const TSuffixes extends Record<string, string>,
>(
  moduleId: TModule,
  suffixes: TSuffixes,
): {
  readonly [K in keyof TSuffixes]: `${TModule}.${TSuffixes[K] & string}`;
} => {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(suffixes)) {
    result[k] = `${moduleId}.${v}`;
  }
  return result as never;
};

export const defineModuleRuntimeValueKeys = <
  const TModule extends PlatformModuleId,
  const TSuffixes extends Record<string, string>,
>(
  moduleId: TModule,
  suffixes: TSuffixes,
): {
  readonly [K in keyof TSuffixes]: `${TModule}.${TSuffixes[K] & string}`;
} => {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(suffixes)) {
    result[k] = `${moduleId}.${v}`;
  }
  return result as never;
};

export const defineModuleManifest = <const TModule extends PlatformModuleId>(
  manifest: ModuleManifestSeed<TModule>,
) => Schema.validateSync(PlatformModuleManifestSchema)(manifest);

/**
 * Shared default-value sentinel for config keys that cascade from a parent scope.
 */
export const configDefaultValue = {
  inherit: "inherit" as const,
} as const;
