import { Schema } from "effect";
import { PlatformModuleIdSchema } from "./modules";

const ModuleCapabilityConstantSchema = Schema.Struct({
  effectiveValueResolution: Schema.Literal("effective-value-resolution"),
  publishedAssetPublication: Schema.Literal("published-asset-publication"),
  brandedRedirectHandoff: Schema.Literal("branded-redirect-handoff"),
  sensitiveReadAudit: Schema.Literal("sensitive-read-audit"),
  entitlementGateEvaluation: Schema.Literal("entitlement-gate-evaluation"),
  breakGlassEscalation: Schema.Literal("break-glass-escalation"),
  privilegedDecisionAudit: Schema.Literal("privileged-decision-audit"),
});

export const moduleCapability = Schema.validateSync(
  ModuleCapabilityConstantSchema,
)({
  effectiveValueResolution: "effective-value-resolution",
  publishedAssetPublication: "published-asset-publication",
  brandedRedirectHandoff: "branded-redirect-handoff",
  sensitiveReadAudit: "sensitive-read-audit",
  entitlementGateEvaluation: "entitlement-gate-evaluation",
  breakGlassEscalation: "break-glass-escalation",
  privilegedDecisionAudit: "privileged-decision-audit",
} satisfies Schema.Schema.Type<typeof ModuleCapabilityConstantSchema>);

export const moduleCapabilities = [
  moduleCapability.effectiveValueResolution,
  moduleCapability.publishedAssetPublication,
  moduleCapability.brandedRedirectHandoff,
  moduleCapability.sensitiveReadAudit,
  moduleCapability.entitlementGateEvaluation,
  moduleCapability.breakGlassEscalation,
  moduleCapability.privilegedDecisionAudit,
] as const;

export const ModuleCapabilitySchema = Schema.Literal(...moduleCapabilities);

export type ModuleCapability = Schema.Schema.Type<
  typeof ModuleCapabilitySchema
>;

export const ModuleCapabilityContractSchema = Schema.Struct({
  fromModuleId: PlatformModuleIdSchema,
  toModuleId: PlatformModuleIdSchema,
  capability: ModuleCapabilitySchema,
  reason: Schema.NonEmptyString,
});

export type ModuleCapabilityContract = Schema.Schema.Type<
  typeof ModuleCapabilityContractSchema
>;

export const ModuleCapabilityContractListSchema = Schema.Array(
  ModuleCapabilityContractSchema,
);
