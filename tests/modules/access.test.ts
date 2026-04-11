import { Effect } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  defineModuleFields,
  defineProjectionDescriptors,
  moduleCapability,
  permissionScope,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import {
  identitySessionFields,
  supportOperationsFields,
} from "@comvestec/config";
import {
  canModuleRequestCapability,
  getModuleCapabilityContracts,
  makeAuthorizationModule,
  makeFieldSecurityModule,
} from "@comvestec/modules";
import { organizationRequestContext, supportRequestContext } from "./_fixtures";

const fieldSecurityTestProjections = defineProjectionDescriptors(
  defineModuleFields({
    companyName: identitySessionFields.companyName,
    replyToEmail: identitySessionFields.replyToEmail,
    secretsToken: identitySessionFields.secretsToken,
  }),
  [
    {
      profile: projectionProfile.summary,
      visibleFields: [
        identitySessionFields.companyName,
        identitySessionFields.replyToEmail,
        identitySessionFields.secretsToken,
      ],
      auditedFields: [identitySessionFields.replyToEmail],
    },
  ],
);

const regulatedSensitiveProjection = defineProjectionDescriptors(
  defineModuleFields({
    companyName: supportOperationsFields.companyName,
    ssn: supportOperationsFields.ssn,
  }),
  [
    {
      profile: projectionProfile.detail,
      visibleFields: [
        supportOperationsFields.companyName,
        supportOperationsFields.ssn,
      ],
      auditedFields: [supportOperationsFields.ssn],
    },
  ],
);

describe("modules access", () => {
  it("declares module capability contracts for cross-module access", () => {
    expect(
      canModuleRequestCapability(
        platformModuleId.runtimeConfig,
        platformModuleId.tenantBranding,
        moduleCapability.effectiveValueResolution,
      ),
    ).toBe(true);
    expect(
      canModuleRequestCapability(
        platformModuleId.tenantManagement,
        platformModuleId.billingAndMetering,
        moduleCapability.effectiveValueResolution,
      ),
    ).toBe(false);
  });

  it("evaluates authorization tuples and explainability", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [
          {
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: authorizationRelation.viewer,
            subject: "usr_member_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
          },
        ],
        cacheTtlSeconds: 60,
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: organizationRequestContext,
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );
    const explanation = await Effect.runPromise(
      authorization.explain({
        requestContext: organizationRequestContext,
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    expect(decision.allowed).toBe(true);
    expect(explanation.matchedSubject).toBe("usr_member_1");
  });

  it("applies field-security projection and redaction", async () => {
    const fieldSecurity = await Effect.runPromise(makeFieldSecurityModule());

    const result = await Effect.runPromise(
      fieldSecurity.applyProjection({
        moduleId: platformModuleId.identitySession,
        requestContext: {
          actorType: actorType.anonymous,
          correlationId: "corr-public-1",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        },
        projection: {
          ...fieldSecurityTestProjections[0],
        },
        record: {
          companyName: "Acme",
          replyToEmail: "ops@acme.test",
          secrets: { token: "hidden-token" },
        },
      }),
    );

    expect(result.projectedRecord).toMatchObject({
      companyName: "Acme",
      replyToEmail: "[REDACTED]",
      secrets: { token: "[REDACTED]" },
    });
    expect(result.auditedFields).toEqual(["replyToEmail"]);
  });

  it("redacts regulated-sensitive fields for non-privileged actors", async () => {
    const fieldSecurity = await Effect.runPromise(makeFieldSecurityModule());

    const result = await Effect.runPromise(
      fieldSecurity.applyProjection({
        moduleId: platformModuleId.supportOperations,
        requestContext: organizationRequestContext,
        projection: {
          ...regulatedSensitiveProjection[0],
        },
        record: {
          companyName: "Acme",
          ssn: "123-45-6789",
        },
      }),
    );

    expect(result.projectedRecord.ssn).toBe("[REDACTED]");
    expect(result.projectedRecord.companyName).toBe("Acme");
  });

  it("denies authorization when break-glass context is expired", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
      }),
    );

    const decision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_1",
          sessionId: "sess_1",
          correlationId: "corr_expired",
          reason: "Expired break-glass test",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            enterpriseId: "ent_1",
            organizationId: "org_1",
          },
          breakGlass: {
            approvedBy: "usr_admin_1",
            reason: "Expired",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          },
        },
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    expect(decision.allowed).toBe(false);
  });

  it("evicts the oldest authorization cache entry when capacity is exceeded", async () => {
    const authorization = await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
        maxCacheSize: 1,
      }),
    );

    const activeBreakGlassContext = {
      ...supportRequestContext,
      correlationId: "corr_cache_a",
      reason: "Cache eviction regression",
      breakGlass: {
        approvedBy: "usr_admin_1",
        reason: "Cache eviction regression",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    };

    const cachedDecision = await Effect.runPromise(
      authorization.check({
        requestContext: activeBreakGlassContext,
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    expect(cachedDecision.allowed).toBe(true);

    await Effect.runPromise(
      authorization.check({
        requestContext: {
          ...organizationRequestContext,
          correlationId: "corr_cache_b",
        },
        namespace: authorizationNamespace.tenant,
        object: "org_2",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    const recomputedDecision = await Effect.runPromise(
      authorization.check({
        requestContext: {
          ...activeBreakGlassContext,
          breakGlass: {
            approvedBy: "usr_admin_1",
            reason: "Cache eviction regression",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          },
        },
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        permissionScope: permissionScope.tenantRead,
      }),
    );

    expect(recomputedDecision.allowed).toBe(false);
  });

  it("returns module capability contracts for a given module", () => {
    const contracts = getModuleCapabilityContracts(
      platformModuleId.tenantBranding,
    );

    expect(contracts.length).toBeGreaterThanOrEqual(2);
    expect(contracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromModuleId: platformModuleId.tenantBranding,
          capability: moduleCapability.publishedAssetPublication,
        }),
      ]),
    );
  });
});
