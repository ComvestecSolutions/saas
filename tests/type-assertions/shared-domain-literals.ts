import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  customDomainLifecycleState,
  identityBrandingHandoffMode,
  moduleCapability,
  onboardingStepStatus,
  permissionScope,
  platformModuleId,
  platformScope,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
  supportOperationsAuditAction,
  telemetryKind,
} from "@comvestec/contracts";
import type {
  AuditAction,
  AuthorizationNamespace,
  AuthorizationRelation,
  CustomDomainLifecycleState,
  IdentityBrandingHandoffMode,
  ModuleCapability,
  OnboardingStepStatus,
  PermissionScope,
  PlatformModuleId,
  RequestContext,
  RuntimeChangeProposalAction,
  RuntimeResolutionSource,
  TelemetryKind,
} from "@comvestec/contracts";
import type { PlatformHost } from "@comvestec/config";
import { platformHost } from "@comvestec/config";

const validStandaloneRequestContextSeed = {
  actorType: actorType.individualUser,
  actorId: "usr_1",
  sessionId: "sess_1",
  correlationId: "corr_1",
  tenant: {
    scope: platformScope.individual,
    scopeId: "usr_1",
    individualId: "usr_1",
  },
} satisfies RequestContext;

void validStandaloneRequestContextSeed;

const invalidRequestContextSeed = {
  // @ts-expect-error request contexts must use shared actor type literals
  actorType: "not-an-actor",
  correlationId: "corr_invalid",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} satisfies RequestContext;

void invalidRequestContextSeed;

const validAuthorizationNamespaceSeed =
  authorizationNamespace.featureFlag satisfies AuthorizationNamespace;

void validAuthorizationNamespaceSeed;

const invalidAuthorizationNamespaceSeed =
  // @ts-expect-error authorization namespaces must use shared literals
  "feature" satisfies AuthorizationNamespace;

void invalidAuthorizationNamespaceSeed;

const validAuthorizationRelationSeed =
  authorizationRelation.impersonator satisfies AuthorizationRelation;

void validAuthorizationRelationSeed;

const invalidAuthorizationRelationSeed =
  // @ts-expect-error authorization relations must use shared literals
  "operator" satisfies AuthorizationRelation;

void invalidAuthorizationRelationSeed;

const validOnboardingStepStatusSeed =
  onboardingStepStatus.inProgress satisfies OnboardingStepStatus;

void validOnboardingStepStatusSeed;

const invalidOnboardingStepStatusSeed =
  // @ts-expect-error onboarding step statuses must use shared literals
  "pending" satisfies OnboardingStepStatus;

void invalidOnboardingStepStatusSeed;

const validIdentityBrandingHandoffModeSeed =
  identityBrandingHandoffMode.brandedRedirect satisfies IdentityBrandingHandoffMode;

void validIdentityBrandingHandoffModeSeed;

const invalidIdentityBrandingHandoffModeSeed =
  // @ts-expect-error identity handoff modes must use shared literals
  "embedded" satisfies IdentityBrandingHandoffMode;

void invalidIdentityBrandingHandoffModeSeed;

const validRuntimeResolutionSourceSeed =
  runtimeResolutionSource.entitlement satisfies RuntimeResolutionSource;

void validRuntimeResolutionSourceSeed;

const validRuntimeRolloutResolutionSourceSeed =
  runtimeResolutionSource.rollout satisfies RuntimeResolutionSource;

void validRuntimeRolloutResolutionSourceSeed;

const invalidRuntimeResolutionSourceSeed =
  // @ts-expect-error runtime resolution sources must use shared literals
  "not-a-source" satisfies RuntimeResolutionSource;

void invalidRuntimeResolutionSourceSeed;

const validCustomDomainLifecycleStateSeed =
  customDomainLifecycleState.active satisfies CustomDomainLifecycleState;

void validCustomDomainLifecycleStateSeed;

const invalidCustomDomainLifecycleStateSeed =
  // @ts-expect-error custom domain lifecycle states must use shared literals
  "pending" satisfies CustomDomainLifecycleState;

void invalidCustomDomainLifecycleStateSeed;

const validTelemetryKindSeed = telemetryKind.audit satisfies TelemetryKind;

void validTelemetryKindSeed;

const invalidTelemetryKindSeed =
  // @ts-expect-error telemetry kinds must use shared literals
  "span" satisfies TelemetryKind;

void invalidTelemetryKindSeed;

const validAuditActionSeed =
  supportOperationsAuditAction.breakGlassStarted satisfies AuditAction;

void validAuditActionSeed;

const validImpersonationAuditActionSeed =
  supportOperationsAuditAction.impersonationStarted satisfies AuditAction;

void validImpersonationAuditActionSeed;

const invalidAuditActionSeed =
  // @ts-expect-error audit actions must use shared literals
  "support.break-glass" satisfies AuditAction;

void invalidAuditActionSeed;

const validRuntimeChangeProposalActionSeed =
  runtimeChangeProposalAction.rename satisfies RuntimeChangeProposalAction;

void validRuntimeChangeProposalActionSeed;

const invalidRuntimeChangeProposalActionSeed =
  // @ts-expect-error runtime change proposal actions must use shared literals
  "delete" satisfies RuntimeChangeProposalAction;

void invalidRuntimeChangeProposalActionSeed;

const validPlatformModuleIdSeed =
  platformModuleId.tenantBranding satisfies PlatformModuleId;

void validPlatformModuleIdSeed;

const invalidPlatformModuleIdSeed =
  // @ts-expect-error platform module ids must use shared literals
  "tenant_branding" satisfies PlatformModuleId;

void invalidPlatformModuleIdSeed;

const validPermissionScopeSeed =
  permissionScope.brandingManage satisfies PermissionScope;

void validPermissionScopeSeed;

const invalidPermissionScopeSeed =
  // @ts-expect-error permission scopes must use shared literals
  "branding.manage" satisfies PermissionScope;

void invalidPermissionScopeSeed;

const validModuleCapabilitySeed =
  moduleCapability.brandedRedirectHandoff satisfies ModuleCapability;

void validModuleCapabilitySeed;

const invalidModuleCapabilitySeed =
  // @ts-expect-error module capabilities must use shared literals
  "direct-write" satisfies ModuleCapability;

void invalidModuleCapabilitySeed;

const validPlatformHostSeed =
  platformHost.localDevelopment satisfies PlatformHost;

void validPlatformHostSeed;

const invalidPlatformHostSeed =
  // @ts-expect-error platform hosts must use shared literals
  "localhost" satisfies PlatformHost;

void invalidPlatformHostSeed;

export {};
