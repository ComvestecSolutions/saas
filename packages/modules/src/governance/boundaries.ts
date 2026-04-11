import { Schema } from "effect";
import {
  type ModuleCapability,
  ModuleCapabilityContractSchema,
  ModuleCapabilityContractListSchema,
  moduleCapability,
  platformModuleId,
} from "@comvestec/contracts";

export type ModuleCapabilityContract = Schema.Schema.Type<
  typeof ModuleCapabilityContractSchema
>;

export const moduleCapabilityContracts = Schema.validateSync(
  ModuleCapabilityContractListSchema,
)([
  {
    fromModuleId: platformModuleId.runtimeConfig,
    toModuleId: platformModuleId.tenantBranding,
    capability: moduleCapability.effectiveValueResolution,
    reason: "Resolve tenant branding through declared runtime-config values.",
  },
  {
    fromModuleId: platformModuleId.tenantBranding,
    toModuleId: platformModuleId.fileStorage,
    capability: moduleCapability.publishedAssetPublication,
    reason:
      "Publish approved branding assets without sharing raw storage ownership.",
  },
  {
    fromModuleId: platformModuleId.tenantBranding,
    toModuleId: platformModuleId.identitySession,
    capability: moduleCapability.brandedRedirectHandoff,
    reason:
      "Resolve public-safe login branding before redirecting into Keycloak-owned flows.",
  },
  {
    fromModuleId: platformModuleId.fieldSecurity,
    toModuleId: platformModuleId.auditLog,
    capability: moduleCapability.sensitiveReadAudit,
    reason: "Record audited field reads through the audit-log module.",
  },
  {
    fromModuleId: platformModuleId.billingAndMetering,
    toModuleId: platformModuleId.runtimeConfig,
    capability: moduleCapability.entitlementGateEvaluation,
    reason:
      "Apply entitlements before billable config and flag overrides resolve.",
  },
  {
    fromModuleId: platformModuleId.supportOperations,
    toModuleId: platformModuleId.authorization,
    capability: moduleCapability.breakGlassEscalation,
    reason:
      "Escalate privileged checks through an explainable authorization path.",
  },
  {
    fromModuleId: platformModuleId.authorization,
    toModuleId: platformModuleId.auditLog,
    capability: moduleCapability.privilegedDecisionAudit,
    reason: "Audit privileged checks and explainability-sensitive decisions.",
  },
] satisfies readonly ModuleCapabilityContract[]);

export const getModuleCapabilityContracts = (
  moduleId: ModuleCapabilityContract["fromModuleId"],
) =>
  moduleCapabilityContracts.filter(
    (contract) => contract.fromModuleId === moduleId,
  );

export const canModuleRequestCapability = (
  fromModuleId: ModuleCapabilityContract["fromModuleId"],
  toModuleId: ModuleCapabilityContract["toModuleId"],
  capability: ModuleCapability,
) =>
  moduleCapabilityContracts.some(
    (contract) =>
      contract.fromModuleId === fromModuleId &&
      contract.toModuleId === toModuleId &&
      contract.capability === capability,
  );
