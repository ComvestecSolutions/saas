import { Effect } from "effect";
import { tenantBrandingFeatureFlag } from "@comvestec/config";
import {
  actorType,
  customDomainLifecycleState,
  dataClassification,
  managedFileUsage,
  type ManagedFileRecord,
  type ManagedFileSummaryView,
  platformModuleId,
  platformScope,
  runtimeResolutionSource,
  tenantBrandingAssetKind,
  tenantBrandingAuditAction,
  tenantBrandingConfigKey,
  type RequestContext,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  type AuditLogModuleService,
  type AuthorizationModuleService,
  BillingStatePostgresRepository,
  type BillingStatePostgresRepositoryService,
  FileStorageModule,
  type FileStorageModuleService,
  IdentitySessionModule,
  type IdentitySessionModuleService,
  type RuntimeConfigModuleService,
  makeRuntimeConfigModule,
  RuntimeConfigModule,
  TenantBrandingModule,
  type TenantBrandingModuleService,
} from "@comvestec/modules";
import {
  organizationRequestContext,
  supportRequestContext,
} from "../modules/_fixtures";
import {
  makeTenantBrandingService,
  type TenantBrandingAccessDeniedError,
} from "../../packages/platform/src/services/domains/tenant-branding";

const managedBrandingAssetFileId = `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_logo_1`;
const platformBrandingAssetFileId = `${platformModuleId.fileStorage}:${platformScope.platform}:platform:file_logo_platform`;
const platformOperatorRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_1",
  sessionId: "sess_platform_1",
  correlationId: "corr_tenant_branding_platform_1",
  tenant: {
    scope: platformScope.platform,
    scopeId: "platform",
  },
};

const createIdentitySessionServiceDouble = (
  requestContext: RequestContext,
): IdentitySessionModuleService => ({
  startAuthentication: () =>
    Effect.die(new Error("Unexpected identity session start call.")),
  completeAuthentication: () =>
    Effect.die(new Error("Unexpected identity session completion call.")),
  completePlatformOperatorAuthentication: () =>
    Effect.die(
      new Error(
        "Unexpected platform-operator identity session completion call.",
      ),
    ),
  invalidateSession: () =>
    Effect.die(new Error("Unexpected identity session invalidation call.")),
  resolveRequestContext: () => Effect.succeed(requestContext),
});

const createAuthorizationServiceDouble = (input?: {
  readonly onCheck?: AuthorizationModuleService["check"];
}): Pick<AuthorizationModuleService, "check"> => ({
  check:
    input?.onCheck ??
    (() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "branding:manage",
        reason: "allowed",
        auditRequired: false,
      })),
});

const createAuditLogServiceDouble = (input?: {
  readonly appendedActions?: string[];
  readonly appendedTargets?: string[];
  readonly onAppend?: AuditLogModuleService["append"];
}): AuditLogModuleService => ({
  append:
    input?.onAppend ??
    ((request) => {
      input?.appendedActions?.push(request.action);
      input?.appendedTargets?.push(request.target);

      return Effect.succeed({
        eventId: `${request.moduleId}:${request.action}:${request.requestContext.correlationId}`,
        timestamp: "2026-05-04T12:00:00.000Z",
        actorId:
          request.requestContext.actorId ??
          `${request.requestContext.actorType}:anonymous`,
        tenantScope: request.requestContext.tenant.scope,
        tenantScopeId: request.requestContext.tenant.scopeId,
        moduleId: request.moduleId,
        action: request.action,
        target: request.target,
        ...(request.reason !== undefined ? { reason: request.reason } : {}),
        correlationId: request.requestContext.correlationId,
      });
    }),
  queryByModule: () => Effect.succeed([]),
  queryByTarget: () => Effect.succeed([]),
  queryByActor: () => Effect.succeed([]),
  queryByTenant: () => Effect.succeed([]),
  requirements: Effect.succeed([]),
});

const createTenantBrandingEntitlement = (
  featureKey:
    | typeof tenantBrandingFeatureFlag.enabled
    | typeof tenantBrandingFeatureFlag.customDomain,
  tenant: {
    readonly scope:
      | typeof platformScope.platform
      | typeof platformScope.organization
      | typeof platformScope.enterprise;
    readonly scopeId: string;
  } = {
    scope: platformScope.organization,
    scopeId: "org_1",
  },
) => ({
  entitlementId: `entitlement:${featureKey}`,
  moduleId: platformModuleId.tenantBranding,
  featureKey,
  scope: tenant.scope,
  scopeId: tenant.scopeId,
  active: true,
  grantedAt: "2026-05-04T12:00:00.000Z",
});

const createBillingStateRepositoryDouble = (
  entitlements: readonly ReturnType<
    typeof createTenantBrandingEntitlement
  >[] = [
    createTenantBrandingEntitlement(tenantBrandingFeatureFlag.enabled),
    createTenantBrandingEntitlement(tenantBrandingFeatureFlag.customDomain),
  ],
): BillingStatePostgresRepositoryService => ({
  getTenantAccessState: () =>
    Effect.succeed({
      entitlements,
      invoiceHistory: [],
    }),
});

const createRuntimeConfigService = async () => {
  const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());
  const overrides: Array<Parameters<typeof runtimeConfig.upsertOverride>[0]> =
    [];

  return {
    ...runtimeConfig,
    listOverridesByModule: (
      moduleId: Parameters<
        RuntimeConfigModuleService["listOverridesByModule"]
      >[0],
    ) =>
      Effect.succeed(
        overrides.filter((override) => override.moduleId === moduleId),
      ),
    upsertOverride: (
      override: Parameters<RuntimeConfigModuleService["upsertOverride"]>[0],
    ) => {
      const existingIndex = overrides.findIndex(
        (entry) =>
          entry.moduleId === override.moduleId &&
          entry.key === override.key &&
          entry.scope === override.scope &&
          entry.scopeId === override.scopeId,
      );

      if (existingIndex === -1) {
        overrides.push(override);
      } else {
        overrides[existingIndex] = override;
      }

      return Effect.succeed(override);
    },
  };
};

const createFileStorageModuleDouble = (input?: {
  readonly managedFileRecord?: ManagedFileRecord;
  readonly onGetManagedFileRecord?: FileStorageModuleService["getManagedFileRecord"];
  readonly recordRequests?: Array<
    Parameters<FileStorageModuleService["getManagedFileRecord"]>[0]
  >;
  readonly listManagedFilesResult?: readonly ManagedFileSummaryView[];
  readonly listRequests?: Array<
    Parameters<FileStorageModuleService["listManagedFiles"]>[0]
  >;
}): FileStorageModuleService => ({
  requestManagedFileUploadUrl: () =>
    Effect.die(new Error("Unexpected upload reservation request.")),
  registerManagedFile: () =>
    Effect.die(new Error("Unexpected managed file registration.")),
  getManagedFileRecord:
    input?.onGetManagedFileRecord ??
    ((request) => {
      input?.recordRequests?.push(request);

      return Effect.succeed(
        input?.managedFileRecord ??
          ({
            fileId: managedBrandingAssetFileId,
            scope: platformScope.organization,
            scopeId: "org_1",
            storageId: "storage_logo_1",
            fileName: "logo.svg",
            contentType: "image/svg+xml",
            sizeBytes: 2048,
            classification: dataClassification.public,
            usage: managedFileUsage.brandingAsset,
            uploadedBy: supportRequestContext.actorId,
            uploadedAt: "2026-05-04T12:00:00.000Z",
          } satisfies ManagedFileRecord),
      );
    }),
  listManagedFiles: (request) => {
    input?.listRequests?.push(request);

    return Effect.succeed(
      input?.listManagedFilesResult ?? [
        {
          fileId: managedBrandingAssetFileId,
          fileName: "logo.svg",
          contentType: "image/svg+xml",
          sizeBytes: 2048,
        } satisfies ManagedFileSummaryView,
      ],
    );
  },
  resolveManagedFileDownload: () =>
    Effect.die(new Error("Unexpected managed file download resolution.")),
  deleteManagedFile: () =>
    Effect.die(new Error("Unexpected managed file delete.")),
});

const createTenantBrandingModuleDouble = (input?: {
  readonly onResolveBranding?: TenantBrandingModuleService["resolveBranding"];
  readonly onFindCurrentCustomDomainVerification?: TenantBrandingModuleService["findCurrentCustomDomainVerification"];
  readonly onFindCustomDomainVerification?: TenantBrandingModuleService["findCustomDomainVerification"];
  readonly onRequestCustomDomainVerification?: TenantBrandingModuleService["requestCustomDomainVerification"];
  readonly onUpdateCustomDomainVerification?: TenantBrandingModuleService["updateCustomDomainVerification"];
}): TenantBrandingModuleService => ({
  resolveBranding:
    input?.onResolveBranding ??
    ((request) =>
      Effect.succeed({
        publicProjection: {
          companyName:
            (request.values[tenantBrandingConfigKey.companyName] as
              | string
              | undefined) ?? "Platform brand fallback",
          themeTokens: {
            primary: "#0F172A",
            secondary: "#334155",
            accent: "#0EA5E9",
          },
          effectiveScope: request.requestContext.tenant.scope,
          entitled: request.entitled,
        },
        adminProjection: {
          companyName:
            (request.values[tenantBrandingConfigKey.companyName] as
              | string
              | undefined) ?? "Platform brand fallback",
          themeTokens: {
            primary: "#0F172A",
            secondary: "#334155",
            accent: "#0EA5E9",
          },
          customDomainStatus: customDomainLifecycleState.unverified,
          effectiveScope: request.requestContext.tenant.scope,
          entitled: request.entitled,
        },
      })),
  buildIdentityHandoff: () =>
    Effect.die(new Error("Unexpected identity handoff call.")),
  findCurrentCustomDomainVerification:
    input?.onFindCurrentCustomDomainVerification ??
    (() => Effect.succeed(undefined)),
  findCustomDomainVerification:
    input?.onFindCustomDomainVerification ?? (() => Effect.succeed(undefined)),
  requestCustomDomainVerification:
    input?.onRequestCustomDomainVerification ??
    ((request) =>
      Effect.succeed({
        verificationId:
          "tenant-branding:custom-domain:organization:org_1:verification_1",
        scope: request.scope,
        scopeId: request.scopeId,
        requestedHost: request.requestedHost.toLowerCase(),
        lifecycleState: customDomainLifecycleState.unverified,
        changedAt: "2026-05-04T12:00:00.000Z",
      })),
  updateCustomDomainVerification:
    input?.onUpdateCustomDomainVerification ??
    ((record) => Effect.succeed(record)),
});

describe("platform tenant-branding admin service", () => {
  it("requests tenant custom-domain verification for operator sessions", async () => {
    const appendedActions: string[] = [];
    const appendedTargets: string[] = [];
    const authorizationObjects: string[] = [];
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble({
          onCheck: (input) => {
            authorizationObjects.push(input.object);

            return Effect.succeed({
              allowed: true,
              cacheKey: "branding:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            appendedActions,
            appendedTargets,
          }),
        ),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble(),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      service.requestCustomDomainVerification({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        requestedHost: "Brand.Acme.Example",
      }),
    );

    expect(authorizationObjects).toEqual([
      `${platformModuleId.tenantBranding}:organization:org_1`,
    ]);
    expect(appendedActions).toEqual([
      tenantBrandingAuditAction.customDomainRequested,
    ]);
    expect(appendedTargets).toEqual([
      `${platformModuleId.tenantBranding}:organization:org_1:custom-domain:tenant-branding:custom-domain:organization:org_1:verification_1`,
    ]);
    expect(result).toMatchObject({
      verificationId:
        "tenant-branding:custom-domain:organization:org_1:verification_1",
      scope: platformScope.organization,
      scopeId: "org_1",
      requestedHost: "brand.acme.example",
      lifecycleState: customDomainLifecycleState.unverified,
      changedAt: "2026-05-04T12:00:00.000Z",
    });
  });

  it("resolves a tenant-branding support-safe view for operator sessions", async () => {
    const runtimeConfig = await createRuntimeConfigService();

    await Effect.runPromise(
      runtimeConfig.upsertOverride({
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "Acme Org",
        source: "runtime-override",
        changedBy: "usr_admin_1",
        changedAt: "2026-05-04T12:10:00.000Z",
      }),
    );

    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble(),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble({
            onFindCurrentCustomDomainVerification: () =>
              Effect.succeed({
                verificationId:
                  "tenant-branding:custom-domain:organization:org_1:verification_current",
                scope: platformScope.organization,
                scopeId: "org_1",
                requestedHost: "brand.acme.example",
                lifecycleState: customDomainLifecycleState.verifying,
                changedAt: "2026-05-04T12:05:00.000Z",
              }),
          }),
        ),
      ),
    );

    const result = await Effect.runPromise(
      service.getSupportSafeView({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );

    expect(result).toEqual({
      scope: platformScope.organization,
      scopeId: "org_1",
      companyName: "Acme Org",
      customDomainStatus: customDomainLifecycleState.verifying,
      effectiveScope: platformScope.organization,
      changedAt: "2026-05-04T12:10:00.000Z",
    });
  });
  it("preserves enterprise tenant lineage for break-glass organization requests", async () => {
    const seenBillingTenants: RequestContext["tenant"][] = [];
    const runtimeConfig = await createRuntimeConfigService();
    const breakGlassEnterpriseRequestContext: RequestContext = {
      ...supportRequestContext,
      tenant: {
        scope: platformScope.enterprise,
        scopeId: "ent_1",
        enterpriseId: "ent_1",
      },
      breakGlass: {
        approvedBy: "usr_admin_1",
        reason: "Investigate organization branding inheritance",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    };
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(BillingStatePostgresRepository, {
          getTenantAccessState: (tenant) => {
            seenBillingTenants.push(tenant);

            return Effect.succeed({
              entitlements:
                tenant.enterpriseId === "ent_1"
                  ? [
                      createTenantBrandingEntitlement(
                        tenantBrandingFeatureFlag.enabled,
                        {
                          scope: platformScope.enterprise,
                          scopeId: "ent_1",
                        },
                      ),
                      createTenantBrandingEntitlement(
                        tenantBrandingFeatureFlag.customDomain,
                        {
                          scope: platformScope.enterprise,
                          scopeId: "ent_1",
                        },
                      ),
                    ]
                  : [],
              invoiceHistory: [],
            });
          },
        }),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(
            breakGlassEnterpriseRequestContext,
          ),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      service.requestCustomDomainVerification({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        requestedHost: "brand.acme.example",
      }),
    );

    expect(seenBillingTenants).toEqual([
      {
        scope: platformScope.organization,
        scopeId: "org_1",
        enterpriseId: "ent_1",
        organizationId: "org_1",
      },
    ]);
    expect(result).toMatchObject({
      scope: platformScope.organization,
      scopeId: "org_1",
      requestedHost: "brand.acme.example",
    });
  });

  it("treats duplicate tenant custom-domain requests as idempotent retries when the durable record already exists", async () => {
    const appendedActions: string[] = [];
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            appendedActions,
          }),
        ),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble(),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble({
            onFindCustomDomainVerification: () =>
              Effect.succeed({
                verificationId:
                  "tenant-branding:custom-domain:organization:org_1:verification_existing",
                scope: platformScope.organization,
                scopeId: "org_1",
                requestedHost: "brand.acme.example",
                lifecycleState: customDomainLifecycleState.unverified,
                changedAt: "2026-05-04T12:05:00.000Z",
              }),
            onRequestCustomDomainVerification: () =>
              Effect.fail({
                _tag: "TenantBrandingDomainVerificationAlreadyExistsError",
                scope: platformScope.organization,
                scopeId: "org_1",
                requestedHost: "brand.acme.example",
              } as const),
          }),
        ),
      ),
    );

    const result = await Effect.runPromise(
      service.requestCustomDomainVerification({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        requestedHost: "brand.acme.example",
      }),
    );

    expect(appendedActions).toEqual([
      tenantBrandingAuditAction.customDomainRequested,
    ]);
    expect(result).toMatchObject({
      verificationId:
        "tenant-branding:custom-domain:organization:org_1:verification_existing",
      scope: platformScope.organization,
      scopeId: "org_1",
      requestedHost: "brand.acme.example",
      lifecycleState: customDomainLifecycleState.unverified,
      changedAt: "2026-05-04T12:05:00.000Z",
    });
  });

  it("does not recover retired custom-domain verifications during duplicate retries", async () => {
    const appendedActions: string[] = [];
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            appendedActions,
          }),
        ),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble(),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble({
            onFindCustomDomainVerification: () =>
              Effect.succeed({
                verificationId:
                  "tenant-branding:custom-domain:organization:org_1:verification_retired",
                scope: platformScope.organization,
                scopeId: "org_1",
                requestedHost: "brand.acme.example",
                lifecycleState: customDomainLifecycleState.retired,
                changedAt: "2026-05-03T12:05:00.000Z",
              }),
            onRequestCustomDomainVerification: () =>
              Effect.fail({
                _tag: "TenantBrandingDomainVerificationAlreadyExistsError",
                scope: platformScope.organization,
                scopeId: "org_1",
                requestedHost: "brand.acme.example",
              } as const),
          }),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          service.requestCustomDomainVerification({
            sessionId: "sess_support_1",
            scope: platformScope.organization,
            scopeId: "org_1",
            requestedHost: "brand.acme.example",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "TenantBrandingDomainVerificationAlreadyExistsError",
      scope: platformScope.organization,
      scopeId: "org_1",
      requestedHost: "brand.acme.example",
    });
    expect(appendedActions).toEqual([]);
  });

  it("publishes tenant-branding asset references for operator sessions", async () => {
    const appendedActions: string[] = [];
    const appendedTargets: string[] = [];
    const recordRequests: Array<
      Parameters<FileStorageModuleService["getManagedFileRecord"]>[0]
    > = [];
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            appendedActions,
            appendedTargets,
          }),
        ),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble(),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            recordRequests,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      service.publishAssetReference({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        assetKind: tenantBrandingAssetKind.logo,
        fileId: managedBrandingAssetFileId,
      }),
    );
    const overrides = await Effect.runPromise(
      runtimeConfig.listOverridesByModule(platformModuleId.tenantBranding),
    );

    expect(recordRequests).toEqual([
      {
        fileId: managedBrandingAssetFileId,
      },
    ]);
    expect(appendedActions).toEqual([tenantBrandingAuditAction.assetPublished]);
    expect(appendedTargets).toEqual([
      `${platformModuleId.tenantBranding}:organization:org_1:asset:logo`,
    ]);
    expect(result).toMatchObject({
      scope: platformScope.organization,
      scopeId: "org_1",
      assetKind: tenantBrandingAssetKind.logo,
      fileId: managedBrandingAssetFileId,
    });
    expect(overrides).toEqual([
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.logoAssetId,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: managedBrandingAssetFileId,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: supportRequestContext.actorId,
        changedAt: result.changedAt,
      },
    ]);
  });

  it("keeps tenant-branding asset publication successful when the post-commit audit append fails", async () => {
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(
          AuditLogModule,
          createAuditLogServiceDouble({
            onAppend: () =>
              Effect.fail({
                _tag: "AuditLogPostgresRepositoryPersistenceError",
                operation: "insertAuditEvent",
                cause: new Error("Audit insert unavailable."),
              } as const),
          }),
        ),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble(),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      service.publishAssetReference({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        assetKind: tenantBrandingAssetKind.logo,
        fileId: managedBrandingAssetFileId,
      }),
    );
    const overrides = await Effect.runPromise(
      runtimeConfig.listOverridesByModule(platformModuleId.tenantBranding),
    );

    expect(result).toMatchObject({
      scope: platformScope.organization,
      scopeId: "org_1",
      assetKind: tenantBrandingAssetKind.logo,
      fileId: managedBrandingAssetFileId,
    });
    expect(overrides).toEqual([
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.logoAssetId,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: managedBrandingAssetFileId,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: supportRequestContext.actorId,
        changedAt: result.changedAt,
      },
    ]);
  });

  it("publishes tenant-branding assets without requiring the custom-domain entitlement", async () => {
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble([
            createTenantBrandingEntitlement(tenantBrandingFeatureFlag.enabled),
          ]),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      service.publishAssetReference({
        sessionId: "sess_support_1",
        scope: platformScope.organization,
        scopeId: "org_1",
        assetKind: tenantBrandingAssetKind.logo,
        fileId: managedBrandingAssetFileId,
      }),
    );

    expect(result).toMatchObject({
      scope: platformScope.organization,
      scopeId: "org_1",
      assetKind: tenantBrandingAssetKind.logo,
      fileId: managedBrandingAssetFileId,
    });
  });

  it("publishes platform-scope tenant-branding asset references", async () => {
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble([
            createTenantBrandingEntitlement(tenantBrandingFeatureFlag.enabled, {
              scope: platformScope.platform,
              scopeId: "platform",
            }),
          ]),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            managedFileRecord: {
              fileId: platformBrandingAssetFileId,
              scope: platformScope.platform,
              scopeId: "platform",
              storageId: "storage_logo_platform_1",
              fileName: "platform-logo.svg",
              contentType: "image/svg+xml",
              sizeBytes: 2048,
              classification: dataClassification.public,
              usage: managedFileUsage.brandingAsset,
              uploadedBy: "usr_platform_1",
              uploadedAt: "2026-05-04T12:00:00.000Z",
            } satisfies ManagedFileRecord,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(platformOperatorRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      service.publishAssetReference({
        sessionId: "sess_platform_1",
        scope: platformScope.platform,
        scopeId: "platform",
        assetKind: tenantBrandingAssetKind.favicon,
        fileId: platformBrandingAssetFileId,
      }),
    );

    expect(result).toMatchObject({
      scope: platformScope.platform,
      scopeId: "platform",
      assetKind: tenantBrandingAssetKind.favicon,
      fileId: platformBrandingAssetFileId,
    });
  });

  it("rejects non-branding managed files for tenant-branding asset publication", async () => {
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble(),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            managedFileRecord: {
              fileId: managedBrandingAssetFileId,
              scope: platformScope.organization,
              scopeId: "org_1",
              storageId: "storage_logo_1",
              fileName: "notes.txt",
              contentType: "text/plain",
              sizeBytes: 512,
              classification: dataClassification.public,
              usage: managedFileUsage.standard,
              uploadedBy: supportRequestContext.actorId,
              uploadedAt: "2026-05-04T12:00:00.000Z",
            } satisfies ManagedFileRecord,
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          service.publishAssetReference({
            sessionId: "sess_support_1",
            scope: platformScope.organization,
            scopeId: "org_1",
            assetKind: tenantBrandingAssetKind.logo,
            fileId: managedBrandingAssetFileId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "TenantBrandingManagedAssetInvalidError",
      scope: platformScope.organization,
      scopeId: "org_1",
      assetKind: tenantBrandingAssetKind.logo,
      fileId: managedBrandingAssetFileId,
    });
  });

  it("rejects tenant-branding asset publication when the managed asset is missing", async () => {
    const missingFileId = `${platformModuleId.fileStorage}:${platformScope.organization}:org_1:file_missing`;
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble(),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble({
            onGetManagedFileRecord: () =>
              Effect.fail({
                _tag: "FileStorageFileNotFoundError",
                fileId: missingFileId,
              } as const),
          }),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    await expect(
      Effect.runPromise(
        Effect.flip(
          service.publishAssetReference({
            sessionId: "sess_support_1",
            scope: platformScope.organization,
            scopeId: "org_1",
            assetKind: tenantBrandingAssetKind.favicon,
            fileId: missingFileId,
          }),
        ),
      ),
    ).resolves.toMatchObject({
      _tag: "TenantBrandingManagedAssetNotFoundError",
      scope: platformScope.organization,
      scopeId: "org_1",
      assetKind: tenantBrandingAssetKind.favicon,
      fileId: missingFileId,
    });
  });

  it("denies cross-tenant custom-domain requests without break-glass", async () => {
    let authorizationChecks = 0;
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble({
          onCheck: () => {
            authorizationChecks += 1;

            return Effect.succeed({
              allowed: true,
              cacheKey: "branding:manage",
              reason: "allowed",
              auditRequired: false,
            });
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble(),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.requestCustomDomainVerification({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_2",
          requestedHost: "brand.other.example",
        }),
      ),
    );

    expect(authorizationChecks).toBe(0);
    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "TenantBrandingAccessDeniedError",
        actorType: supportRequestContext.actorType,
      } satisfies TenantBrandingAccessDeniedError,
    });
  });

  it("denies non-operator actors from requesting tenant custom domains", async () => {
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble(),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(organizationRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.requestCustomDomainVerification({
          sessionId: "sess_member_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          requestedHost: "brand.acme.example",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "TenantBrandingAccessDeniedError",
        actorType: organizationRequestContext.actorType,
      } satisfies TenantBrandingAccessDeniedError,
    });
  });

  it("denies custom-domain requests when the tenant is not entitled to custom domains", async () => {
    const runtimeConfig = await createRuntimeConfigService();
    const service = await Effect.runPromise(
      makeTenantBrandingService({
        authorization: createAuthorizationServiceDouble(),
      }).pipe(
        Effect.provideService(AuditLogModule, createAuditLogServiceDouble()),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepositoryDouble([
            createTenantBrandingEntitlement(tenantBrandingFeatureFlag.enabled),
          ]),
        ),
        Effect.provideService(
          FileStorageModule,
          createFileStorageModuleDouble(),
        ),
        Effect.provideService(
          IdentitySessionModule,
          createIdentitySessionServiceDouble(supportRequestContext),
        ),
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          TenantBrandingModule,
          createTenantBrandingModuleDouble(),
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.requestCustomDomainVerification({
          sessionId: "sess_support_1",
          scope: platformScope.organization,
          scopeId: "org_1",
          requestedHost: "brand.acme.example",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "TenantBrandingFeatureDisabledError",
        scope: platformScope.organization,
        scopeId: "org_1",
        key: tenantBrandingFeatureFlag.customDomain,
      },
    });
  });
});
