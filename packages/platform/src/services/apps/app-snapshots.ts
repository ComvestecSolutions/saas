import { Effect, ParseResult, Schema } from "effect";
import {
  actorType,
  AuditEventSchema,
  CustomDomainLifecycleStateSchema,
  DeclaredRuntimeGovernedKeySchema,
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
  type PlatformModuleId,
  PlatformModuleManifestSchema,
  PlatformStorageSchema,
  findModuleManifest,
  platformHost,
  platformDefaults,
} from "@comvestec/config";
import { RuntimeConfigSyncArtifactStatusSchema } from "../../../../modules/src/persistence/postgres/governance";
import type {
  AdminGovernanceRuntimeConfigOverrideView,
  AdminGovernanceRuntimeConfigProposalView,
  AdminGovernanceService,
} from "../governance/admin-governance";

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

const decodeAdminAppGovernancePreview = Schema.decodeUnknown(
  AdminAppGovernancePreviewEntrySchema,
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

const buildAdminAppSnapshot = (
  requestContext: RequestContext,
  governancePreview = emptyAdminAppGovernancePreview,
) =>
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
      governancePreview,
    });
  });

export const getPublicWebSnapshotForRequest = (input: RequestContext) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) => buildPublicWebSnapshot(requestContext)),
  );

export const getProductAppSnapshotForRequest = (input: RequestContext) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) => buildProductAppSnapshot(requestContext)),
  );

export const getAdminAppSnapshotForRequest = (input: RequestContext) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) => buildAdminAppSnapshot(requestContext)),
  );

const buildAdminAppSnapshotForRequestWithGovernanceService = (
  requestContext: RequestContext,
  governanceService: AdminAppSnapshotGovernanceService,
) =>
  ensureAdminAppSnapshotAccess(requestContext).pipe(
    Effect.flatMap(() =>
      buildAdminAppGovernancePreview(governanceService, requestContext),
    ),
    Effect.flatMap((governancePreview) =>
      buildAdminAppSnapshot(requestContext, governancePreview),
    ),
  );

export const getAdminAppSnapshotForRequestWithGovernanceService = (
  input: RequestContext,
  governanceService: AdminAppSnapshotGovernanceService,
) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) =>
      buildAdminAppSnapshotForRequestWithGovernanceService(
        requestContext,
        governanceService,
      ),
    ),
  );

const loadAdminGovernanceRuntime = () =>
  Effect.tryPromise({
    try: () => import("../governance/admin-governance"),
    catch: (cause) => cause,
  }).pipe(Effect.orDie);

export const getAdminAppSnapshotForRequestFromEnvironment = (
  environment: unknown,
  input: RequestContext,
) =>
  decodeRequestContext(input).pipe(
    Effect.flatMap((requestContext) =>
      loadAdminGovernanceRuntime().pipe(
        Effect.flatMap(({ runAdminGovernanceFromEnvironment }) =>
          runAdminGovernanceFromEnvironment(environment, (governanceService) =>
            buildAdminAppSnapshotForRequestWithGovernanceService(
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
  getAdminAppSnapshotForRequestFromEnvironment(
    environment,
    defaultAdminAppRequestContext,
  );
