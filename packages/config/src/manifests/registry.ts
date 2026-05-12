import { Schema } from "effect";
import {
  type PlatformModuleId,
  type PlatformModuleManifest,
  PlatformModuleManifestListSchema,
} from "../module-types";
import {
  authorizationManifest,
  fieldSecurityManifest,
  identitySessionManifest,
} from "./access";
import {
  auditLogManifest,
  featureFlagsManifest,
  retentionLegalHoldManifest,
  runtimeConfigManifest,
  supportOperationsManifest,
} from "./governance";
import {
  billingAndMeteringManifest,
  observabilityManifest,
  tenantBrandingManifest,
  tenantManagementManifest,
} from "./domains";
import {
  emailDeliveryManifest,
  notificationCenterManifest,
  webhooksApiAccessManifest,
} from "./communication";
import {
  fileStorageManifest,
  importExportManifest,
  searchManifest,
  workflowJobsManifest,
} from "./data";

const platformModuleManifestSeed = [
  tenantManagementManifest,
  runtimeConfigManifest,
  authorizationManifest,
  fieldSecurityManifest,
  auditLogManifest,
  fileStorageManifest,
  tenantBrandingManifest,
  observabilityManifest,
  billingAndMeteringManifest,
  notificationCenterManifest,
  featureFlagsManifest,
  identitySessionManifest,
  searchManifest,
  workflowJobsManifest,
  emailDeliveryManifest,
  webhooksApiAccessManifest,
  importExportManifest,
  retentionLegalHoldManifest,
  supportOperationsManifest,
] satisfies readonly PlatformModuleManifest[];

export const validatePlatformModuleManifestDeclarations = <
  const TManifests extends readonly PlatformModuleManifest[],
>(
  manifests: TManifests,
): TManifests => {
  const dependencyGraph = new Map<
    PlatformModuleManifest["featureFlags"][number]["key"],
    readonly PlatformModuleManifest["featureFlags"][number]["key"][]
  >();

  for (const manifest of manifests) {
    for (const flag of manifest.featureFlags) {
      dependencyGraph.set(flag.key, flag.dependencies);
    }
  }

  for (const [flagKey, dependencies] of dependencyGraph) {
    for (const dependencyKey of dependencies) {
      if (!dependencyGraph.has(dependencyKey)) {
        throw new Error(
          `Feature flag dependency \"${dependencyKey}\" for \"${flagKey}\" is not declared.`,
        );
      }
    }
  }

  const dependencyStates = new Map<
    PlatformModuleManifest["featureFlags"][number]["key"],
    "visiting" | "visited"
  >();

  const visitDependency = (
    flagKey: PlatformModuleManifest["featureFlags"][number]["key"],
    path: readonly PlatformModuleManifest["featureFlags"][number]["key"][],
  ) => {
    const state = dependencyStates.get(flagKey);

    if (state === "visited") {
      return;
    }

    if (state === "visiting") {
      throw new Error(
        `Feature flag dependency cycle detected: ${[...path, flagKey].join(" -> ")}`,
      );
    }

    dependencyStates.set(flagKey, "visiting");

    for (const dependencyKey of dependencyGraph.get(flagKey) ?? []) {
      visitDependency(dependencyKey, [...path, flagKey]);
    }

    dependencyStates.set(flagKey, "visited");
  };

  for (const flagKey of dependencyGraph.keys()) {
    visitDependency(flagKey, []);
  }

  return manifests;
};

export const platformModuleManifests = Schema.validateSync(
  PlatformModuleManifestListSchema,
)(validatePlatformModuleManifestDeclarations(platformModuleManifestSeed));

export const findModuleManifest = (
  moduleId: PlatformModuleId,
): PlatformModuleManifest | undefined =>
  platformModuleManifests.find((manifest) => manifest.moduleId === moduleId);
