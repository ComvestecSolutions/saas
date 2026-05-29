import {
  customDomainLifecycleState,
  platformScope,
  tenantBrandingAssetKind,
} from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  isLocalBackendE2eFeatureFlagsReady,
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ||
  !isLocalBackendE2eFeatureFlagsReady()
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e admin tenant branding transport", () => {
  const environment = localBackendE2eEnvironment!;

  const runAdminTenantBrandingProbe = () =>
    runBackendE2eBunProbe<{
      readonly bodyOnlyRequestStatus: number;
      readonly bodyOnlyRequestBody: {
        readonly error: string;
      };
      readonly requestCustomDomainStatus: number;
      readonly requestCustomDomainBody: {
        readonly verificationId: string;
        readonly scope: string;
        readonly scopeId: string;
        readonly requestedHost: string;
        readonly lifecycleState: string;
        readonly changedAt: string;
      };
      readonly registerManagedFileStatus: number;
      readonly registerManagedFileBody: {
        readonly fileId: string;
        readonly fileName: string;
        readonly contentType: string;
        readonly sizeBytes: number;
      };
      readonly publishAssetStatus: number;
      readonly publishAssetBody: {
        readonly scope: string;
        readonly scopeId: string;
        readonly assetKind: string;
        readonly fileId: string;
        readonly changedAt: string;
      };
      readonly transitionVerificationStatus: number;
      readonly transitionVerificationBody: {
        readonly verificationId: string;
        readonly scope: string;
        readonly scopeId: string;
        readonly requestedHost: string;
        readonly lifecycleState: string;
        readonly changedAt: string;
      };
      readonly supportSafeViewStatus: number;
      readonly supportSafeViewBody: {
        readonly scope: string;
        readonly scopeId: string;
        readonly companyName: string;
        readonly customDomainStatus: string;
        readonly effectiveScope: string;
        readonly changedAt?: string;
      };
      readonly supportSafeViewKeys: readonly string[];
      readonly crossTenantSupportSafeViewStatus: number;
      readonly crossTenantSupportSafeViewBody: {
        readonly error: string;
      };
    }>(
      `import { fileStorageFeatureFlag, tenantBrandingFeatureFlag } from '@comvestec/config';
import { Effect } from 'effect';
import { waitForOryKetoTuple } from './tests/platform/backend-e2e/_shared/wait-for-ory-keto-tuple.ts';
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  customDomainLifecycleState,
  dataClassification,
  managedFileUsage,
  platformModuleId,
  platformScope,
  tenantBrandingAssetKind,
} from '@comvestec/contracts';
import {
  billingEntitlementsTable,
  makeRuntimeConfigModule,
  makeRuntimeConfigPostgresRepository,
} from '@comvestec/modules';
import {
  adminTenantBrandingApiPath,
  fileStorageApiPath,
  makeOryKetoAdapter,
  makePostgresAdapter,
  makeValkeyAdapter,
  subscriberJourneySessionHeaderName,
} from '@comvestec/platform';
import { createBackendApiRequestHandler } from '@comvestec/platform/http';

const runStep = async (label, operation, timeoutMs = 15000) => {
  let timeoutHandle;

  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(label + ' timed out after ' + timeoutMs + 'ms.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

const encodeSha256Hex = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', value);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
};

const runId = Date.now().toString();
const actorId = 'usr_backend_e2e_tenant_branding_operator';
const homeTenantScopeId = 'org_backend_e2e_tenant_branding_home_' + runId;
const targetTenantScopeId = 'org_backend_e2e_tenant_branding_target_' + runId;
const sessionId = 'sess_backend_e2e_tenant_branding_' + runId;
const requestedHost = 'Brand-' + runId + '.Example.COM';
const assetBytes = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="#0EA5E9" /></svg>',
);
const assetSha256 = await encodeSha256Hex(assetBytes);
const reason = 'Validate admin tenant-branding backend route family';
const brandingAuthorizationObject =
  platformModuleId.tenantBranding +
  ':' +
  platformScope.organization +
  ':' +
  homeTenantScopeId;
const fileAuthorizationObject = [
  authorizationNamespace.file,
  platformScope.organization,
  homeTenantScopeId,
].join(':');

const valkey = await Effect.runPromise(
  makeValkeyAdapter({ url: process.env.VALKEY_URL }),
);
await Effect.runPromise(
  valkey.writeSession({
    sessionId,
    requestContext: {
      actorType: actorType.supportOperator,
      actorId,
      sessionId,
      correlationId: 'corr_backend_e2e_tenant_branding_' + runId,
      reason,
      tenant: {
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        organizationId: homeTenantScopeId,
      },
    },
  }),
);
await Effect.runPromise(Effect.ignore(valkey.close));

const oryKeto = await Effect.runPromise(
  makeOryKetoAdapter({
    readUrl: process.env.KETO_READ_URL,
    writeUrl: process.env.KETO_WRITE_URL,
  }),
);
await Effect.runPromise(
  oryKeto.writeTuple({
    namespace: authorizationNamespace.brandingProfile,
    object: brandingAuthorizationObject,
    relation: authorizationRelation.admin,
    subject: actorId,
  }),
);
await waitForOryKetoTuple({
  oryKeto,
  tuple: {
    namespace: authorizationNamespace.brandingProfile,
    object: brandingAuthorizationObject,
    relation: authorizationRelation.admin,
    subject: actorId,
  },
});
await Effect.runPromise(
  oryKeto.writeTuple({
    namespace: authorizationNamespace.file,
    object: fileAuthorizationObject,
    relation: authorizationRelation.editor,
    subject: actorId,
  }),
);
await waitForOryKetoTuple({
  oryKeto,
  tuple: {
    namespace: authorizationNamespace.file,
    object: fileAuthorizationObject,
    relation: authorizationRelation.editor,
    subject: actorId,
  },
});
await Effect.runPromise(
  oryKeto.writeTuple({
    namespace: authorizationNamespace.file,
    object: fileAuthorizationObject,
    relation: authorizationRelation.viewer,
    subject: actorId,
  }),
);
await waitForOryKetoTuple({
  oryKeto,
  tuple: {
    namespace: authorizationNamespace.file,
    object: fileAuthorizationObject,
    relation: authorizationRelation.viewer,
    subject: actorId,
  },
});

const postgres = await Effect.runPromise(
  makePostgresAdapter({
    connectionString: process.env.POSTGRES_URL,
  }),
);
await postgres.database.insert(billingEntitlementsTable).values([
  {
    entitlementId:
      'tenant-branding-enabled:' + homeTenantScopeId + ':' + runId,
    moduleId: platformModuleId.tenantBranding,
    featureKey: tenantBrandingFeatureFlag.enabled,
    scope: platformScope.organization,
    scopeId: homeTenantScopeId,
    active: true,
    grantedAt: new Date(),
  },
  {
    entitlementId:
      'tenant-branding-custom-domain:' + homeTenantScopeId + ':' + runId,
    moduleId: platformModuleId.tenantBranding,
    featureKey: tenantBrandingFeatureFlag.customDomain,
    scope: platformScope.organization,
    scopeId: homeTenantScopeId,
    active: true,
    grantedAt: new Date(),
  },
]);
const runtimeConfigRepository = await Effect.runPromise(
  makeRuntimeConfigPostgresRepository(postgres.database),
);
const runtimeConfig = await Effect.runPromise(
  makeRuntimeConfigModule(runtimeConfigRepository),
);
const runtimeConfigChangedAt = new Date().toISOString();
await Effect.runPromise(
  runtimeConfig.upsertOverride({
    moduleId: platformModuleId.fileStorage,
    key: fileStorageFeatureFlag.enabled,
    scope: platformScope.platform,
    scopeId: platformScope.platform,
    value: true,
    source: 'runtime-override',
    changedBy: actorId,
    changedAt: runtimeConfigChangedAt,
  }),
);
await Effect.runPromise(
  runtimeConfig.upsertOverride({
    moduleId: platformModuleId.tenantBranding,
    key: tenantBrandingFeatureFlag.enabled,
    scope: platformScope.organization,
    scopeId: homeTenantScopeId,
    value: true,
    source: 'runtime-override',
    changedBy: actorId,
    changedAt: runtimeConfigChangedAt,
  }),
);
await Effect.runPromise(
  runtimeConfig.upsertOverride({
    moduleId: platformModuleId.tenantBranding,
    key: tenantBrandingFeatureFlag.customDomain,
    scope: platformScope.organization,
    scopeId: homeTenantScopeId,
    value: true,
    source: 'runtime-override',
    changedBy: actorId,
    changedAt: runtimeConfigChangedAt,
  }),
);

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const bodyOnlyRequestResponse = await runStep(
    'tenant branding request custom domain with body-only session id',
    fetch(new URL(adminTenantBrandingApiPath.requestCustomDomainVerification, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        requestedHost,
      }),
    }),
  );
  const requestCustomDomainResponse = await runStep(
    'tenant branding request custom domain',
    fetch(new URL(adminTenantBrandingApiPath.requestCustomDomainVerification, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        requestedHost,
      }),
    }),
  );
  const requestUploadUrlResponse = await runStep(
    'file storage request upload url for branding asset',
    fetch(new URL(fileStorageApiPath.requestUploadUrl, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        sizeBytes: assetBytes.byteLength,
        sha256: assetSha256,
      }),
    }),
  );
  const requestUploadUrlBody = await requestUploadUrlResponse.json();
  const uploadBlobResponse = await runStep(
    'file storage upload branding asset blob',
    fetch(requestUploadUrlBody.uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/svg+xml',
      },
      body: assetBytes,
    }),
  );
  const uploadBlobBody = await uploadBlobResponse.json();
  const registerManagedFileResponse = await runStep(
    'file storage register branding asset',
    fetch(new URL(fileStorageApiPath.registerManagedFile, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        uploadToken: requestUploadUrlBody.uploadToken,
        storageId: uploadBlobBody.storageId,
        fileName: 'tenant-branding-logo-' + runId + '.svg',
        contentType: 'image/svg+xml',
        sizeBytes: assetBytes.byteLength,
        classification: dataClassification.public,
        usage: managedFileUsage.brandingAsset,
      }),
    }),
  );
  const registerManagedFileBody = await registerManagedFileResponse.json();
  const publishAssetResponse = await runStep(
    'tenant branding publish asset reference',
    fetch(new URL(adminTenantBrandingApiPath.publishAssetReference, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        assetKind: tenantBrandingAssetKind.logo,
        fileId: registerManagedFileBody.fileId,
      }),
    }),
  );
  const transitionVerificationResponse = await runStep(
    'tenant branding transition current verification',
    fetch(new URL(adminTenantBrandingApiPath.transitionCurrentCustomDomainVerification, baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [subscriberJourneySessionHeaderName]: sessionId,
      },
      body: JSON.stringify({
        scope: platformScope.organization,
        scopeId: homeTenantScopeId,
        lifecycleState: customDomainLifecycleState.active,
        approvalNotes: 'Backend e2e approved tenant custom domain.',
      }),
    }),
  );
  const supportSafeViewUrl = new URL(
    adminTenantBrandingApiPath.getSupportSafeView,
    baseUrl,
  );
  supportSafeViewUrl.searchParams.set('scope', platformScope.organization);
  supportSafeViewUrl.searchParams.set('scopeId', homeTenantScopeId);
  const supportSafeViewResponse = await runStep(
    'tenant branding support-safe view',
    fetch(supportSafeViewUrl, {
      method: 'GET',
      headers: {
        [subscriberJourneySessionHeaderName]: sessionId,
      },
    }),
  );
  const crossTenantSupportSafeViewUrl = new URL(
    adminTenantBrandingApiPath.getSupportSafeView,
    baseUrl,
  );
  crossTenantSupportSafeViewUrl.searchParams.set('scope', platformScope.organization);
  crossTenantSupportSafeViewUrl.searchParams.set('scopeId', targetTenantScopeId);
  const crossTenantSupportSafeViewResponse = await runStep(
    'tenant branding cross-tenant support-safe view without break glass',
    fetch(crossTenantSupportSafeViewUrl, {
      method: 'GET',
      headers: {
        [subscriberJourneySessionHeaderName]: sessionId,
      },
    }),
  );

  const supportSafeViewBody = await supportSafeViewResponse.json();

  console.log(JSON.stringify({
    bodyOnlyRequestStatus: bodyOnlyRequestResponse.status,
    bodyOnlyRequestBody: await bodyOnlyRequestResponse.json(),
    requestCustomDomainStatus: requestCustomDomainResponse.status,
    requestCustomDomainBody: await requestCustomDomainResponse.json(),
    registerManagedFileStatus: registerManagedFileResponse.status,
    registerManagedFileBody,
    publishAssetStatus: publishAssetResponse.status,
    publishAssetBody: await publishAssetResponse.json(),
    transitionVerificationStatus: transitionVerificationResponse.status,
    transitionVerificationBody: await transitionVerificationResponse.json(),
    supportSafeViewStatus: supportSafeViewResponse.status,
    supportSafeViewBody,
    supportSafeViewKeys: Object.keys(supportSafeViewBody).sort(),
    crossTenantSupportSafeViewStatus: crossTenantSupportSafeViewResponse.status,
    crossTenantSupportSafeViewBody:
      await crossTenantSupportSafeViewResponse.json(),
  }));
} finally {
  server.stop(true);
  await Effect.runPromise(Effect.ignore(postgres.close));
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 60_000,
      },
    );

  it("round-trips admin tenant-branding routes over real HTTP while enforcing trusted-session and tenant boundaries", () => {
    const probe = runAdminTenantBrandingProbe();

    expect(probe.bodyOnlyRequestStatus).toBe(401);
    expect(probe.bodyOnlyRequestBody).toEqual({
      error: "Authenticated operator session is required.",
    });

    expect(probe.requestCustomDomainStatus).toBe(201);
    expect(probe.requestCustomDomainBody).toEqual(
      expect.objectContaining({
        verificationId: expect.stringContaining(
          "tenant-branding:custom-domain:organization:",
        ),
        scope: platformScope.organization,
        scopeId: expect.stringContaining(
          "org_backend_e2e_tenant_branding_home_",
        ),
        requestedHost: expect.stringContaining(".example.com"),
        lifecycleState: customDomainLifecycleState.unverified,
        changedAt: expect.any(String),
      }),
    );
    expect(probe.requestCustomDomainBody.requestedHost).toBe(
      probe.requestCustomDomainBody.requestedHost.toLowerCase(),
    );

    expect(probe.registerManagedFileStatus).toBe(201);
    expect(probe.registerManagedFileBody).toEqual(
      expect.objectContaining({
        fileId: expect.stringContaining(
          `${platformScope.organization}:org_backend_e2e_tenant_branding_home_`,
        ),
        fileName: expect.stringContaining("tenant-branding-logo-"),
        contentType: "image/svg+xml",
        sizeBytes: expect.any(Number),
      }),
    );

    expect(probe.publishAssetStatus).toBe(200);
    expect(probe.publishAssetBody).toEqual(
      expect.objectContaining({
        scope: platformScope.organization,
        scopeId: probe.requestCustomDomainBody.scopeId,
        assetKind: tenantBrandingAssetKind.logo,
        fileId: probe.registerManagedFileBody.fileId,
        changedAt: expect.any(String),
      }),
    );

    expect(probe.transitionVerificationStatus).toBe(200);
    expect(probe.transitionVerificationBody).toEqual(
      expect.objectContaining({
        verificationId: probe.requestCustomDomainBody.verificationId,
        scope: platformScope.organization,
        scopeId: probe.requestCustomDomainBody.scopeId,
        requestedHost: probe.requestCustomDomainBody.requestedHost,
        lifecycleState: customDomainLifecycleState.active,
        changedAt: expect.any(String),
      }),
    );

    expect(probe.supportSafeViewStatus).toBe(200);
    expect(probe.supportSafeViewBody).toEqual(
      expect.objectContaining({
        scope: platformScope.organization,
        scopeId: probe.requestCustomDomainBody.scopeId,
        companyName: expect.any(String),
        customDomainStatus: customDomainLifecycleState.active,
        effectiveScope: platformScope.organization,
        changedAt: probe.transitionVerificationBody.changedAt,
      }),
    );
    expect(probe.supportSafeViewKeys).toEqual(
      expect.arrayContaining([
        "changedAt",
        "companyName",
        "customDomainStatus",
        "effectiveScope",
        "scope",
        "scopeId",
      ]),
    );
    expect(probe.supportSafeViewKeys).not.toContain("requestedHost");
    expect(probe.supportSafeViewKeys).not.toContain("fileId");

    expect(probe.crossTenantSupportSafeViewStatus).toBe(403);
    expect(probe.crossTenantSupportSafeViewBody).toEqual({
      error: "Tenant branding management is not allowed for this session.",
    });
  }, 75_000);
});
