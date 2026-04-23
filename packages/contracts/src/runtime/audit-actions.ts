import { Schema } from "effect";
import { platformModuleId } from "../module-registry/modules";
import { defineModuleAuditActions } from "./audit-action-helpers";

export const authorizationAuditAction = defineModuleAuditActions(
  platformModuleId.authorization,
  {
    decisionPrivileged: "decision.privileged",
  },
);

export const fieldSecurityAuditAction = defineModuleAuditActions(
  platformModuleId.fieldSecurity,
  {
    sensitiveRead: "sensitive-read",
  },
);

export const runtimeConfigAuditAction = defineModuleAuditActions(
  platformModuleId.runtimeConfig,
  {
    overrideChanged: "override.changed",
  },
);

export const supportOperationsAuditAction = defineModuleAuditActions(
  platformModuleId.supportOperations,
  {
    breakGlassStarted: "break-glass.started",
  },
);

export const billingAndMeteringAuditAction = defineModuleAuditActions(
  platformModuleId.billingAndMetering,
  {
    quotaBlocked: "quota.blocked",
    reconciliationTriggered: "reconciliation.triggered",
  },
);

export const tenantManagementAuditAction = defineModuleAuditActions(
  platformModuleId.tenantManagement,
  {
    onboardingCompleted: "onboarding.completed",
  },
);

export const auditActions = [
  authorizationAuditAction.decisionPrivileged,
  fieldSecurityAuditAction.sensitiveRead,
  runtimeConfigAuditAction.overrideChanged,
  supportOperationsAuditAction.breakGlassStarted,
  billingAndMeteringAuditAction.quotaBlocked,
  billingAndMeteringAuditAction.reconciliationTriggered,
  tenantManagementAuditAction.onboardingCompleted,
] as const;

export const AuditActionSchema = Schema.Literal(...auditActions);

export type AuditAction = Schema.Schema.Type<typeof AuditActionSchema>;
