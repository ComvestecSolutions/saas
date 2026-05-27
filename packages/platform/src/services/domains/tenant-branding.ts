import {
  configDefaultValue,
  findModuleManifest,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import { and, desc, eq, ne } from "drizzle-orm";
import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  customDomainLifecycleState,
  dataClassification,
  type CustomDomainVerificationAdminView,
  type CustomDomainVerificationRecord,
  CustomDomainVerificationAdminViewSchema,
  managedFileUsage,
  runtimeResolutionSource,
  type TenantBrandingSupportSafeView,
  type TenantBrandingAssetKind,
  tenantBrandingAssetKind,
  type TenantBrandingPublishedAssetReferenceView,
  TenantBrandingPublishedAssetReferenceViewSchema,
  TenantBrandingSupportSafeViewSchema,
  type Entitlement,
  permissionScope,
  platformModuleId,
  platformScope,
  type RequestContext,
  type RequestCustomDomainVerificationInput,
  RequestCustomDomainVerificationInputSchema,
  tenantBrandingAuditAction,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleError,
  type AuthorizationDelegatedCheckError,
  type AuthorizationModuleService,
  type BillingStatePostgresRepositoryError,
  BillingStatePostgresRepository,
  FileStorageModule,
  type FileStorageModuleError,
  hasPrivilegedBreakGlassAccess,
  IdentitySessionModule,
  type IdentitySessionModuleError,
  type IdentitySessionRequestContextNotFoundError,
  makeAuthorizationModule,
  makeFileStorageModule,
  makeTenantBrandingDomainVerificationPostgresRepository,
  makeTenantBrandingModule,
  RetentionLegalHoldModule,
  type UnknownConfigKeyError,
  type RuntimeConfigModulePersistenceError,
  RuntimeConfigModule,
  type TenantBrandingDomainVerificationAlreadyExistsError,
  type TenantBrandingDomainVerificationPostgresRepositoryQueryError,
  type TenantBrandingDomainVerificationRepositoryNotConfiguredError,
  TenantBrandingModule,
  tenantBrandingDomainVerificationTable,
} from "@comvestec/modules";
import {
  ConvexFileStorageAdapter,
  makeConvexFileStorageAdapter,
  makePostgresAdapter,
  OryKetoAdapter,
  type PostgresAdapterService,
  type ValkeyAdapterOperationError,
} from "../../adapters";
import {
  createOryKetoAuthorizationDelegatedCheck,
  createOryKetoAuthorizationDelegatedTupleLookup,
} from "../access";
import {
  makeSubscriberJourneyRuntime,
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment,
} from "./subscriber-journey";

export const TenantBrandingSessionLookupSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
});

export type TenantBrandingSessionLookup = Schema.Schema.Type<
  typeof TenantBrandingSessionLookupSchema
>;

export const RequestCustomDomainVerificationBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    scope: RequestCustomDomainVerificationInputSchema.fields.scope,
    scopeId: Schema.NonEmptyString,
    requestedHost:
      RequestCustomDomainVerificationInputSchema.fields.requestedHost,
  });

export type RequestCustomDomainVerificationBySessionRequest =
  Schema.Schema.Type<
    typeof RequestCustomDomainVerificationBySessionRequestSchema
  >;

export const GetCustomDomainVerificationBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: RequestCustomDomainVerificationInputSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
  requestedHost:
    RequestCustomDomainVerificationInputSchema.fields.requestedHost,
});

export type GetCustomDomainVerificationBySessionRequest = Schema.Schema.Type<
  typeof GetCustomDomainVerificationBySessionRequestSchema
>;

export const GetTenantBrandingSupportSafeViewBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    scope: RequestCustomDomainVerificationInputSchema.fields.scope,
    scopeId: Schema.NonEmptyString,
  });

export type GetTenantBrandingSupportSafeViewBySessionRequest =
  Schema.Schema.Type<
    typeof GetTenantBrandingSupportSafeViewBySessionRequestSchema
  >;

export const PublishTenantBrandingAssetBySessionRequestSchema = Schema.Struct({
  sessionId: Schema.NonEmptyString,
  scope: TenantBrandingPublishedAssetReferenceViewSchema.fields.scope,
  scopeId: Schema.NonEmptyString,
  assetKind: TenantBrandingPublishedAssetReferenceViewSchema.fields.assetKind,
  fileId: TenantBrandingPublishedAssetReferenceViewSchema.fields.fileId,
});

export type PublishTenantBrandingAssetBySessionRequest = Schema.Schema.Type<
  typeof PublishTenantBrandingAssetBySessionRequestSchema
>;

export const TransitionCustomDomainVerificationBySessionRequestSchema =
  Schema.Struct({
    sessionId: Schema.NonEmptyString,
    scope: RequestCustomDomainVerificationInputSchema.fields.scope,
    scopeId: Schema.NonEmptyString,
    lifecycleState: Schema.Literal(
      customDomainLifecycleState.verifying,
      customDomainLifecycleState.active,
      customDomainLifecycleState.error,
      customDomainLifecycleState.retired,
    ),
    approvalNotes: Schema.optional(Schema.NonEmptyString),
  });

export type TransitionCustomDomainVerificationBySessionRequest =
  Schema.Schema.Type<
    typeof TransitionCustomDomainVerificationBySessionRequestSchema
  >;

export type TenantBrandingUnauthenticatedActorError = {
  readonly _tag: "TenantBrandingUnauthenticatedActorError";
};

export type TenantBrandingDeclarationMissingError = {
  readonly _tag: "TenantBrandingDeclarationMissingError";
  readonly moduleId: typeof platformModuleId.tenantBranding;
  readonly key:
    | typeof tenantBrandingFeatureFlag.enabled
    | typeof tenantBrandingFeatureFlag.customDomain;
};

export type TenantBrandingFeatureDisabledError = {
  readonly _tag: "TenantBrandingFeatureDisabledError";
  readonly scope: TenantBrandingPublishedAssetReferenceView["scope"];
  readonly scopeId: string;
  readonly key:
    | typeof tenantBrandingFeatureFlag.enabled
    | typeof tenantBrandingFeatureFlag.customDomain;
};

export type TenantBrandingAccessDeniedError = {
  readonly _tag: "TenantBrandingAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type TenantBrandingCustomDomainVerificationNotFoundError = {
  readonly _tag: "TenantBrandingCustomDomainVerificationNotFoundError";
  readonly scope: RequestCustomDomainVerificationInput["scope"];
  readonly scopeId: string;
};

export type TenantBrandingCustomDomainApprovalNotesRequiredError = {
  readonly _tag: "TenantBrandingCustomDomainApprovalNotesRequiredError";
  readonly scope: RequestCustomDomainVerificationInput["scope"];
  readonly scopeId: string;
};

export type TenantBrandingManagedAssetNotFoundError = {
  readonly _tag: "TenantBrandingManagedAssetNotFoundError";
  readonly scope: TenantBrandingPublishedAssetReferenceView["scope"];
  readonly scopeId: string;
  readonly assetKind: TenantBrandingAssetKind;
  readonly fileId: string;
};

export type TenantBrandingManagedAssetLookupError = {
  readonly _tag: "TenantBrandingManagedAssetLookupError";
  readonly operation: "getManagedFileRecord";
  readonly cause: Exclude<FileStorageModuleError, ParseResult.ParseError>;
};

export type TenantBrandingManagedAssetInvalidError = {
  readonly _tag: "TenantBrandingManagedAssetInvalidError";
  readonly scope: TenantBrandingPublishedAssetReferenceView["scope"];
  readonly scopeId: string;
  readonly assetKind: TenantBrandingAssetKind;
  readonly fileId: string;
};

export type TenantBrandingInternalContractError = {
  readonly _tag: "TenantBrandingInternalContractError";
  readonly operation:
    | "authorizationCheck"
    | "auditLogAppend"
    | "tenantBrandingAdminView"
    | "tenantBrandingManagedAssetLookup"
    | "tenantBrandingModuleRequest";
  readonly cause: ParseResult.ParseError;
};

export type TenantBrandingRuntimeError = {
  readonly _tag: "TenantBrandingRuntimeError";
  readonly cause: unknown;
};

export type TenantBrandingServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | AuthorizationDelegatedCheckError
  | BillingStatePostgresRepositoryError
  | IdentitySessionModuleError
  | RuntimeConfigModulePersistenceError
  | UnknownConfigKeyError
  | TenantBrandingDeclarationMissingError
  | TenantBrandingCustomDomainApprovalNotesRequiredError
  | TenantBrandingCustomDomainVerificationNotFoundError
  | TenantBrandingDomainVerificationAlreadyExistsError
  | TenantBrandingDomainVerificationPostgresRepositoryQueryError
  | TenantBrandingDomainVerificationRepositoryNotConfiguredError
  | TenantBrandingFeatureDisabledError
  | TenantBrandingInternalContractError
  | TenantBrandingManagedAssetInvalidError
  | TenantBrandingManagedAssetLookupError
  | TenantBrandingManagedAssetNotFoundError
  | TenantBrandingUnauthenticatedActorError
  | TenantBrandingAccessDeniedError;

export type TenantBrandingServiceOptions = {
  readonly authorization?: Pick<AuthorizationModuleService, "check">;
};

export type TenantBrandingService = {
  readonly resolveRequestContext: (
    input: TenantBrandingSessionLookup,
  ) => Effect.Effect<
    RequestContext,
    | ParseResult.ParseError
    | IdentitySessionRequestContextNotFoundError
    | ValkeyAdapterOperationError
  >;
  readonly requestCustomDomainVerification: (
    input: RequestCustomDomainVerificationBySessionRequest,
  ) => Effect.Effect<
    CustomDomainVerificationAdminView,
    TenantBrandingServiceError
  >;
  readonly getCustomDomainVerification: (
    input: GetCustomDomainVerificationBySessionRequest,
  ) => Effect.Effect<
    CustomDomainVerificationRecord,
    TenantBrandingServiceError
  >;
  readonly getSupportSafeView: (
    input: GetTenantBrandingSupportSafeViewBySessionRequest,
  ) => Effect.Effect<TenantBrandingSupportSafeView, TenantBrandingServiceError>;
  readonly publishAssetReference: (
    input: PublishTenantBrandingAssetBySessionRequest,
  ) => Effect.Effect<
    TenantBrandingPublishedAssetReferenceView,
    TenantBrandingServiceError
  >;
  readonly transitionCurrentCustomDomainVerification: (
    input: TransitionCustomDomainVerificationBySessionRequest,
  ) => Effect.Effect<
    CustomDomainVerificationAdminView,
    TenantBrandingServiceError
  >;
};

type AuthenticatedTenantBrandingOperatorContext = RequestContext & {
  readonly actorId: string;
};

type TenantBrandingTarget = Pick<
  TenantBrandingPublishedAssetReferenceView,
  "scope" | "scopeId"
>;

const decodeBoolean = Schema.decodeUnknown(Schema.Boolean);

const platformScopeSpecificityRank = (
  scope: RequestContext["tenant"]["scope"],
) => {
  switch (scope) {
    case platformScope.organization:
      return 1;
    case platformScope.enterprise:
      return 2;
    case platformScope.platform:
      return 3;
    case platformScope.individual:
      return 4;
  }
};

const resolveTenantBrandingEffectiveScope = (
  scopes: readonly (RequestContext["tenant"]["scope"] | undefined)[],
) =>
  scopes.reduce<RequestContext["tenant"]["scope"]>(
    (selectedScope, scope) =>
      scope !== undefined &&
      platformScopeSpecificityRank(scope) <
        platformScopeSpecificityRank(selectedScope)
        ? scope
        : selectedScope,
    platformScope.platform,
  );

const isMaterializedBrandingValue = (value: unknown) =>
  value !== null && value !== configDefaultValue.inherit;

const resolveLatestChangedAt = (
  timestamps: readonly (string | undefined)[],
) => {
  const materializedTimestamps = timestamps.filter(
    (timestamp): timestamp is string => timestamp !== undefined,
  );

  if (materializedTimestamps.length === 0) {
    return undefined;
  }

  return [...materializedTimestamps].sort().at(-1);
};

const createInternalContractError =
  (operation: TenantBrandingInternalContractError["operation"]) =>
  (cause: ParseResult.ParseError): TenantBrandingInternalContractError => ({
    _tag: "TenantBrandingInternalContractError",
    operation,
    cause,
  });

const normalizeAuthorizationCheckError = (
  error: ParseResult.ParseError | AuthorizationDelegatedCheckError,
): AuthorizationDelegatedCheckError | TenantBrandingInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("authorizationCheck")(error)
    : error;

const normalizeAuditLogError = (
  error: AuditLogModuleError,
): AuditLogModuleError | TenantBrandingInternalContractError =>
  error._tag === "ParseError"
    ? createInternalContractError("auditLogAppend")(error)
    : error;

const normalizeTenantBrandingModuleError = (
  error:
    | ParseResult.ParseError
    | TenantBrandingDomainVerificationAlreadyExistsError
    | TenantBrandingDomainVerificationPostgresRepositoryQueryError
    | TenantBrandingDomainVerificationRepositoryNotConfiguredError,
) =>
  error._tag === "ParseError"
    ? createInternalContractError("tenantBrandingModuleRequest")(error)
    : error;

const normalizeFileStorageModuleError = (
  error: FileStorageModuleError,
):
  | TenantBrandingInternalContractError
  | TenantBrandingManagedAssetLookupError =>
  error._tag === "ParseError"
    ? createInternalContractError("tenantBrandingManagedAssetLookup")(error)
    : {
        _tag: "TenantBrandingManagedAssetLookupError",
        operation: "getManagedFileRecord",
        cause: error,
      };

const ensureTenantBrandingOperatorAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  AuthenticatedTenantBrandingOperatorContext,
  TenantBrandingUnauthenticatedActorError | TenantBrandingAccessDeniedError
> =>
  Effect.fromNullable(requestContext.actorId).pipe(
    Effect.map((actorId) => ({
      ...requestContext,
      actorId,
    })),
    Effect.mapError(
      (): TenantBrandingUnauthenticatedActorError => ({
        _tag: "TenantBrandingUnauthenticatedActorError",
      }),
    ),
    Effect.flatMap((authenticatedRequestContext) =>
      authenticatedRequestContext.actorType === actorType.platformOperator ||
      authenticatedRequestContext.actorType === actorType.supportOperator
        ? Effect.succeed(authenticatedRequestContext)
        : Effect.fail({
            _tag: "TenantBrandingAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies TenantBrandingAccessDeniedError),
    ),
  );

const requestTargetsCurrentTenant = (
  requestContext: RequestContext,
  target: TenantBrandingTarget,
) =>
  requestContext.tenant.scope === target.scope &&
  requestContext.tenant.scopeId === target.scopeId;

const resolveInheritedEnterpriseId = (tenant: RequestContext["tenant"]) =>
  tenant.enterpriseId ??
  (tenant.scope === platformScope.enterprise ? tenant.scopeId : undefined);

const buildTargetTenantContext = (
  target: TenantBrandingTarget,
  sourceTenant: RequestContext["tenant"],
): RequestContext["tenant"] => ({
  scope: target.scope,
  scopeId: target.scopeId,
  ...(target.scope === platformScope.enterprise
    ? { enterpriseId: target.scopeId }
    : {}),
  ...(target.scope === platformScope.organization
    ? {
        organizationId: target.scopeId,
        ...(resolveInheritedEnterpriseId(sourceTenant) === undefined
          ? {}
          : { enterpriseId: resolveInheritedEnterpriseId(sourceTenant) }),
      }
    : {}),
});

const buildTenantBrandingAuthorizationObject = (target: TenantBrandingTarget) =>
  `${platformModuleId.tenantBranding}:${target.scope}:${target.scopeId}`;

const requireTenantBrandingFeatureFlag = (
  key:
    | typeof tenantBrandingFeatureFlag.enabled
    | typeof tenantBrandingFeatureFlag.customDomain,
) =>
  Effect.fromNullable(
    findModuleManifest(platformModuleId.tenantBranding)?.featureFlags.find(
      (candidate) => candidate.key === key,
    ),
  ).pipe(
    Effect.orElseFail(
      (): TenantBrandingDeclarationMissingError => ({
        _tag: "TenantBrandingDeclarationMissingError",
        moduleId: platformModuleId.tenantBranding,
        key,
      }),
    ),
  );

const resolveTenantBrandingFeatureFlagState = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
  readonly key:
    | typeof tenantBrandingFeatureFlag.enabled
    | typeof tenantBrandingFeatureFlag.customDomain;
  readonly entitlements: readonly Entitlement[];
}) =>
  Effect.gen(function* () {
    const flag = yield* requireTenantBrandingFeatureFlag(input.key);
    const overrides = yield* input.runtimeConfig.listOverridesByModule(
      platformModuleId.tenantBranding,
    );

    return yield* input.runtimeConfig.resolveFeatureFlag({
      requestContext: input.requestContext,
      moduleId: platformModuleId.tenantBranding,
      flag,
      overrides,
      entitlements: input.entitlements,
    });
  });

const ensureTenantBrandingEnabled = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
  readonly target: TenantBrandingTarget;
  readonly entitlements: readonly Entitlement[];
}) =>
  Effect.gen(function* () {
    const tenantBrandingEnabled = yield* resolveTenantBrandingFeatureFlagState({
      runtimeConfig: input.runtimeConfig,
      requestContext: input.requestContext,
      key: tenantBrandingFeatureFlag.enabled,
      entitlements: input.entitlements,
    }).pipe(
      Effect.flatMap((resolution) => decodeBoolean(resolution.effectiveValue)),
    );

    if (!tenantBrandingEnabled) {
      return yield* Effect.fail({
        _tag: "TenantBrandingFeatureDisabledError",
        scope: input.target.scope,
        scopeId: input.target.scopeId,
        key: tenantBrandingFeatureFlag.enabled,
      } satisfies TenantBrandingFeatureDisabledError);
    }

    return true as const;
  });

const ensureTenantBrandingCustomDomainEnabled = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly requestContext: RequestContext;
  readonly target: TenantBrandingTarget;
  readonly entitlements: readonly Entitlement[];
}) =>
  Effect.gen(function* () {
    yield* ensureTenantBrandingEnabled(input);

    const customDomainEnabled = yield* resolveTenantBrandingFeatureFlagState({
      runtimeConfig: input.runtimeConfig,
      requestContext: input.requestContext,
      key: tenantBrandingFeatureFlag.customDomain,
      entitlements: input.entitlements,
    }).pipe(
      Effect.flatMap((resolution) => decodeBoolean(resolution.effectiveValue)),
    );

    if (!customDomainEnabled) {
      return yield* Effect.fail({
        _tag: "TenantBrandingFeatureDisabledError",
        scope: input.target.scope,
        scopeId: input.target.scopeId,
        key: tenantBrandingFeatureFlag.customDomain,
      } satisfies TenantBrandingFeatureDisabledError);
    }

    return true as const;
  });

const authorizeTenantBrandingOperatorAccess = (input: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
  readonly requestContext: RequestContext;
  readonly target: TenantBrandingTarget;
}) =>
  Effect.gen(function* () {
    const authenticatedRequestContext =
      yield* ensureTenantBrandingOperatorAccess(input.requestContext);
    const authorizationRequestContext = requestTargetsCurrentTenant(
      authenticatedRequestContext,
      input.target,
    )
      ? authenticatedRequestContext
      : hasPrivilegedBreakGlassAccess(authenticatedRequestContext)
        ? {
            ...authenticatedRequestContext,
            tenant: buildTargetTenantContext(
              input.target,
              authenticatedRequestContext.tenant,
            ),
          }
        : yield* Effect.fail({
            _tag: "TenantBrandingAccessDeniedError",
            actorType: authenticatedRequestContext.actorType,
          } satisfies TenantBrandingAccessDeniedError);
    const decision = yield* input.authorization
      .check({
        requestContext: authorizationRequestContext,
        namespace: authorizationNamespace.brandingProfile,
        object: buildTenantBrandingAuthorizationObject(input.target),
        relation: authorizationRelation.admin,
        permissionScope: permissionScope.brandingManage,
      })
      .pipe(Effect.mapError(normalizeAuthorizationCheckError));

    return decision.allowed
      ? authorizationRequestContext
      : yield* Effect.fail({
          _tag: "TenantBrandingAccessDeniedError",
          actorType: authenticatedRequestContext.actorType,
        } satisfies TenantBrandingAccessDeniedError);
  });

const buildCustomDomainVerificationAdminView = (input: {
  readonly verificationId: string;
  readonly scope: RequestCustomDomainVerificationInput["scope"];
  readonly scopeId: string;
  readonly requestedHost: string;
  readonly lifecycleState: CustomDomainVerificationAdminView["lifecycleState"];
  readonly changedAt: string;
}) =>
  Schema.decodeUnknown(CustomDomainVerificationAdminViewSchema)(input).pipe(
    Effect.mapError(createInternalContractError("tenantBrandingAdminView")),
  );

const buildTenantBrandingSupportSafeView = (input: {
  readonly scope: RequestCustomDomainVerificationInput["scope"];
  readonly scopeId: string;
  readonly companyName: string;
  readonly customDomainStatus: TenantBrandingSupportSafeView["customDomainStatus"];
  readonly effectiveScope: TenantBrandingSupportSafeView["effectiveScope"];
  readonly changedAt?: string;
}) =>
  Schema.decodeUnknown(TenantBrandingSupportSafeViewSchema)(input).pipe(
    Effect.mapError(createInternalContractError("tenantBrandingAdminView")),
  );

const buildTenantBrandingPublishedAssetReferenceView = (input: {
  readonly scope: TenantBrandingPublishedAssetReferenceView["scope"];
  readonly scopeId: string;
  readonly assetKind: TenantBrandingPublishedAssetReferenceView["assetKind"];
  readonly fileId: string;
  readonly changedAt: string;
}) =>
  Schema.decodeUnknown(TenantBrandingPublishedAssetReferenceViewSchema)(
    input,
  ).pipe(
    Effect.mapError(createInternalContractError("tenantBrandingAdminView")),
  );

const resolveSupportSafeCompanyName = (input: {
  readonly runtimeConfig: RuntimeConfigModule["Type"];
  readonly tenantBranding: TenantBrandingModule["Type"];
  readonly requestContext: RequestContext;
  readonly entitlements: readonly Entitlement[];
}) =>
  Effect.gen(function* () {
    const overrides = yield* input.runtimeConfig.listOverridesByModule(
      platformModuleId.tenantBranding,
    );
    const resolution = yield* input.runtimeConfig.resolveConfigValue({
      requestContext: input.requestContext,
      moduleId: platformModuleId.tenantBranding,
      key: tenantBrandingConfigKey.companyName,
      overrides,
      entitlements: input.entitlements,
    });
    const companyNameChangedAt = overrides.find(
      (override) =>
        override.key === tenantBrandingConfigKey.companyName &&
        override.scope === resolution.resolvedScope &&
        override.scopeId === resolution.resolvedScopeId,
    )?.changedAt;
    const branding = yield* input.tenantBranding.resolveBranding({
      requestContext: input.requestContext,
      entitled: resolution.entitled,
      values: isMaterializedBrandingValue(resolution.effectiveValue)
        ? {
            [tenantBrandingConfigKey.companyName]: resolution.effectiveValue,
          }
        : {},
    });

    return {
      companyName: branding.publicProjection.companyName,
      resolvedScope: resolution.resolvedScope,
      changedAt: companyNameChangedAt,
    } as const;
  });

const buildTenantBrandingCustomDomainAuditTarget = (input: {
  readonly verificationId: string;
  readonly scope: RequestCustomDomainVerificationInput["scope"];
  readonly scopeId: string;
}) =>
  `${platformModuleId.tenantBranding}:${input.scope}:${input.scopeId}:custom-domain:${input.verificationId}`;

const buildTenantBrandingAssetAuditTarget = (input: {
  readonly scope: TenantBrandingPublishedAssetReferenceView["scope"];
  readonly scopeId: string;
  readonly assetKind: TenantBrandingAssetKind;
}) =>
  `${platformModuleId.tenantBranding}:${input.scope}:${input.scopeId}:asset:${input.assetKind}`;

const resolveTenantBrandingAssetConfigKey = (
  assetKind: TenantBrandingAssetKind,
) => {
  switch (assetKind) {
    case tenantBrandingAssetKind.logo:
      return tenantBrandingConfigKey.logoAssetId;
    case tenantBrandingAssetKind.favicon:
      return tenantBrandingConfigKey.faviconAssetId;
  }
};

const appendTenantBrandingCustomDomainAudit = (input: {
  readonly auditLog: AuditLogModule["Type"];
  readonly requestContext: RequestContext;
  readonly verification: Pick<
    CustomDomainVerificationAdminView,
    "verificationId" | "scope" | "scopeId" | "requestedHost"
  >;
}) =>
  input.auditLog
    .append({
      requestContext: input.requestContext,
      moduleId: platformModuleId.tenantBranding,
      action: tenantBrandingAuditAction.customDomainRequested,
      target: buildTenantBrandingCustomDomainAuditTarget(input.verification),
      reason: `Requested tenant custom-domain verification for ${input.verification.requestedHost}.`,
    })
    .pipe(Effect.mapError(normalizeAuditLogError));

const appendTenantBrandingCustomDomainLifecycleAudit = (input: {
  readonly auditLog: AuditLogModule["Type"];
  readonly lifecycleState: TransitionCustomDomainVerificationBySessionRequest["lifecycleState"];
  readonly requestContext: RequestContext;
  readonly verification: Pick<
    CustomDomainVerificationRecord,
    "verificationId" | "scope" | "scopeId" | "requestedHost"
  >;
}) =>
  input.auditLog
    .append({
      requestContext: input.requestContext,
      moduleId: platformModuleId.tenantBranding,
      action: tenantBrandingAuditAction.customDomainLifecycleUpdated,
      target: buildTenantBrandingCustomDomainAuditTarget(input.verification),
      reason: `Updated tenant custom-domain verification for ${input.verification.requestedHost} to ${input.lifecycleState}.`,
    })
    .pipe(Effect.mapError(normalizeAuditLogError));

const appendTenantBrandingAssetPublicationAudit = (input: {
  readonly auditLog: AuditLogModule["Type"];
  readonly requestContext: RequestContext;
  readonly scope: TenantBrandingPublishedAssetReferenceView["scope"];
  readonly scopeId: string;
  readonly assetKind: TenantBrandingAssetKind;
  readonly fileId: string;
}) =>
  input.auditLog
    .append({
      requestContext: input.requestContext,
      moduleId: platformModuleId.tenantBranding,
      action: tenantBrandingAuditAction.assetPublished,
      target: buildTenantBrandingAssetAuditTarget({
        scope: input.scope,
        scopeId: input.scopeId,
        assetKind: input.assetKind,
      }),
      reason: `Published tenant ${input.assetKind} branding asset ${input.fileId}.`,
    })
    .pipe(Effect.mapError(normalizeAuditLogError), Effect.asVoid);

const appendTenantBrandingAssetPublicationAuditAfterCommit = (input: {
  readonly auditLog: AuditLogModule["Type"];
  readonly requestContext: RequestContext;
  readonly scope: TenantBrandingPublishedAssetReferenceView["scope"];
  readonly scopeId: string;
  readonly assetKind: TenantBrandingAssetKind;
  readonly fileId: string;
}) =>
  appendTenantBrandingAssetPublicationAudit(input).pipe(
    Effect.catchAll(() => Effect.void),
  );

const resolvePublishedManagedAsset = (input: {
  readonly fileStorage: FileStorageModule["Type"];
  readonly target: TenantBrandingTarget;
  readonly assetKind: TenantBrandingAssetKind;
  readonly fileId: string;
}) =>
  input.fileStorage
    .getManagedFileRecord({
      fileId: input.fileId,
    })
    .pipe(
      Effect.mapError((error) =>
        error._tag === "FileStorageFileNotFoundError"
          ? ({
              _tag: "TenantBrandingManagedAssetNotFoundError",
              scope: input.target.scope,
              scopeId: input.target.scopeId,
              assetKind: input.assetKind,
              fileId: input.fileId,
            } satisfies TenantBrandingManagedAssetNotFoundError)
          : normalizeFileStorageModuleError(error),
      ),
      Effect.flatMap((record) =>
        record.scope !== input.target.scope ||
        record.scopeId !== input.target.scopeId
          ? Effect.fail({
              _tag: "TenantBrandingManagedAssetNotFoundError",
              scope: input.target.scope,
              scopeId: input.target.scopeId,
              assetKind: input.assetKind,
              fileId: input.fileId,
            } satisfies TenantBrandingManagedAssetNotFoundError)
          : Effect.succeed(record),
      ),
      Effect.flatMap((record) =>
        record.usage !== managedFileUsage.brandingAsset ||
        record.classification !== dataClassification.public
          ? Effect.fail({
              _tag: "TenantBrandingManagedAssetInvalidError",
              scope: input.target.scope,
              scopeId: input.target.scopeId,
              assetKind: input.assetKind,
              fileId: input.fileId,
            } satisfies TenantBrandingManagedAssetInvalidError)
          : Effect.succeed(record),
      ),
    );

const hasTenantBrandingCustomDomainAudit = (input: {
  readonly auditLog: AuditLogModule["Type"];
  readonly verification: Pick<
    CustomDomainVerificationAdminView,
    "verificationId" | "scope" | "scopeId"
  >;
}) =>
  input.auditLog
    .queryByTarget({
      moduleId: platformModuleId.tenantBranding,
      target: buildTenantBrandingCustomDomainAuditTarget(input.verification),
    })
    .pipe(
      Effect.mapError(normalizeAuditLogError),
      Effect.map((events) =>
        events.some(
          (event) =>
            event.action === tenantBrandingAuditAction.customDomainRequested,
        ),
      ),
    );

const requestTenantBrandingCustomDomainVerification = (input: {
  readonly auditLog: AuditLogModule["Type"];
  readonly requestContext: RequestContext;
  readonly tenantBranding: TenantBrandingModule["Type"];
  readonly request: RequestCustomDomainVerificationInput;
}): Effect.Effect<CustomDomainVerificationRecord, TenantBrandingServiceError> =>
  Effect.gen(function* () {
    const createAttempt = yield* Effect.either(
      input.tenantBranding
        .requestCustomDomainVerification(input.request)
        .pipe(Effect.mapError(normalizeTenantBrandingModuleError)),
    );

    if (createAttempt._tag === "Right") {
      yield* appendTenantBrandingCustomDomainAudit({
        auditLog: input.auditLog,
        requestContext: input.requestContext,
        verification: createAttempt.right,
      });

      return createAttempt.right;
    }

    if (
      createAttempt.left._tag !==
      "TenantBrandingDomainVerificationAlreadyExistsError"
    ) {
      return yield* Effect.fail(createAttempt.left);
    }

    const existingVerification = yield* input.tenantBranding
      .findCustomDomainVerification({
        scope: input.request.scope,
        scopeId: input.request.scopeId,
        requestedHost: input.request.requestedHost,
      })
      .pipe(
        Effect.mapError(normalizeTenantBrandingModuleError),
        Effect.flatMap((existing) =>
          Effect.fromNullable(existing).pipe(
            Effect.orElseFail(
              () =>
                ({
                  _tag: "TenantBrandingDomainVerificationAlreadyExistsError",
                  scope: input.request.scope,
                  scopeId: input.request.scopeId,
                  requestedHost: input.request.requestedHost,
                }) satisfies TenantBrandingDomainVerificationAlreadyExistsError,
            ),
          ),
        ),
        Effect.flatMap((existing) =>
          existing.lifecycleState === customDomainLifecycleState.retired
            ? Effect.fail({
                _tag: "TenantBrandingDomainVerificationAlreadyExistsError",
                scope: input.request.scope,
                scopeId: input.request.scopeId,
                requestedHost: input.request.requestedHost,
              } satisfies TenantBrandingDomainVerificationAlreadyExistsError)
            : Effect.succeed(existing),
        ),
      );

    const hasAudit = yield* hasTenantBrandingCustomDomainAudit({
      auditLog: input.auditLog,
      verification: existingVerification,
    });

    if (!hasAudit) {
      yield* appendTenantBrandingCustomDomainAudit({
        auditLog: input.auditLog,
        requestContext: input.requestContext,
        verification: existingVerification,
      });
    }

    return existingVerification;
  });

const buildTenantBrandingService = (
  authorization: Pick<AuthorizationModuleService, "check">,
) =>
  Effect.gen(function* () {
    const auditLog = yield* AuditLogModule;
    const billingState = yield* BillingStatePostgresRepository;
    const fileStorage = yield* FileStorageModule;
    const identitySession = yield* IdentitySessionModule;
    const runtimeConfig = yield* RuntimeConfigModule;
    const tenantBranding = yield* TenantBrandingModule;

    return {
      resolveRequestContext: (input: TenantBrandingSessionLookup) =>
        Schema.decodeUnknown(TenantBrandingSessionLookupSchema)(input).pipe(
          Effect.flatMap((request) =>
            identitySession.resolveRequestContext({
              sessionId: request.sessionId,
            }),
          ),
        ),
      requestCustomDomainVerification: (
        input: RequestCustomDomainVerificationBySessionRequest,
      ): Effect.Effect<
        CustomDomainVerificationAdminView,
        TenantBrandingServiceError
      > =>
        Schema.decodeUnknown(
          RequestCustomDomainVerificationBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({
                  sessionId: request.sessionId,
                })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeTenantBrandingOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const tenantAccessState =
                yield* billingState.getTenantAccessState(
                  authorizedRequestContext.tenant,
                );

              yield* ensureTenantBrandingCustomDomainEnabled({
                runtimeConfig,
                requestContext: authorizedRequestContext,
                target: {
                  scope: request.scope,
                  scopeId: request.scopeId,
                },
                entitlements: tenantAccessState.entitlements,
              });
              const verification =
                yield* requestTenantBrandingCustomDomainVerification({
                  auditLog,
                  requestContext: authorizedRequestContext,
                  tenantBranding,
                  request: {
                    scope: request.scope,
                    scopeId: request.scopeId,
                    requestedHost: request.requestedHost,
                  },
                });

              return yield* buildCustomDomainVerificationAdminView({
                verificationId: verification.verificationId,
                scope: verification.scope,
                scopeId: verification.scopeId,
                requestedHost: verification.requestedHost,
                lifecycleState: verification.lifecycleState,
                changedAt: verification.changedAt,
              });
            }),
          ),
        ),
      getCustomDomainVerification: (
        input: GetCustomDomainVerificationBySessionRequest,
      ): Effect.Effect<
        CustomDomainVerificationRecord,
        TenantBrandingServiceError
      > =>
        Schema.decodeUnknown(GetCustomDomainVerificationBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({
                  sessionId: request.sessionId,
                })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeTenantBrandingOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const tenantAccessState =
                yield* billingState.getTenantAccessState(
                  authorizedRequestContext.tenant,
                );

              yield* ensureTenantBrandingCustomDomainEnabled({
                runtimeConfig,
                requestContext: authorizedRequestContext,
                target: {
                  scope: request.scope,
                  scopeId: request.scopeId,
                },
                entitlements: tenantAccessState.entitlements,
              });

              return yield* tenantBranding
                .findCustomDomainVerification({
                  scope: request.scope,
                  scopeId: request.scopeId,
                  requestedHost: request.requestedHost.toLowerCase(),
                })
                .pipe(
                  Effect.mapError(normalizeTenantBrandingModuleError),
                  Effect.flatMap((verification) =>
                    Effect.fromNullable(verification).pipe(
                      Effect.orElseFail(
                        () =>
                          ({
                            _tag: "TenantBrandingCustomDomainVerificationNotFoundError",
                            scope: request.scope,
                            scopeId: request.scopeId,
                          }) satisfies TenantBrandingCustomDomainVerificationNotFoundError,
                      ),
                    ),
                  ),
                );
            }),
          ),
        ),
      getSupportSafeView: (
        input: GetTenantBrandingSupportSafeViewBySessionRequest,
      ): Effect.Effect<
        TenantBrandingSupportSafeView,
        TenantBrandingServiceError
      > =>
        Schema.decodeUnknown(
          GetTenantBrandingSupportSafeViewBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({
                  sessionId: request.sessionId,
                })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeTenantBrandingOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const tenantAccessState =
                yield* billingState.getTenantAccessState(
                  authorizedRequestContext.tenant,
                );
              const companyName = yield* resolveSupportSafeCompanyName({
                runtimeConfig,
                tenantBranding,
                requestContext: authorizedRequestContext,
                entitlements: tenantAccessState.entitlements,
              });
              const currentVerification = yield* tenantBranding
                .findCurrentCustomDomainVerification({
                  scope: request.scope,
                  scopeId: request.scopeId,
                })
                .pipe(Effect.mapError(normalizeTenantBrandingModuleError));
              const changedAt = resolveLatestChangedAt([
                companyName.changedAt,
                currentVerification?.changedAt,
              ]);

              return yield* buildTenantBrandingSupportSafeView({
                scope: request.scope,
                scopeId: request.scopeId,
                companyName: companyName.companyName,
                customDomainStatus:
                  currentVerification?.lifecycleState ??
                  customDomainLifecycleState.unverified,
                effectiveScope: resolveTenantBrandingEffectiveScope([
                  companyName.resolvedScope,
                  currentVerification?.scope,
                ]),
                ...(changedAt === undefined ? {} : { changedAt }),
              });
            }),
          ),
        ),
      publishAssetReference: (
        input: PublishTenantBrandingAssetBySessionRequest,
      ): Effect.Effect<
        TenantBrandingPublishedAssetReferenceView,
        TenantBrandingServiceError
      > =>
        Schema.decodeUnknown(PublishTenantBrandingAssetBySessionRequestSchema)(
          input,
        ).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({
                  sessionId: request.sessionId,
                })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeTenantBrandingOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const tenantAccessState =
                yield* billingState.getTenantAccessState(
                  authorizedRequestContext.tenant,
                );

              yield* ensureTenantBrandingEnabled({
                runtimeConfig,
                requestContext: authorizedRequestContext,
                target: {
                  scope: request.scope,
                  scopeId: request.scopeId,
                },
                entitlements: tenantAccessState.entitlements,
              });

              const managedFile = yield* resolvePublishedManagedAsset({
                fileStorage,
                target: {
                  scope: request.scope,
                  scopeId: request.scopeId,
                },
                assetKind: request.assetKind,
                fileId: request.fileId,
              });
              const changedAt = new Date().toISOString();

              yield* runtimeConfig.upsertOverride({
                moduleId: platformModuleId.tenantBranding,
                key: resolveTenantBrandingAssetConfigKey(request.assetKind),
                scope: request.scope,
                scopeId: request.scopeId,
                value: managedFile.fileId,
                source: runtimeResolutionSource.runtimeOverride,
                changedBy: authorizedRequestContext.actorId,
                changedAt,
              });

              yield* appendTenantBrandingAssetPublicationAuditAfterCommit({
                auditLog,
                requestContext: authorizedRequestContext,
                scope: request.scope,
                scopeId: request.scopeId,
                assetKind: request.assetKind,
                fileId: managedFile.fileId,
              });

              return yield* buildTenantBrandingPublishedAssetReferenceView({
                scope: request.scope,
                scopeId: request.scopeId,
                assetKind: request.assetKind,
                fileId: managedFile.fileId,
                changedAt,
              });
            }),
          ),
        ),
      transitionCurrentCustomDomainVerification: (
        input: TransitionCustomDomainVerificationBySessionRequest,
      ): Effect.Effect<
        CustomDomainVerificationAdminView,
        TenantBrandingServiceError
      > =>
        Schema.decodeUnknown(
          TransitionCustomDomainVerificationBySessionRequestSchema,
        )(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const authorizedRequestContext = yield* identitySession
                .resolveRequestContext({
                  sessionId: request.sessionId,
                })
                .pipe(
                  Effect.flatMap((requestContext) =>
                    authorizeTenantBrandingOperatorAccess({
                      authorization,
                      requestContext,
                      target: {
                        scope: request.scope,
                        scopeId: request.scopeId,
                      },
                    }),
                  ),
                );
              const currentVerification = yield* tenantBranding
                .findCurrentCustomDomainVerification({
                  scope: request.scope,
                  scopeId: request.scopeId,
                })
                .pipe(Effect.mapError(normalizeTenantBrandingModuleError));

              if (currentVerification === undefined) {
                return yield* Effect.fail({
                  _tag: "TenantBrandingCustomDomainVerificationNotFoundError",
                  scope: request.scope,
                  scopeId: request.scopeId,
                } satisfies TenantBrandingCustomDomainVerificationNotFoundError);
              }

              if (
                request.lifecycleState === customDomainLifecycleState.active &&
                request.approvalNotes === undefined
              ) {
                return yield* Effect.fail({
                  _tag: "TenantBrandingCustomDomainApprovalNotesRequiredError",
                  scope: request.scope,
                  scopeId: request.scopeId,
                } satisfies TenantBrandingCustomDomainApprovalNotesRequiredError);
              }

              const updatedVerification = yield* tenantBranding
                .updateCustomDomainVerification({
                  ...currentVerification,
                  lifecycleState: request.lifecycleState,
                  changedAt: new Date().toISOString(),
                  ...(request.lifecycleState ===
                  customDomainLifecycleState.active
                    ? {
                        approvedBy: authorizedRequestContext.actorId,
                        approvalNotes: request.approvalNotes,
                      }
                    : {}),
                })
                .pipe(Effect.mapError(normalizeTenantBrandingModuleError));

              if (updatedVerification === undefined) {
                return yield* Effect.fail({
                  _tag: "TenantBrandingCustomDomainVerificationNotFoundError",
                  scope: request.scope,
                  scopeId: request.scopeId,
                } satisfies TenantBrandingCustomDomainVerificationNotFoundError);
              }

              yield* appendTenantBrandingCustomDomainLifecycleAudit({
                auditLog,
                lifecycleState: request.lifecycleState,
                requestContext: authorizedRequestContext,
                verification: updatedVerification,
              });

              return yield* buildCustomDomainVerificationAdminView({
                verificationId: updatedVerification.verificationId,
                scope: updatedVerification.scope,
                scopeId: updatedVerification.scopeId,
                requestedHost: updatedVerification.requestedHost,
                lifecycleState: updatedVerification.lifecycleState,
                changedAt: updatedVerification.changedAt,
              });
            }),
          ),
        ),
    } satisfies TenantBrandingService;
  });

const makeLiveTenantBrandingAuthorization = Effect.gen(function* () {
  const oryKeto = yield* OryKetoAdapter;

  return yield* makeAuthorizationModule({
    tuples: [],
    cacheTtlSeconds: 60,
    maxCacheSize: 256,
    delegatedCheck: createOryKetoAuthorizationDelegatedCheck(oryKeto),
    delegatedTupleLookup:
      createOryKetoAuthorizationDelegatedTupleLookup(oryKeto),
  });
});

const makeLiveTenantBrandingModule = (
  postgres: Pick<PostgresAdapterService, "database">,
) =>
  makeTenantBrandingDomainVerificationPostgresRepository({
    createCustomDomainVerification: async (record) => {
      const [created] = await postgres.database
        .insert(tenantBrandingDomainVerificationTable)
        .values(record)
        .returning();

      if (created === undefined) {
        throw new Error(
          "Tenant branding domain verification insert returned no row.",
        );
      }

      return created;
    },
    updateCustomDomainVerification: async (record) => {
      const [updated] = await postgres.database
        .update(tenantBrandingDomainVerificationTable)
        .set({
          scope: record.scope,
          scopeId: record.scopeId,
          requestedHost: record.requestedHost,
          lifecycleState: record.lifecycleState,
          dnsProof: record.dnsProof ?? null,
          approvedBy: record.approvedBy ?? null,
          approvalNotes: record.approvalNotes ?? null,
          changedAt: record.changedAt,
        })
        .where(
          eq(
            tenantBrandingDomainVerificationTable.verificationId,
            record.verificationId,
          ),
        )
        .returning();

      return updated;
    },
    findCustomDomainVerification: async (input) => {
      const matches = await postgres.database
        .select()
        .from(tenantBrandingDomainVerificationTable)
        .where(
          and(
            eq(tenantBrandingDomainVerificationTable.scope, input.scope),
            eq(tenantBrandingDomainVerificationTable.scopeId, input.scopeId),
            eq(
              tenantBrandingDomainVerificationTable.requestedHost,
              input.requestedHost,
            ),
            ne(
              tenantBrandingDomainVerificationTable.lifecycleState,
              customDomainLifecycleState.retired,
            ),
          ),
        )
        .orderBy(desc(tenantBrandingDomainVerificationTable.changedAt))
        .limit(1);

      return matches[0];
    },
    findCurrentCustomDomainVerification: async (input) => {
      const matches = await postgres.database
        .select()
        .from(tenantBrandingDomainVerificationTable)
        .where(
          and(
            eq(tenantBrandingDomainVerificationTable.scope, input.scope),
            eq(tenantBrandingDomainVerificationTable.scopeId, input.scopeId),
            ne(
              tenantBrandingDomainVerificationTable.lifecycleState,
              customDomainLifecycleState.retired,
            ),
          ),
        )
        .orderBy(desc(tenantBrandingDomainVerificationTable.changedAt))
        .limit(1);

      return matches[0];
    },
  }).pipe(
    Effect.flatMap((repository) =>
      makeTenantBrandingModule({
        domainVerificationRepository: repository,
      }),
    ),
  );

export function makeTenantBrandingService(options: {
  readonly authorization: Pick<AuthorizationModuleService, "check">;
}): Effect.Effect<
  TenantBrandingService,
  never,
  | AuditLogModule
  | BillingStatePostgresRepository
  | FileStorageModule
  | IdentitySessionModule
  | RuntimeConfigModule
  | TenantBrandingModule
>;
export function makeTenantBrandingService(
  options?: TenantBrandingServiceOptions,
): Effect.Effect<
  TenantBrandingService,
  never,
  | AuditLogModule
  | BillingStatePostgresRepository
  | FileStorageModule
  | IdentitySessionModule
  | OryKetoAdapter
  | RuntimeConfigModule
  | TenantBrandingModule
>;
export function makeTenantBrandingService(
  options: TenantBrandingServiceOptions = {},
) {
  return options.authorization === undefined
    ? makeLiveTenantBrandingAuthorization.pipe(
        Effect.flatMap((authorization) =>
          buildTenantBrandingService(authorization),
        ),
      )
    : buildTenantBrandingService(options.authorization);
}

const runTenantBrandingWithResolvedOptions = <A, E>(
  environment: unknown,
  use: (service: TenantBrandingService) => Effect.Effect<A, E>,
) =>
  resolveSubscriberJourneyRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.mapError(
      (cause): TenantBrandingRuntimeError => ({
        _tag: "TenantBrandingRuntimeError",
        cause,
      }),
    ),
    Effect.flatMap((resolvedOptions) =>
      Effect.gen(function* () {
        const runtime = yield* makeSubscriberJourneyRuntime(
          resolvedOptions,
        ).pipe(
          Effect.mapError(
            (cause): TenantBrandingRuntimeError => ({
              _tag: "TenantBrandingRuntimeError",
              cause,
            }),
          ),
        );
        const postgres = yield* makePostgresAdapter({
          connectionString: resolvedOptions.postgresUrl,
        }).pipe(
          Effect.mapError(
            (cause): TenantBrandingRuntimeError => ({
              _tag: "TenantBrandingRuntimeError",
              cause,
            }),
          ),
        );
        const tenantBranding = yield* makeLiveTenantBrandingModule(
          postgres,
        ).pipe(
          Effect.mapError(
            (cause): TenantBrandingRuntimeError => ({
              _tag: "TenantBrandingRuntimeError",
              cause,
            }),
          ),
        );
        const convexFileStorage = yield* makeConvexFileStorageAdapter({
          deploymentUrl: resolvedOptions.convexUrl,
          siteUrl: resolvedOptions.convexSiteUrl,
          adminKey: resolvedOptions.convexAdminKey,
          keycloakBaseUrl: resolvedOptions.keycloakBaseUrl,
          keycloakRealm: resolvedOptions.keycloakRealm,
          keycloakClientId: resolvedOptions.keycloakClientId,
          keycloakClientSecret: resolvedOptions.keycloakClientSecret,
          keycloakConvexServiceActorUsername:
            resolvedOptions.keycloakConvexServiceActorUsername,
          keycloakConvexServiceActorPassword:
            resolvedOptions.keycloakConvexServiceActorPassword,
        }).pipe(
          Effect.mapError(
            (cause): TenantBrandingRuntimeError => ({
              _tag: "TenantBrandingRuntimeError",
              cause,
            }),
          ),
        );
        const fileStorage = yield* makeFileStorageModule().pipe(
          Effect.provideService(ConvexFileStorageAdapter, convexFileStorage),
          Effect.provideService(
            RetentionLegalHoldModule,
            runtime.retentionLegalHold,
          ),
          Effect.mapError(
            (cause): TenantBrandingRuntimeError => ({
              _tag: "TenantBrandingRuntimeError",
              cause,
            }),
          ),
        );
        const service = yield* makeTenantBrandingService().pipe(
          Effect.provideService(AuditLogModule, runtime.auditLog),
          Effect.provideService(
            BillingStatePostgresRepository,
            runtime.billingState,
          ),
          Effect.provideService(FileStorageModule, fileStorage),
          Effect.provideService(IdentitySessionModule, runtime.identitySession),
          Effect.provideService(OryKetoAdapter, runtime.oryKeto),
          Effect.provideService(RuntimeConfigModule, runtime.runtimeConfig),
          Effect.provideService(TenantBrandingModule, tenantBranding),
          Effect.mapError(
            (cause): TenantBrandingRuntimeError => ({
              _tag: "TenantBrandingRuntimeError",
              cause,
            }),
          ),
        );

        return yield* use(service).pipe(
          Effect.ensuring(
            Effect.all([
              Effect.ignore(runtime.close),
              Effect.ignore(postgres.close),
            ]).pipe(Effect.asVoid),
          ),
        );
      }),
    ),
  );

export const runTenantBrandingFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: TenantBrandingService) => Effect.Effect<A, E>,
) => runTenantBrandingWithResolvedOptions(environment, use);
