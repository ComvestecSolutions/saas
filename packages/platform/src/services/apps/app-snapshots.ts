import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  AuditEventSchema,
  CustomDomainLifecycleStateSchema,
  DeclaredRuntimeGovernedKeySchema,
  type Entitlement,
  FeatureFlagDeclarationSchema,
  PermissionDescriptorListSchema,
  platformModuleId,
  platformScope,
  PlatformModuleIdSchema,
  PlatformScopeSchema,
  ProjectionDescriptorListSchema,
  RequestContextSchema,
  RuntimeChangeProposalActionSchema,
  customDomainLifecycleStates,
  corePermissionDescriptors,
  baseProjectionDescriptors,
} from "@comvestec/contracts";
import type { RequestContext } from "@comvestec/contracts";
import {
  configDefaultValue,
  type PlatformModuleId,
  PlatformModuleManifestSchema,
  PlatformStorageSchema,
  findModuleManifest,
  platformHost,
  platformDefaults,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import type {
  RuntimeConfigModulePersistenceError,
  RuntimeConfigModuleService,
  UnknownConfigKeyError,
} from "@comvestec/modules";
import {
  makeTenantBrandingModule,
  AdminBrandingProjectionSchema,
  PublicBrandingProjectionSchema,
} from "../../../../modules/src/domains/tenant-branding";
import { RuntimeConfigSyncArtifactStatusSchema } from "../../../../modules/src/persistence/postgres/governance";
import type {
  AdminGovernanceRuntimeConfigOverrideView,
  AdminGovernanceRuntimeConfigProposalView,
  AdminGovernanceService,
} from "../governance/admin-governance";
import { loadRuntimeModuleOrDie } from "./runtime-loader";

export type MissingModuleManifestError = {
  readonly _tag: "MissingModuleManifestError";
  readonly moduleId: PlatformModuleId;
};

export type AdminAppSnapshotUnauthenticatedActorError = {
  readonly _tag: "AdminAppSnapshotUnauthenticatedActorError";
};

export type AdminAppSnapshotAccessDeniedError = {
  readonly _tag: "AdminAppSnapshotAccessDeniedError";
  readonly actorType: RequestContext["actorType"];
};

export type AdminAppSnapshotGovernanceService = Pick<
  AdminGovernanceService,
  | "listRuntimeConfigOverrides"
  | "listRuntimeConfigProposals"
  | "queryAuditEventsByModule"
>;

export type AdminAppSnapshotGovernanceError =
  | ParseResult.ParseError
  | MissingModuleManifestError
  | AdminAppSnapshotUnauthenticatedActorError
  | AdminAppSnapshotAccessDeniedError;

export type AppSnapshotBrandingResolutionError =
  | ParseResult.ParseError
  | MissingModuleManifestError
  | RuntimeConfigModulePersistenceError
  | UnknownConfigKeyError;

const getRequiredModuleManifest = (moduleId: PlatformModuleId) =>
  Effect.fromNullable(findModuleManifest(moduleId)).pipe(
    Effect.mapError(
      (): MissingModuleManifestError => ({
        _tag: "MissingModuleManifestError",
        moduleId,
      }),
    ),
  );

const TenantManagementManifestEffect = getRequiredModuleManifest(
  platformModuleId.tenantManagement,
);

const RuntimeConfigManifestEffect = getRequiredModuleManifest(
  platformModuleId.runtimeConfig,
);

const TenantBrandingManifestEffect = getRequiredModuleManifest(
  platformModuleId.tenantBranding,
);

const TenantBrandingPreviewSchema = Schema.Struct({
  moduleId: Schema.Literal(platformModuleId.tenantBranding),
  projection: PublicBrandingProjectionSchema,
  companyName: Schema.NonEmptyString,
  supportedScopes: Schema.Array(PlatformScopeSchema),
  featureFlags: Schema.Array(FeatureFlagDeclarationSchema),
  customDomainLifecycle: Schema.Array(CustomDomainLifecycleStateSchema),
});

const AdminTenantBrandingPreviewSchema = Schema.Struct({
  moduleId: Schema.Literal(platformModuleId.tenantBranding),
  projection: AdminBrandingProjectionSchema,
  companyName: Schema.NonEmptyString,
  supportedScopes: Schema.Array(PlatformScopeSchema),
  featureFlags: Schema.Array(FeatureFlagDeclarationSchema),
  customDomainLifecycle: Schema.Array(CustomDomainLifecycleStateSchema),
});

const brandingSupportedScopes = Schema.validateSync(
  Schema.Array(PlatformScopeSchema),
)([
  platformScope.platform,
  platformScope.enterprise,
  platformScope.organization,
] as const);

const decodeRequestContext = Schema.decodeUnknown(RequestContextSchema);

const defaultPublicWebRequestContext = Schema.validateSync(
  RequestContextSchema,
)({
  actorType: actorType.anonymous,
  correlationId: "public-web.home",
  host: platformHost.localDevelopment,
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} satisfies RequestContext);

const defaultProductAppRequestContext = Schema.validateSync(
  RequestContextSchema,
)({
  actorType: actorType.organizationMember,
  actorId: "usr_demo_member",
  sessionId: "sess_product_home",
  correlationId: "product-app.home",
  tenant: {
    scope: platformScope.organization,
    scopeId: "org_demo",
    enterpriseId: "ent_demo",
    organizationId: "org_demo",
    individualId: "usr_demo_member",
  },
} satisfies RequestContext);

const defaultAdminAppRequestContext = Schema.validateSync(RequestContextSchema)(
  {
    actorType: actorType.platformOperator,
    actorId: "usr_platform_operator",
    sessionId: "sess_admin_home",
    correlationId: "admin-app.home",
    reason: "Inspect runtime governance scaffolding",
    tenant: {
      scope: platformScope.platform,
      scopeId: platformScope.platform,
    },
  } satisfies RequestContext,
);

const AppSnapshotBaseFields = {
  focus: Schema.NonEmptyString,
  requestContext: RequestContextSchema,
};

const ManifestAppSnapshotBaseFields = {
  ...AppSnapshotBaseFields,
  manifest: PlatformModuleManifestSchema,
  brandingManifest: PlatformModuleManifestSchema,
};

export const PublicWebSnapshotSchema = Schema.Struct({
  application: Schema.Literal("Public web"),
  ...AppSnapshotBaseFields,
  platformRuntime: Schema.Literal("effect"),
  storage: PlatformStorageSchema,
  tenancyScopes: Schema.Array(PlatformScopeSchema),
  secureByDefault: Schema.Boolean,
  branding: TenantBrandingPreviewSchema,
});

export type PublicWebSnapshot = Schema.Schema.Type<
  typeof PublicWebSnapshotSchema
>;

export const ProductAppSnapshotSchema = Schema.Struct({
  application: Schema.Literal("Product app"),
  ...ManifestAppSnapshotBaseFields,
  branding: TenantBrandingPreviewSchema,
  permissionDescriptors: PermissionDescriptorListSchema,
  platformProjectionDescriptors: ProjectionDescriptorListSchema,
  tenancyScopes: Schema.Array(PlatformScopeSchema),
});

export type ProductAppSnapshot = Schema.Schema.Type<
  typeof ProductAppSnapshotSchema
>;

const AdminAppGovernanceOverridePreviewSchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  scope: PlatformScopeSchema,
  scopeId: Schema.NonEmptyString,
  changedBy: Schema.NonEmptyString,
  changedAt: Schema.NonEmptyString,
  approvalReason: Schema.optional(Schema.NonEmptyString),
});

const AdminAppGovernanceProposalPreviewSchema = Schema.Struct({
  proposalId: Schema.NonEmptyString,
  moduleId: PlatformModuleIdSchema,
  key: DeclaredRuntimeGovernedKeySchema,
  action: RuntimeChangeProposalActionSchema,
  artifactPath: Schema.NonEmptyString,
  status: RuntimeConfigSyncArtifactStatusSchema,
  generatedAt: Schema.NonEmptyString,
});

const AdminAppGovernancePreviewEntrySchema = Schema.Struct({
  moduleId: PlatformModuleIdSchema,
  overrides: Schema.Array(AdminAppGovernanceOverridePreviewSchema),
  proposals: Schema.Array(AdminAppGovernanceProposalPreviewSchema),
  auditEvents: Schema.Array(AuditEventSchema),
});

export const AdminAppSnapshotSchema = Schema.Struct({
  application: Schema.Literal("Admin app"),
  ...ManifestAppSnapshotBaseFields,
  branding: AdminTenantBrandingPreviewSchema,
  permissions: PermissionDescriptorListSchema,
  governancePreview: Schema.Array(AdminAppGovernancePreviewEntrySchema),
});

export type AdminAppSnapshot = Schema.Schema.Type<
  typeof AdminAppSnapshotSchema
>;

export type AdminAppGovernancePreview =
  AdminAppSnapshot["governancePreview"][number];

const decodePublicWebSnapshot = Schema.decodeUnknown(PublicWebSnapshotSchema);

const decodeProductAppSnapshot = Schema.decodeUnknown(ProductAppSnapshotSchema);

const decodeAdminAppSnapshot = Schema.decodeUnknown(AdminAppSnapshotSchema);

const decodeTenantBrandingPreview = Schema.decodeUnknown(
  TenantBrandingPreviewSchema,
);

const decodeAdminTenantBrandingPreview = Schema.decodeUnknown(
  AdminTenantBrandingPreviewSchema,
);

const decodeAdminAppGovernancePreview = Schema.decodeUnknown(
  AdminAppGovernancePreviewEntrySchema,
);

type TenantBrandingRuntimeConfigService = Pick<
  RuntimeConfigModuleService,
  "listOverridesByModule" | "resolveConfigValue"
>;

type AdminTenantBrandingRuntimeConfigService =
  TenantBrandingRuntimeConfigService &
    Pick<RuntimeConfigModuleService, "resolveStoredFeatureFlag">;

type TenantBrandingSnapshotRuntime = {
  readonly entitlements: readonly Entitlement[];
  readonly runtimeConfig: TenantBrandingRuntimeConfigService;
};

type AdminTenantBrandingSnapshotRuntime = {
  readonly entitlements: readonly Entitlement[];
  readonly runtimeConfig: AdminTenantBrandingRuntimeConfigService;
};

const tenantBrandingPublicProjectionConfigKeys = [
  tenantBrandingConfigKey.companyName,
  tenantBrandingConfigKey.logoAssetId,
  tenantBrandingConfigKey.faviconAssetId,
  tenantBrandingConfigKey.themePrimary,
  tenantBrandingConfigKey.themeSecondary,
  tenantBrandingConfigKey.themeAccent,
  tenantBrandingConfigKey.supportEmail,
] as const;

const tenantBrandingAdminProjectionConfigKeys = [
  ...tenantBrandingPublicProjectionConfigKeys,
  tenantBrandingConfigKey.replyToEmail,
  tenantBrandingConfigKey.customDomainHost,
] as const;

const isMaterializedBrandingValue = (value: unknown) =>
  value !== undefined && value !== null && value !== configDefaultValue.inherit;

const platformScopeSpecificityRank = (
  scope: RequestContext["tenant"]["scope"],
) => {
  switch (scope) {
    case platformScope.individual:
      return 0;
    case platformScope.organization:
      return 1;
    case platformScope.enterprise:
      return 2;
    case platformScope.platform:
      return 3;
  }
};

const resolveBrandingEffectiveScope = (
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

const adminAppGovernancePreviewModuleIds = Schema.validateSync(
  Schema.Array(PlatformModuleIdSchema),
)([platformModuleId.runtimeConfig, platformModuleId.tenantBranding] as const);

const emptyAdminAppGovernancePreview = Schema.validateSync(
  Schema.Array(AdminAppGovernancePreviewEntrySchema),
)(
  adminAppGovernancePreviewModuleIds.map((moduleId) => ({
    moduleId,
    overrides: [],
    proposals: [],
    auditEvents: [],
  })),
);

const buildTenantBrandingPreview = (input: {
  readonly brandingManifest: Schema.Schema.Type<
    typeof PlatformModuleManifestSchema
  >;
  readonly requestContext: RequestContext;
  readonly runtime?: TenantBrandingSnapshotRuntime;
}) =>
  Effect.gen(function* () {
    const tenantBranding = yield* makeTenantBrandingModule();

    let projection: Schema.Schema.Type<typeof PublicBrandingProjectionSchema>;
    const runtime = input.runtime;

    if (runtime === undefined) {
      const fallbackProjection = (yield* tenantBranding.resolveBranding({
        requestContext: input.requestContext,
        entitled: false,
        values: {},
      })).publicProjection;
      projection = yield* Schema.decodeUnknown(PublicBrandingProjectionSchema)({
        ...fallbackProjection,
        effectiveScope: platformScope.platform,
      });
    } else {
      const overrides = yield* runtime.runtimeConfig.listOverridesByModule(
        platformModuleId.tenantBranding,
      );
      const resolutions = yield* Effect.forEach(
        tenantBrandingPublicProjectionConfigKeys,
        (key) =>
          runtime.runtimeConfig
            .resolveConfigValue({
              requestContext: input.requestContext,
              moduleId: platformModuleId.tenantBranding,
              key,
              overrides,
              entitlements: runtime.entitlements,
            })
            .pipe(Effect.map((resolution) => [key, resolution] as const)),
        { concurrency: 1 },
      );

      const materializedResolutions = resolutions.filter(([, resolution]) =>
        isMaterializedBrandingValue(resolution.effectiveValue),
      );
      const effectiveScope = resolveBrandingEffectiveScope(
        materializedResolutions.map(
          ([, resolution]) => resolution.resolvedScope,
        ),
      );

      const resolvedProjection = (yield* tenantBranding.resolveBranding({
        requestContext: input.requestContext,
        entitled: resolutions.some(([, resolution]) => resolution.entitled),
        values: Object.fromEntries(
          materializedResolutions.flatMap(([key, resolution]) =>
            isMaterializedBrandingValue(resolution.effectiveValue)
              ? [[key, resolution.effectiveValue] as const]
              : [],
          ),
        ),
      })).publicProjection;
      projection = yield* Schema.decodeUnknown(PublicBrandingProjectionSchema)({
        ...resolvedProjection,
        effectiveScope,
      });
    }

    return yield* decodeTenantBrandingPreview({
      moduleId: input.brandingManifest.moduleId,
      projection,
      companyName: projection.companyName,
      supportedScopes: [...brandingSupportedScopes],
      featureFlags: input.brandingManifest.featureFlags,
      customDomainLifecycle: [...customDomainLifecycleStates],
    });
  });

const buildAdminTenantBrandingPreview = (input: {
  readonly brandingManifest: Schema.Schema.Type<
    typeof PlatformModuleManifestSchema
  >;
  readonly requestContext: RequestContext;
  readonly runtime?: AdminTenantBrandingSnapshotRuntime;
}) =>
  Effect.gen(function* () {
    const tenantBranding = yield* makeTenantBrandingModule();

    const toVisibleAdminProjection = (
      inputProjection: Schema.Schema.Type<typeof AdminBrandingProjectionSchema>,
    ) => {
      const { replyToEmail, customDomainHost, ...projectionBase } =
        inputProjection;

      return Schema.decodeUnknown(AdminBrandingProjectionSchema)({
        ...projectionBase,
        ...(input.requestContext.actorType === actorType.platformOperator &&
        replyToEmail !== undefined
          ? { replyToEmail }
          : {}),
        ...(input.requestContext.actorType === actorType.platformOperator &&
        customDomainHost !== undefined
          ? { customDomainHost }
          : {}),
      });
    };

    let projection: Schema.Schema.Type<typeof AdminBrandingProjectionSchema>;
    const runtime = input.runtime;

    if (runtime === undefined) {
      const fallbackProjection = (yield* tenantBranding.resolveBranding({
        requestContext: input.requestContext,
        entitled: false,
        values: {},
      })).adminProjection;
      projection = yield* toVisibleAdminProjection({
        ...fallbackProjection,
        effectiveScope: platformScope.platform,
      });
    } else {
      const overrides = yield* runtime.runtimeConfig.listOverridesByModule(
        platformModuleId.tenantBranding,
      );
      const brandedEmailsFlag = yield* Effect.fromNullable(
        input.brandingManifest.featureFlags.find(
          (featureFlag) =>
            featureFlag.key === tenantBrandingFeatureFlag.brandedEmails,
        ),
      ).pipe(
        Effect.orDieWith(
          () =>
            new Error(
              "Missing tenant-branding brandedEmails feature flag declaration.",
            ),
        ),
      );
      const customDomainFlag = yield* Effect.fromNullable(
        input.brandingManifest.featureFlags.find(
          (featureFlag) =>
            featureFlag.key === tenantBrandingFeatureFlag.customDomain,
        ),
      ).pipe(
        Effect.orDieWith(
          () =>
            new Error(
              "Missing tenant-branding customDomain feature flag declaration.",
            ),
        ),
      );
      const brandedEmailsEnabled = yield* runtime.runtimeConfig
        .resolveStoredFeatureFlag({
          requestContext: input.requestContext,
          moduleId: platformModuleId.tenantBranding,
          flag: brandedEmailsFlag,
          entitlements: runtime.entitlements,
        })
        .pipe(Effect.map((resolution) => resolution.effectiveValue));
      const customDomainEnabled = yield* runtime.runtimeConfig
        .resolveStoredFeatureFlag({
          requestContext: input.requestContext,
          moduleId: platformModuleId.tenantBranding,
          flag: customDomainFlag,
          entitlements: runtime.entitlements,
        })
        .pipe(Effect.map((resolution) => resolution.effectiveValue));
      const resolutions = yield* Effect.forEach(
        tenantBrandingAdminProjectionConfigKeys,
        (key) =>
          runtime.runtimeConfig
            .resolveConfigValue({
              requestContext: input.requestContext,
              moduleId: platformModuleId.tenantBranding,
              key,
              overrides,
              entitlements: runtime.entitlements,
            })
            .pipe(Effect.map((resolution) => [key, resolution] as const)),
        { concurrency: 1 },
      );

      const materializedResolutions = resolutions.filter(([, resolution]) =>
        isMaterializedBrandingValue(resolution.effectiveValue),
      );
      const visibleMaterializedResolutions = materializedResolutions.filter(
        ([key]) =>
          (key !== tenantBrandingConfigKey.replyToEmail ||
            brandedEmailsEnabled) &&
          (key !== tenantBrandingConfigKey.customDomainHost ||
            customDomainEnabled),
      );
      const effectiveScope = resolveBrandingEffectiveScope(
        visibleMaterializedResolutions.map(
          ([, resolution]) => resolution.resolvedScope,
        ),
      );

      const resolvedProjection = (yield* tenantBranding.resolveBranding({
        requestContext: input.requestContext,
        entitled: resolutions.some(([, resolution]) => resolution.entitled),
        values: Object.fromEntries(
          visibleMaterializedResolutions.flatMap(([key, resolution]) =>
            isMaterializedBrandingValue(resolution.effectiveValue)
              ? [[key, resolution.effectiveValue] as const]
              : [],
          ),
        ),
      })).adminProjection;
      projection = yield* toVisibleAdminProjection({
        ...resolvedProjection,
        effectiveScope,
      });
    }

    return yield* decodeAdminTenantBrandingPreview({
      moduleId: input.brandingManifest.moduleId,
      projection,
      companyName: projection.companyName,
      supportedScopes: [...brandingSupportedScopes],
      featureFlags: input.brandingManifest.featureFlags,
      customDomainLifecycle: [...customDomainLifecycleStates],
    });
  });

const toAdminAppGovernanceOverridePreview = (
  override: AdminGovernanceRuntimeConfigOverrideView,
) => ({
  moduleId: override.moduleId,
  key: override.key,
  scope: override.scope,
  scopeId: override.scopeId,
  changedBy: override.changedBy,
  changedAt: override.changedAt,
  ...(override.approvalReason !== undefined
    ? { approvalReason: override.approvalReason }
    : {}),
});

const toAdminAppGovernanceProposalPreview = (
  proposal: AdminGovernanceRuntimeConfigProposalView,
) => ({
  proposalId: proposal.proposalId,
  moduleId: proposal.moduleId,
  key: proposal.key,
  action: proposal.action,
  artifactPath: proposal.artifactPath,
  status: proposal.status,
  generatedAt: proposal.generatedAt,
});

const ensureAdminAppSnapshotAccess = (
  requestContext: RequestContext,
): Effect.Effect<
  RequestContext,
  AdminAppSnapshotUnauthenticatedActorError | AdminAppSnapshotAccessDeniedError
> => {
  if (requestContext.actorId === undefined) {
    return Effect.fail({
      _tag: "AdminAppSnapshotUnauthenticatedActorError",
    } satisfies AdminAppSnapshotUnauthenticatedActorError);
  }

  return requestContext.actorType === actorType.platformOperator ||
    requestContext.actorType === actorType.supportOperator
    ? Effect.succeed(requestContext)
    : Effect.fail({
        _tag: "AdminAppSnapshotAccessDeniedError",
        actorType: requestContext.actorType,
      } satisfies AdminAppSnapshotAccessDeniedError);
};

const buildAdminAppGovernancePreview = (
  governanceService: AdminAppSnapshotGovernanceService,
  requestContext: RequestContext,
) =>
  Effect.forEach(adminAppGovernancePreviewModuleIds, (moduleId) =>
    Effect.all({
      overrides: governanceService.listRuntimeConfigOverrides({
        requestContext,
        moduleId,
      }),
      proposals: governanceService.listRuntimeConfigProposals({
        requestContext,
        moduleId,
      }),
      auditEvents: governanceService.queryAuditEventsByModule({
        requestContext,
        moduleId,
      }),
    }).pipe(
      Effect.flatMap(({ overrides, proposals, auditEvents }) =>
        decodeAdminAppGovernancePreview({
          moduleId,
          overrides: overrides.map(toAdminAppGovernanceOverridePreview),
          proposals: proposals.map(toAdminAppGovernanceProposalPreview),
          auditEvents,
        }),
      ),
    ),
  );

const buildPublicWebSnapshot = (
  requestContext: RequestContext,
  runtime?: TenantBrandingSnapshotRuntime,
) =>
  Effect.gen(function* () {
    const brandingManifest = yield* TenantBrandingManifestEffect;
    const branding = yield* buildTenantBrandingPreview({
      brandingManifest,
      requestContext,
      ...(runtime !== undefined ? { runtime } : {}),
    });

    return yield* decodePublicWebSnapshot({
      application: "Public web",
      focus:
        "Trust, pricing, onboarding, and tenant-branded public surfaces stay thin and route-owned.",
      requestContext,
      platformRuntime: platformDefaults.runtime,
      storage: platformDefaults.storage,
      tenancyScopes: [...platformDefaults.tenancy.scopes],
      secureByDefault: platformDefaults.security.fieldLevelAccess,
      branding,
    });
  });

const buildProductAppSnapshot = (
  requestContext: RequestContext,
  runtime?: TenantBrandingSnapshotRuntime,
) =>
  Effect.gen(function* () {
    const manifest = yield* TenantManagementManifestEffect;
    const brandingManifest = yield* TenantBrandingManifestEffect;
    const branding = yield* buildTenantBrandingPreview({
      brandingManifest,
      requestContext,
      ...(runtime !== undefined ? { runtime } : {}),
    });

    return yield* decodeProductAppSnapshot({
      application: "Product app",
      focus:
        "Route-owned loaders consume shared contracts and effective branding while keeping client state local and minimal.",
      requestContext,
      manifest,
      brandingManifest,
      branding,
      permissionDescriptors: corePermissionDescriptors,
      platformProjectionDescriptors: baseProjectionDescriptors,
      tenancyScopes: [...platformDefaults.tenancy.scopes],
    });
  });

const buildAdminAppSnapshot = (
  requestContext: RequestContext,
  governancePreview = emptyAdminAppGovernancePreview,
  runtime?: AdminTenantBrandingSnapshotRuntime,
) =>
  Effect.gen(function* () {
    const manifest = yield* RuntimeConfigManifestEffect;
    const brandingManifest = yield* TenantBrandingManifestEffect;
    const branding = yield* buildAdminTenantBrandingPreview({
      brandingManifest,
      requestContext,
      ...(runtime !== undefined ? { runtime } : {}),
    });

    return yield* decodeAdminAppSnapshot({
      application: "Admin app",
      focus:
        "Governance, permissions, feature state, branding controls, and audit review stay centralized and explicit.",
      requestContext,
      manifest,
      brandingManifest,
      branding,
      permissions: corePermissionDescriptors,
      governancePreview,
    });
  });

export const getPublicWebSnapshotForRequestContext = (input: RequestContext) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) => buildPublicWebSnapshot(requestContext)),
  );

export const getPublicWebSnapshotForRequestContextWithRuntimeConfig = (
  input: RequestContext,
  runtimeConfig: TenantBrandingRuntimeConfigService,
  entitlements: readonly Entitlement[],
) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) =>
      buildPublicWebSnapshot(requestContext, {
        runtimeConfig,
        entitlements,
      }),
    ),
  );

export const getProductAppSnapshotForRequestContext = (input: RequestContext) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) => buildProductAppSnapshot(requestContext)),
  );

export const getProductAppSnapshotForRequestContextWithRuntimeConfig = (
  input: RequestContext,
  runtimeConfig: TenantBrandingRuntimeConfigService,
  entitlements: readonly Entitlement[],
) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) =>
      buildProductAppSnapshot(requestContext, {
        runtimeConfig,
        entitlements,
      }),
    ),
  );

export const getAdminAppSnapshotForRequestContext = (input: RequestContext) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) => buildAdminAppSnapshot(requestContext)),
  );

type AdminGovernanceRuntimeModule = Pick<
  typeof import("../governance/admin-governance"),
  "runAdminGovernanceFromEnvironment"
>;

const buildAdminAppSnapshotForRequestContextWithGovernanceService = (
  requestContext: RequestContext,
  governanceService: AdminAppSnapshotGovernanceService,
  runtime?: AdminTenantBrandingSnapshotRuntime,
) =>
  ensureAdminAppSnapshotAccess(requestContext).pipe(
    Effect.flatMap(() =>
      buildAdminAppGovernancePreview(governanceService, requestContext),
    ),
    Effect.flatMap((governancePreview) =>
      buildAdminAppSnapshot(requestContext, governancePreview, runtime),
    ),
  );

export const getAdminAppSnapshotForRequestContextWithGovernanceService = (
  input: RequestContext,
  governanceService: AdminAppSnapshotGovernanceService,
  runtimeConfig?: AdminTenantBrandingRuntimeConfigService,
  entitlements: readonly Entitlement[] = [],
) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) =>
      buildAdminAppSnapshotForRequestContextWithGovernanceService(
        requestContext,
        governanceService,
        runtimeConfig !== undefined
          ? {
              runtimeConfig,
              entitlements,
            }
          : undefined,
      ),
    ),
  );

const loadAdminGovernanceRuntime = () =>
  loadRuntimeModuleOrDie<AdminGovernanceRuntimeModule>(
    () => import("../governance/admin-governance"),
  );

export const getAdminAppSnapshotForRequestContextFromEnvironment = (
  environment: unknown,
  input: RequestContext,
) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) =>
      loadAdminGovernanceRuntime().pipe(
        Effect.flatMap(({ runAdminGovernanceFromEnvironment }) =>
          runAdminGovernanceFromEnvironment(environment, (governanceService) =>
            buildAdminAppSnapshotForRequestContextWithGovernanceService(
              requestContext,
              governanceService,
            ),
          ),
        ),
      ),
    ),
  );

export const getPublicWebSnapshot = buildPublicWebSnapshot(
  defaultPublicWebRequestContext,
);

export const getProductAppSnapshot = buildProductAppSnapshot(
  defaultProductAppRequestContext,
);

export const getAdminAppSnapshot = buildAdminAppSnapshot(
  defaultAdminAppRequestContext,
);

export const getAdminAppSnapshotFromEnvironment = (environment: unknown) =>
  getAdminAppSnapshotForRequestContextFromEnvironment(
    environment,
    defaultAdminAppRequestContext,
  );
