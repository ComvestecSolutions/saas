import { Effect, Schema } from "effect";
import {
  actorType,
  CustomDomainLifecycleStateSchema,
  FeatureFlagDeclarationSchema,
  PermissionDescriptorListSchema,
  platformModuleId,
  platformScope,
  PlatformScopeSchema,
  ProjectionDescriptorListSchema,
  RequestContextSchema,
  customDomainLifecycleStates,
  corePermissionDescriptors,
  baseProjectionDescriptors,
} from "@comvestec/contracts";
import type { RequestContext } from "@comvestec/contracts";
import {
  type PlatformModuleId,
  PlatformModuleManifestSchema,
  PlatformStorageSchema,
  findModuleManifest,
  platformHost,
  platformDefaults,
} from "@comvestec/config";

export type MissingModuleManifestError = {
  readonly _tag: "MissingModuleManifestError";
  readonly moduleId: PlatformModuleId;
};

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

const PublicWebSnapshotSchema = Schema.Struct({
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

const ProductAppSnapshotSchema = Schema.Struct({
  application: Schema.Literal("Product app"),
  ...ManifestAppSnapshotBaseFields,
  permissionDescriptors: PermissionDescriptorListSchema,
  platformProjectionDescriptors: ProjectionDescriptorListSchema,
  tenancyScopes: Schema.Array(PlatformScopeSchema),
});

export type ProductAppSnapshot = Schema.Schema.Type<
  typeof ProductAppSnapshotSchema
>;

const AdminAppSnapshotSchema = Schema.Struct({
  application: Schema.Literal("Admin app"),
  ...ManifestAppSnapshotBaseFields,
  permissions: PermissionDescriptorListSchema,
});

export type AdminAppSnapshot = Schema.Schema.Type<
  typeof AdminAppSnapshotSchema
>;

const decodePublicWebSnapshot = Schema.decodeUnknown(PublicWebSnapshotSchema);

const decodeProductAppSnapshot = Schema.decodeUnknown(ProductAppSnapshotSchema);

const decodeAdminAppSnapshot = Schema.decodeUnknown(AdminAppSnapshotSchema);

const buildPublicWebSnapshot = (requestContext: RequestContext) =>
  Effect.gen(function* () {
    const brandingManifest = yield* TenantBrandingManifestEffect;

    return yield* decodePublicWebSnapshot({
      application: "Public web",
      focus:
        "Trust, pricing, onboarding, and tenant-branded public surfaces stay thin and route-owned.",
      requestContext,
      platformRuntime: platformDefaults.runtime,
      storage: platformDefaults.storage,
      tenancyScopes: [...platformDefaults.tenancy.scopes],
      secureByDefault: platformDefaults.security.fieldLevelAccess,
      branding: {
        moduleId: brandingManifest.moduleId,
        companyName: "Platform brand fallback",
        supportedScopes: [...brandingSupportedScopes],
        featureFlags: brandingManifest.featureFlags,
        customDomainLifecycle: [...customDomainLifecycleStates],
      },
    });
  });

const buildProductAppSnapshot = (requestContext: RequestContext) =>
  Effect.gen(function* () {
    const manifest = yield* TenantManagementManifestEffect;
    const brandingManifest = yield* TenantBrandingManifestEffect;

    return yield* decodeProductAppSnapshot({
      application: "Product app",
      focus:
        "Route-owned loaders consume shared contracts and effective branding while keeping client state local and minimal.",
      requestContext,
      manifest,
      brandingManifest,
      permissionDescriptors: corePermissionDescriptors,
      platformProjectionDescriptors: baseProjectionDescriptors,
      tenancyScopes: [...platformDefaults.tenancy.scopes],
    });
  });

const buildAdminAppSnapshot = (requestContext: RequestContext) =>
  Effect.gen(function* () {
    const manifest = yield* RuntimeConfigManifestEffect;
    const brandingManifest = yield* TenantBrandingManifestEffect;

    return yield* decodeAdminAppSnapshot({
      application: "Admin app",
      focus:
        "Governance, permissions, feature state, branding controls, and audit review stay centralized and explicit.",
      requestContext,
      manifest,
      brandingManifest,
      permissions: corePermissionDescriptors,
    });
  });

export const getPublicWebSnapshotForRequest = (input: unknown) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) => buildPublicWebSnapshot(requestContext)),
  );

export const getProductAppSnapshotForRequest = (input: unknown) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) => buildProductAppSnapshot(requestContext)),
  );

export const getAdminAppSnapshotForRequest = (input: unknown) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) => buildAdminAppSnapshot(requestContext)),
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
