import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  onboardingStepStatus,
  OnboardingStepStatusSchema,
  platformModuleId,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
  RequestContextSchema,
  TenantContextSchema,
} from "@comvestec/contracts";
import { hasPrivilegedBreakGlassAccess } from "../access/break-glass";

export const OnboardingStepSchema = Schema.Struct({
  stepId: Schema.NonEmptyString,
  label: Schema.NonEmptyString,
  status: OnboardingStepStatusSchema,
  requiredModuleId: Schema.optional(PlatformModuleIdSchema),
});

export type OnboardingStep = Schema.Schema.Type<typeof OnboardingStepSchema>;

export const TenantOnboardingPlanSchema = Schema.Struct({
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  steps: Schema.Array(OnboardingStepSchema),
});

export type TenantOnboardingPlan = Schema.Schema.Type<
  typeof TenantOnboardingPlanSchema
>;

const BuildOnboardingPlanInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  enabledModules: Schema.Array(PlatformModuleIdSchema),
});

const IsolationAssertionInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  resourceTenant: TenantContextSchema,
});

export const IsolationAssertionResultSchema = Schema.Struct({
  allowed: Schema.Boolean,
  reason: Schema.NonEmptyString,
});

export type IsolationAssertionResult = Schema.Schema.Type<
  typeof IsolationAssertionResultSchema
>;

export type TenantManagementModuleService = {
  readonly buildOnboardingPlan: (
    input: unknown,
  ) => Effect.Effect<TenantOnboardingPlan, ParseResult.ParseError>;
  readonly assertTenantIsolation: (
    input: unknown,
  ) => Effect.Effect<IsolationAssertionResult, ParseResult.ParseError>;
};

export class TenantManagementModule extends Context.Tag(
  "TenantManagementModule",
)<TenantManagementModule, TenantManagementModuleService>() {}

export const makeTenantManagementModule = () =>
  Effect.succeed<TenantManagementModuleService>({
    buildOnboardingPlan: (input: unknown) =>
      Schema.decodeUnknown(BuildOnboardingPlanInputSchema)(input).pipe(
        Effect.flatMap((request) => {
          const steps: OnboardingStep[] = [
            {
              stepId: "tenant-profile",
              label: "Create tenant profile and confirm primary owner.",
              status: onboardingStepStatus.completed,
            },
            {
              stepId: "team-invites",
              label: "Invite core team members and assign roles.",
              status: onboardingStepStatus.inProgress,
              requiredModuleId: platformModuleId.tenantManagement,
            },
            {
              stepId: "security-baseline",
              label: "Enable MFA and verify privileged access workflows.",
              status: onboardingStepStatus.notStarted,
              requiredModuleId: platformModuleId.identitySession,
            },
          ];

          if (
            request.enabledModules.includes(platformModuleId.tenantBranding)
          ) {
            steps.push({
              stepId: "branding",
              label: "Apply approved branding and login handoff settings.",
              status: onboardingStepStatus.notStarted,
              requiredModuleId: platformModuleId.tenantBranding,
            });
          }

          if (
            request.enabledModules.includes(platformModuleId.billingAndMetering)
          ) {
            steps.push({
              stepId: "billing",
              label: "Confirm entitlements, quotas, and billing contacts.",
              status: onboardingStepStatus.notStarted,
              requiredModuleId: platformModuleId.billingAndMetering,
            });
          }

          return Schema.decodeUnknown(TenantOnboardingPlanSchema)({
            tenantScope: request.requestContext.tenant.scope,
            tenantScopeId: request.requestContext.tenant.scopeId,
            steps,
          });
        }),
      ),
    assertTenantIsolation: (input: unknown) =>
      Schema.decodeUnknown(IsolationAssertionInputSchema)(input).pipe(
        Effect.flatMap((request) => {
          const sameTenant =
            request.requestContext.tenant.scope ===
              request.resourceTenant.scope &&
            request.requestContext.tenant.scopeId ===
              request.resourceTenant.scopeId;

          const privilegedBreakGlass = hasPrivilegedBreakGlassAccess(
            request.requestContext,
          );

          return Schema.decodeUnknown(IsolationAssertionResultSchema)(
            sameTenant
              ? {
                  allowed: true,
                  reason: "Request tenant matches resource tenant.",
                }
              : privilegedBreakGlass
                ? {
                    allowed: true,
                    reason:
                      "Break-glass context explicitly allows privileged cross-tenant inspection.",
                  }
                : {
                    allowed: false,
                    reason:
                      "Cross-tenant access denied by tenant isolation policy.",
                  },
          );
        }),
      ),
  });

export const TenantManagementModuleLive = Layer.effect(
  TenantManagementModule,
  makeTenantManagementModule(),
);
