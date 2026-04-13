import { Schema } from "effect";
import {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
  defineModuleRuntimeValueKeys,
  type ConfigSchemaType,
  type DataClassificationDeclaration,
  type ModuleConfigKey,
  type ModuleEntitlementFeatureKey,
  type ModuleFeatureFlagKey,
  type ModuleMeterKey,
  type ModuleRuntimeValueKey,
  type PermissionScope,
  type PlatformScope,
  type ProjectionDescriptor,
} from "@comvestec/contracts";
import {
  PlatformModuleManifestSchema,
  type PlatformModuleId,
} from "./module-types";

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

export {
  defineModuleConfigKeys,
  defineModuleFeatureFlags,
  defineModuleRuntimeValueKeys,
};

export type {
  ModuleConfigKey,
  ModuleEntitlementFeatureKey,
  ModuleFeatureFlagKey,
  ModuleMeterKey,
  ModuleRuntimeValueKey,
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
