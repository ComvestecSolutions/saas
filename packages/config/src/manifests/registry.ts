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

export const platformModuleManifests = Schema.validateSync(
  PlatformModuleManifestListSchema,
)(platformModuleManifestSeed);

export const findModuleManifest = (
  moduleId: PlatformModuleId,
): PlatformModuleManifest | undefined =>
  platformModuleManifests.find((manifest) => manifest.moduleId === moduleId);
