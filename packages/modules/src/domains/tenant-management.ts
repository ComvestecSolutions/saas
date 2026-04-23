import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  authorizationNamespace,
  authorizationRelation,
  onboardingStepStatus,
  OnboardingStepStatusSchema,
  platformModuleId,
  platformScope,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
  RequestContextSchema,
  TenantContextSchema,
} from "@comvestec/contracts";
import {
  AuthorizationTupleSchema,
  type AuthorizationTuple,
} from "../access/authorization";
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

export type BuildOnboardingPlanInput = Schema.Schema.Type<
  typeof BuildOnboardingPlanInputSchema
>;

const TenantProvisioningStatusConstantSchema = Schema.Struct({
  pending: Schema.Literal("pending"),
  provisioned: Schema.Literal("provisioned"),
  failed: Schema.Literal("failed"),
});

export const tenantProvisioningStatus = Schema.validateSync(
  TenantProvisioningStatusConstantSchema,
)({
  pending: "pending",
  provisioned: "provisioned",
  failed: "failed",
} satisfies Schema.Schema.Type<typeof TenantProvisioningStatusConstantSchema>);

export const tenantProvisioningStatuses = [
  tenantProvisioningStatus.pending,
  tenantProvisioningStatus.provisioned,
  tenantProvisioningStatus.failed,
] as const;

export const TenantProvisioningStatusSchema = Schema.Literal(
  ...tenantProvisioningStatuses,
);

export type TenantProvisioningStatus = Schema.Schema.Type<
  typeof TenantProvisioningStatusSchema
>;

const TenantProvisioningMetadataSchema = Schema.Record({
  key: Schema.NonEmptyString,
  value: Schema.Any,
});

const ProvisionTenantOwnerInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
});

export type ProvisionTenantOwnerInput = Schema.Schema.Type<
  typeof ProvisionTenantOwnerInputSchema
>;

export const TenantOwnerProvisioningSchema = Schema.Struct({
  provisioningId: Schema.NonEmptyString,
  requestContext: RequestContextSchema,
  ownerActorId: Schema.NonEmptyString,
  status: TenantProvisioningStatusSchema,
  authorizationTuples: Schema.Array(AuthorizationTupleSchema),
  metadata: TenantProvisioningMetadataSchema,
  provisionedAt: Schema.optional(Schema.NonEmptyString),
});

export type TenantOwnerProvisioning = Schema.Schema.Type<
  typeof TenantOwnerProvisioningSchema
>;

export type TenantOwnerProvisioningActorMissingError = {
  readonly _tag: "TenantOwnerProvisioningActorMissingError";
  readonly correlationId: string;
};

export const ProvisioningTenantScopeSchema = Schema.Literal(
  platformScope.organization,
  platformScope.individual,
);

export type ProvisioningTenantScope = Schema.Schema.Type<
  typeof ProvisioningTenantScopeSchema
>;

const CreateProvisioningTenantContextInputSchema = Schema.Struct({
  scope: ProvisioningTenantScopeSchema,
});

export type CreateProvisioningTenantContextInput = Schema.Schema.Type<
  typeof CreateProvisioningTenantContextInputSchema
>;

const buildProvisioningTenantContext = (scope: ProvisioningTenantScope) => {
  switch (scope) {
    case platformScope.individual: {
      const individualId = `usr_${crypto.randomUUID()}`;

      return {
        scope,
        scopeId: individualId,
        individualId,
      };
    }
    case platformScope.organization:
    default: {
      const organizationId = `org_${crypto.randomUUID()}`;

      return {
        scope,
        scopeId: organizationId,
        organizationId,
      };
    }
  }
};

export const createProvisioningTenantContext = (
  input: CreateProvisioningTenantContextInput = {
    scope: platformScope.organization,
  },
): Effect.Effect<
  Schema.Schema.Type<typeof TenantContextSchema>,
  ParseResult.ParseError,
  never
> =>
  Schema.decodeUnknown(CreateProvisioningTenantContextInputSchema)(input).pipe(
    Effect.flatMap((request) =>
      Schema.decodeUnknown(TenantContextSchema)(
        buildProvisioningTenantContext(request.scope),
      ),
    ),
  );

const IsolationAssertionInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  resourceTenant: TenantContextSchema,
});

export type IsolationAssertionInput = Schema.Schema.Type<
  typeof IsolationAssertionInputSchema
>;

export const IsolationAssertionResultSchema = Schema.Struct({
  allowed: Schema.Boolean,
  reason: Schema.NonEmptyString,
});

export type IsolationAssertionResult = Schema.Schema.Type<
  typeof IsolationAssertionResultSchema
>;

const buildProvisioningId = (
  requestContext: ProvisionTenantOwnerInput["requestContext"],
) =>
  [
    "tenant-provisioning",
    requestContext.tenant.scope,
    requestContext.tenant.scopeId,
  ].join(":");

const buildOwnerAuthorizationTuples = (
  requestContext: ProvisionTenantOwnerInput["requestContext"],
  actorId: string,
): readonly AuthorizationTuple[] => [
  {
    namespace: authorizationNamespace.tenant,
    object: requestContext.tenant.scopeId,
    relation: authorizationRelation.owner,
    subject: actorId,
    tenantScope: requestContext.tenant.scope,
    tenantScopeId: requestContext.tenant.scopeId,
  },
  {
    namespace: authorizationNamespace.tenant,
    object: requestContext.tenant.scopeId,
    relation: authorizationRelation.member,
    subject: actorId,
    tenantScope: requestContext.tenant.scope,
    tenantScopeId: requestContext.tenant.scopeId,
  },
  {
    namespace: authorizationNamespace.tenant,
    object: requestContext.tenant.scopeId,
    relation: authorizationRelation.viewer,
    subject: actorId,
    tenantScope: requestContext.tenant.scope,
    tenantScopeId: requestContext.tenant.scopeId,
  },
];

export type TenantManagementModuleService = {
  readonly buildOnboardingPlan: (
    input: BuildOnboardingPlanInput,
  ) => Effect.Effect<TenantOnboardingPlan, ParseResult.ParseError>;
  readonly provisionTenantOwner: (
    input: ProvisionTenantOwnerInput,
  ) => Effect.Effect<
    TenantOwnerProvisioning,
    ParseResult.ParseError | TenantOwnerProvisioningActorMissingError
  >;
  readonly assertTenantIsolation: (
    input: IsolationAssertionInput,
  ) => Effect.Effect<IsolationAssertionResult, ParseResult.ParseError>;
};

export class TenantManagementModule extends Context.Tag(
  "TenantManagementModule",
)<TenantManagementModule, TenantManagementModuleService>() {}

export const makeTenantManagementModule = () =>
  Effect.succeed<TenantManagementModuleService>({
    buildOnboardingPlan: (input: BuildOnboardingPlanInput) =>
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
    provisionTenantOwner: (
      input: ProvisionTenantOwnerInput,
    ): Effect.Effect<
      TenantOwnerProvisioning,
      ParseResult.ParseError | TenantOwnerProvisioningActorMissingError
    > =>
      Effect.gen(function* () {
        const request = yield* Schema.decodeUnknown(
          ProvisionTenantOwnerInputSchema,
        )(input);

        if (request.requestContext.actorId === undefined) {
          return yield* Effect.fail({
            _tag: "TenantOwnerProvisioningActorMissingError",
            correlationId: request.requestContext.correlationId,
          } satisfies TenantOwnerProvisioningActorMissingError);
        }

        return yield* Schema.decodeUnknown(TenantOwnerProvisioningSchema)({
          provisioningId: buildProvisioningId(request.requestContext),
          requestContext: request.requestContext,
          ownerActorId: request.requestContext.actorId,
          status: tenantProvisioningStatus.pending,
          authorizationTuples: buildOwnerAuthorizationTuples(
            request.requestContext,
            request.requestContext.actorId,
          ),
          metadata: {
            correlationId: request.requestContext.correlationId,
            source: "identity-session.auth-callback",
          },
          provisionedAt: new Date().toISOString(),
        });
      }),
    assertTenantIsolation: (input: IsolationAssertionInput) =>
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
