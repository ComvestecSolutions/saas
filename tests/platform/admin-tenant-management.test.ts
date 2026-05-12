import { Effect, ParseResult } from "effect";
import {
  actorType,
  onboardingStepStatus,
  authorizationNamespace,
  authorizationRelation,
  permissionScope,
  platformModuleId,
  platformScope,
  tenantMembershipMutationAction,
  tenantManagementAuditAction,
  tenantOnboardingRunStatus,
} from "@comvestec/contracts";
import {
  type AuthorizationModuleService,
  AuditLogModule,
  IdentitySessionModule,
  TenantOnboardingPostgresRepository,
} from "@comvestec/modules";
import {
  makeAdminTenantManagementService,
  OryKetoAdapter,
  resolveAdminTenantManagementRuntimeOptionsFromEnvironment,
} from "@comvestec/platform";

describe("platform admin tenant management service", () => {
  it("allows runtime option resolution when invitation email env is absent", async () => {
    await expect(
      Effect.runPromise(
        resolveAdminTenantManagementRuntimeOptionsFromEnvironment({
          APP_BASE_URL: "https://public.example",
          POSTGRES_URL:
            "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
          CONVEX_SELF_HOSTED_URL: "https://convex.example.cloud",
          CONVEX_SELF_HOSTED_SITE_URL: "https://convex.example.site",
          CONVEX_SELF_HOSTED_ADMIN_KEY: "convex-admin-key",
          KEYCLOAK_BASE_URL: "https://identity.example",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "admin-api",
          KEYCLOAK_CLIENT_SECRET: "secret",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.service",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "password",
          VALKEY_URL: "redis://127.0.0.1:6379",
          KETO_READ_URL: "http://127.0.0.1:4466",
          KETO_WRITE_URL: "http://127.0.0.1:4467",
        }),
      ),
    ).resolves.toEqual({
      postgresUrl: "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
      keycloakBaseUrl: "https://identity.example",
      keycloakRealm: "comvestec",
      keycloakClientId: "admin-api",
      keycloakClientSecret: "secret",
      convexUrl: "https://convex.example.cloud",
      convexSiteUrl: "https://convex.example.site",
      convexAdminKey: "convex-admin-key",
      keycloakConvexServiceActorUsername: "convex.service",
      keycloakConvexServiceActorPassword: "password",
      valkeyUrl: "redis://127.0.0.1:6379",
      ketoReadUrl: "http://127.0.0.1:4466",
      ketoWriteUrl: "http://127.0.0.1:4467",
    });
  });

  it("allows runtime option resolution when only APP_BASE_URL is malformed and invitation email is otherwise disabled", async () => {
    await expect(
      Effect.runPromise(
        resolveAdminTenantManagementRuntimeOptionsFromEnvironment({
          APP_BASE_URL: "not-a-valid-absolute-url",
          POSTGRES_URL:
            "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
          CONVEX_SELF_HOSTED_URL: "https://convex.example.cloud",
          CONVEX_SELF_HOSTED_SITE_URL: "https://convex.example.site",
          CONVEX_SELF_HOSTED_ADMIN_KEY: "convex-admin-key",
          KEYCLOAK_BASE_URL: "https://identity.example",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "admin-api",
          KEYCLOAK_CLIENT_SECRET: "secret",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.service",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "password",
          VALKEY_URL: "redis://127.0.0.1:6379",
          KETO_READ_URL: "http://127.0.0.1:4466",
          KETO_WRITE_URL: "http://127.0.0.1:4467",
        }),
      ),
    ).resolves.toEqual({
      postgresUrl: "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
      keycloakBaseUrl: "https://identity.example",
      keycloakRealm: "comvestec",
      keycloakClientId: "admin-api",
      keycloakClientSecret: "secret",
      convexUrl: "https://convex.example.cloud",
      convexSiteUrl: "https://convex.example.site",
      convexAdminKey: "convex-admin-key",
      keycloakConvexServiceActorUsername: "convex.service",
      keycloakConvexServiceActorPassword: "password",
      valkeyUrl: "redis://127.0.0.1:6379",
      ketoReadUrl: "http://127.0.0.1:4466",
      ketoWriteUrl: "http://127.0.0.1:4467",
    });
  });

  it("allows runtime option resolution when APP_BASE_URL is empty and invitation email is otherwise disabled", async () => {
    await expect(
      Effect.runPromise(
        resolveAdminTenantManagementRuntimeOptionsFromEnvironment({
          APP_BASE_URL: "",
          POSTGRES_URL:
            "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
          CONVEX_SELF_HOSTED_URL: "https://convex.example.cloud",
          CONVEX_SELF_HOSTED_SITE_URL: "https://convex.example.site",
          CONVEX_SELF_HOSTED_ADMIN_KEY: "convex-admin-key",
          KEYCLOAK_BASE_URL: "https://identity.example",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "admin-api",
          KEYCLOAK_CLIENT_SECRET: "secret",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.service",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "password",
          VALKEY_URL: "redis://127.0.0.1:6379",
          KETO_READ_URL: "http://127.0.0.1:4466",
          KETO_WRITE_URL: "http://127.0.0.1:4467",
        }),
      ),
    ).resolves.toEqual({
      postgresUrl: "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
      keycloakBaseUrl: "https://identity.example",
      keycloakRealm: "comvestec",
      keycloakClientId: "admin-api",
      keycloakClientSecret: "secret",
      convexUrl: "https://convex.example.cloud",
      convexSiteUrl: "https://convex.example.site",
      convexAdminKey: "convex-admin-key",
      keycloakConvexServiceActorUsername: "convex.service",
      keycloakConvexServiceActorPassword: "password",
      valkeyUrl: "redis://127.0.0.1:6379",
      ketoReadUrl: "http://127.0.0.1:4466",
      ketoWriteUrl: "http://127.0.0.1:4467",
    });
  });

  it("fails runtime option resolution when invitation email env is only partially configured", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        resolveAdminTenantManagementRuntimeOptionsFromEnvironment({
          APP_BASE_URL: "https://public.example",
          POSTGRES_URL:
            "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
          CONVEX_SELF_HOSTED_URL: "https://convex.example.cloud",
          CONVEX_SELF_HOSTED_SITE_URL: "https://convex.example.site",
          CONVEX_SELF_HOSTED_ADMIN_KEY: "convex-admin-key",
          KEYCLOAK_BASE_URL: "https://identity.example",
          KEYCLOAK_REALM: "comvestec",
          KEYCLOAK_CLIENT_ID: "admin-api",
          KEYCLOAK_CLIENT_SECRET: "secret",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: "convex.service",
          KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: "password",
          VALKEY_URL: "redis://127.0.0.1:6379",
          KETO_READ_URL: "http://127.0.0.1:4466",
          KETO_WRITE_URL: "http://127.0.0.1:4467",
          POSTAL_API_URL: "http://127.0.0.1:5000",
        }),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
  });

  it("grants tenant membership relations for authorized platform operators and records an audit event", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_membership_mutation",
      correlationId: "corr_admin_tenant_membership_mutation",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const tuples = new Map([
      [
        JSON.stringify([
          authorizationNamespace.tenant,
          "org_1",
          authorizationRelation.member,
          "usr_member_org_1",
        ]),
        {
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.member,
          subject: "usr_member_org_1",
        },
      ],
      [
        JSON.stringify([
          authorizationNamespace.tenant,
          "org_1",
          authorizationRelation.viewer,
          "usr_member_org_1",
        ]),
        {
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
          subject: "usr_member_org_1",
        },
      ],
    ]);
    const buildTupleKey = (input: {
      readonly namespace: string;
      readonly object: string;
      readonly relation: string;
      readonly subject: string;
    }) =>
      JSON.stringify([
        input.namespace,
        input.object,
        input.relation,
        input.subject,
      ]);
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-membership-mutation:org_1",
        reason: "Allowed to manage tenant memberships.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const listTuples = vi.fn(
      ({ relation, subject }: { relation: string; subject?: string }) =>
        Effect.succeed(
          [...tuples.values()].filter(
            (tuple) =>
              tuple.object === "org_1" &&
              tuple.relation === relation &&
              (subject === undefined || tuple.subject === subject),
          ),
        ),
    );
    const writeTuple = vi.fn((tuple) => {
      tuples.set(buildTupleKey(tuple), tuple);

      return Effect.succeed(tuple);
    });
    const deleteTuple = vi.fn((tuple) => {
      tuples.delete(buildTupleKey(tuple));

      return Effect.succeed(tuple);
    });
    const getOnboardingRunByTenant = vi.fn(() => Effect.die("unexpected"));
    const appendAuditEvent = vi.fn(() =>
      Effect.succeed({
        eventId: "evt_tenant_membership_granted",
        timestamp: "2026-05-02T11:35:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: requestContext.tenant.scope,
        tenantScopeId: requestContext.tenant.scopeId,
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.membershipGranted,
        target: "organization:org_1:memberships:usr_member_org_1:admin",
        correlationId: requestContext.correlationId,
        reason: "Grant admin access for recovery.",
      }),
    );
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant,
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple,
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.mutateTenantMembership({
        sessionId: "sess_admin_tenant_membership_mutation",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        subject: "usr_member_org_1",
        relation: authorizationRelation.admin,
        action: tenantMembershipMutationAction.grant,
        mutationReason: "  Grant admin access for recovery.  ",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      subject: "usr_member_org_1",
      relation: authorizationRelation.admin,
      action: tenantMembershipMutationAction.grant,
      changed: true,
      membership: {
        subject: "usr_member_org_1",
        relations: [
          authorizationRelation.admin,
          authorizationRelation.member,
          authorizationRelation.viewer,
        ],
      },
    });
    expect(authorizationCheck).toHaveBeenCalledWith({
      requestContext,
      namespace: authorizationNamespace.tenant,
      object: "org_1",
      relation: authorizationRelation.admin,
      permissionScope: permissionScope.memberManage,
    });
    expect(writeTuple).toHaveBeenCalledWith({
      namespace: authorizationNamespace.tenant,
      object: "org_1",
      relation: authorizationRelation.admin,
      subject: "usr_member_org_1",
    });
    expect(deleteTuple).not.toHaveBeenCalled();
    expect(appendAuditEvent).toHaveBeenCalledWith({
      requestContext: {
        ...requestContext,
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
      },
      moduleId: platformModuleId.tenantManagement,
      action: tenantManagementAuditAction.membershipGranted,
      target: "organization:org_1:memberships:usr_member_org_1:admin",
      reason: "Grant admin access for recovery.",
    });
  });

  it("revokes tenant membership relations for authorized platform operators and records an audit event", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_membership_revoke",
      correlationId: "corr_admin_tenant_membership_revoke",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const tuples = new Map([
      [
        JSON.stringify([
          authorizationNamespace.tenant,
          "org_1",
          authorizationRelation.admin,
          "usr_member_org_1",
        ]),
        {
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.admin,
          subject: "usr_member_org_1",
        },
      ],
      [
        JSON.stringify([
          authorizationNamespace.tenant,
          "org_1",
          authorizationRelation.member,
          "usr_member_org_1",
        ]),
        {
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.member,
          subject: "usr_member_org_1",
        },
      ],
      [
        JSON.stringify([
          authorizationNamespace.tenant,
          "org_1",
          authorizationRelation.viewer,
          "usr_member_org_1",
        ]),
        {
          namespace: authorizationNamespace.tenant,
          object: "org_1",
          relation: authorizationRelation.viewer,
          subject: "usr_member_org_1",
        },
      ],
    ]);
    const buildTupleKey = (input: {
      readonly namespace: string;
      readonly object: string;
      readonly relation: string;
      readonly subject: string;
    }) =>
      JSON.stringify([
        input.namespace,
        input.object,
        input.relation,
        input.subject,
      ]);
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-membership-revoke:org_1",
        reason: "Allowed to manage tenant memberships.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const listTuples = vi.fn(
      ({ relation, subject }: { relation: string; subject?: string }) =>
        Effect.succeed(
          [...tuples.values()].filter(
            (tuple) =>
              tuple.object === "org_1" &&
              tuple.relation === relation &&
              (subject === undefined || tuple.subject === subject),
          ),
        ),
    );
    const writeTuple = vi.fn((tuple) => {
      tuples.set(buildTupleKey(tuple), tuple);

      return Effect.succeed(tuple);
    });
    const deleteTuple = vi.fn((tuple) => {
      tuples.delete(buildTupleKey(tuple));

      return Effect.succeed(tuple);
    });
    const getOnboardingRunByTenant = vi.fn(() => Effect.die("unexpected"));
    const appendAuditEvent = vi.fn(() =>
      Effect.succeed({
        eventId: "evt_tenant_membership_revoked",
        timestamp: "2026-05-02T11:40:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: requestContext.tenant.scope,
        tenantScopeId: requestContext.tenant.scopeId,
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.membershipRevoked,
        target: "organization:org_1:memberships:usr_member_org_1:admin",
        correlationId: requestContext.correlationId,
        reason: "Revoke stale admin access.",
      }),
    );
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant,
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple,
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.mutateTenantMembership({
        sessionId: "sess_admin_tenant_membership_revoke",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        subject: "usr_member_org_1",
        relation: authorizationRelation.admin,
        action: tenantMembershipMutationAction.revoke,
        mutationReason: "Revoke stale admin access.",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      subject: "usr_member_org_1",
      relation: authorizationRelation.admin,
      action: tenantMembershipMutationAction.revoke,
      changed: true,
      membership: {
        subject: "usr_member_org_1",
        relations: [authorizationRelation.member, authorizationRelation.viewer],
      },
    });
    expect(deleteTuple).toHaveBeenCalledWith({
      namespace: authorizationNamespace.tenant,
      object: "org_1",
      relation: authorizationRelation.admin,
      subject: "usr_member_org_1",
    });
    expect(writeTuple).not.toHaveBeenCalled();
    expect(appendAuditEvent).toHaveBeenCalledWith({
      requestContext: {
        ...requestContext,
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
      },
      moduleId: platformModuleId.tenantManagement,
      action: tenantManagementAuditAction.membershipRevoked,
      target: "organization:org_1:memberships:usr_member_org_1:admin",
      reason: "Revoke stale admin access.",
    });
  });

  it("returns changed false and skips writes for no-op tenant membership mutations", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_membership_noop",
      correlationId: "corr_admin_tenant_membership_noop",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const tuples = [
      {
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.member,
        subject: "usr_member_org_1",
      },
      {
        namespace: authorizationNamespace.tenant,
        object: "org_1",
        relation: authorizationRelation.viewer,
        subject: "usr_member_org_1",
      },
    ] as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-membership-noop:org_1",
        reason: "Allowed to manage tenant memberships.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const listTuples = vi.fn(
      ({ relation, subject }: { relation: string; subject?: string }) =>
        Effect.succeed(
          tuples.filter(
            (tuple) =>
              tuple.object === "org_1" &&
              tuple.relation === relation &&
              (subject === undefined || tuple.subject === subject),
          ),
        ),
    );
    const writeTuple = vi.fn((tuple) => Effect.succeed(tuple));
    const deleteTuple = vi.fn((tuple) => Effect.succeed(tuple));
    const getOnboardingRunByTenant = vi.fn(() => Effect.die("unexpected"));
    const appendAuditEvent = vi.fn(() => Effect.die("unexpected"));
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant,
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple,
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.mutateTenantMembership({
        sessionId: "sess_admin_tenant_membership_noop",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        subject: "usr_member_org_1",
        relation: authorizationRelation.member,
        action: tenantMembershipMutationAction.grant,
        mutationReason: "Member relation already present.",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      subject: "usr_member_org_1",
      relation: authorizationRelation.member,
      action: tenantMembershipMutationAction.grant,
      changed: false,
      membership: {
        subject: "usr_member_org_1",
        relations: [authorizationRelation.member, authorizationRelation.viewer],
      },
    });
    expect(writeTuple).not.toHaveBeenCalled();
    expect(deleteTuple).not.toHaveBeenCalled();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });

  it("lists tenant memberships for authorized platform operators and records an audit event", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_memberships",
      correlationId: "corr_admin_tenant_memberships",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-memberships:org_1",
        reason: "Allowed to inspect tenant memberships.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const listTuples = vi.fn(({ relation }: { relation: string }) =>
      Effect.succeed(
        relation === authorizationRelation.owner
          ? [
              {
                namespace: authorizationNamespace.tenant,
                object: "org_1",
                relation,
                subject: "usr_owner_org_1",
              },
            ]
          : relation === authorizationRelation.member
            ? [
                {
                  namespace: authorizationNamespace.tenant,
                  object: "org_1",
                  relation,
                  subject: "usr_member_org_1",
                },
              ]
            : relation === authorizationRelation.viewer
              ? [
                  {
                    namespace: authorizationNamespace.tenant,
                    object: "org_1",
                    relation,
                    subject: "usr_member_org_1",
                  },
                  {
                    namespace: authorizationNamespace.tenant,
                    object: "org_1",
                    relation,
                    subject: "usr_owner_org_1",
                  },
                ]
              : [],
      ),
    );
    const getOnboardingRunByTenant = vi.fn(() => Effect.die("unexpected"));
    const appendAuditEvent = vi.fn(() =>
      Effect.succeed({
        eventId: "evt_tenant_membership_inspection",
        timestamp: "2026-05-02T07:05:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: requestContext.tenant.scope,
        tenantScopeId: requestContext.tenant.scopeId,
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.membershipsInspected,
        target: "organization:org_1:memberships",
        correlationId: requestContext.correlationId,
        reason: "Investigate current memberships",
      }),
    );
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant,
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.listTenantMemberships({
        sessionId: "sess_admin_tenant_memberships",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        inspectionReason: "  Investigate current memberships  ",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      memberships: [
        {
          subject: "usr_member_org_1",
          relations: [
            authorizationRelation.member,
            authorizationRelation.viewer,
          ],
        },
        {
          subject: "usr_owner_org_1",
          relations: [
            authorizationRelation.owner,
            authorizationRelation.viewer,
          ],
        },
      ],
    });
    expect(listTuples).toHaveBeenCalledTimes(5);
    expect(appendAuditEvent).toHaveBeenCalledWith({
      requestContext: {
        ...requestContext,
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
      },
      moduleId: platformModuleId.tenantManagement,
      action: tenantManagementAuditAction.membershipsInspected,
      target: "organization:org_1:memberships",
      reason: "Investigate current memberships",
    });
  });

  it("reviews tenant onboarding for authorized platform operators and records an audit event", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_onboarding",
      correlationId: "corr_admin_tenant_onboarding",
      reason: "Investigate tenant onboarding state",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const reviewRun = {
      runId: "onboarding:org_1:latest",
      triggeredBy: "usr_owner_org_1",
      correlationId: "corr_onboarding_org_1",
      status: tenantOnboardingRunStatus.inProgress,
      currentStepId: "team-invites",
      startedAt: "2026-05-02T07:10:00.000Z",
      steps: [
        {
          stepId: "tenant-profile",
          label: "Create tenant profile and confirm primary owner.",
          status: onboardingStepStatus.completed,
          retryCount: 0,
        },
        {
          stepId: "team-invites",
          label: "Invite core team members and assign roles.",
          status: onboardingStepStatus.inProgress,
          retryCount: 0,
          requiredModuleId: platformModuleId.tenantManagement,
        },
      ],
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-review:org_1",
        reason: "Allowed to inspect tenant onboarding state.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getOnboardingRunByTenant = vi.fn(() => Effect.succeed(reviewRun));
    const appendAuditEvent = vi.fn(() =>
      Effect.succeed({
        eventId: "evt_tenant_onboarding_review",
        timestamp: "2026-05-02T07:12:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: requestContext.tenant.scope,
        tenantScopeId: requestContext.tenant.scopeId,
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.onboardingInspected,
        target: "organization:org_1:onboarding-state",
        correlationId: requestContext.correlationId,
        reason: "Investigate stuck onboarding",
      }),
    );
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant,
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(
          OryKetoAdapter,
          {} as unknown as OryKetoAdapter["Type"],
        ),
      ),
    );

    const result = await Effect.runPromise(
      service.reviewTenantOnboarding({
        sessionId: "sess_admin_tenant_onboarding",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        inspectionReason: "  Investigate stuck onboarding  ",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      run: reviewRun,
    });
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_tenant_onboarding",
    });
    expect(authorizationCheck).toHaveBeenCalledWith({
      requestContext,
      namespace: authorizationNamespace.tenant,
      object: "org_1",
      relation: authorizationRelation.viewer,
      permissionScope: permissionScope.tenantRead,
    });
    expect(getOnboardingRunByTenant).toHaveBeenCalledWith({
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
    });
    expect(appendAuditEvent).toHaveBeenCalledWith({
      requestContext: {
        ...requestContext,
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
      },
      moduleId: platformModuleId.tenantManagement,
      action: tenantManagementAuditAction.onboardingInspected,
      target: "organization:org_1:onboarding-state",
      reason: "Investigate stuck onboarding",
    });
  });

  it("rejects onboarding review when tenant-read authorization is denied for the reviewed tenant", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_onboarding_denied",
      correlationId: "corr_admin_tenant_onboarding_denied",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: false,
        cacheKey: "tenant-review:org_2",
        reason: "Denied delegated tenant-read access for this operator.",
        auditRequired: true,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getOnboardingRunByTenant = vi.fn(() => Effect.die("unexpected"));
    const appendAuditEvent = vi.fn(() => Effect.die("unexpected"));
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant,
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(
          OryKetoAdapter,
          {} as unknown as OryKetoAdapter["Type"],
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.reviewTenantOnboarding({
          sessionId: "sess_admin_tenant_onboarding_denied",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_2",
            organizationId: "org_2",
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminTenantManagementAccessDeniedError",
        reason: "Denied delegated tenant-read access for this operator.",
        auditRequired: true,
      },
    });
    expect(getOnboardingRunByTenant).not.toHaveBeenCalled();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects onboarding review when the trusted session is not a platform-operator context", async () => {
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-review:org_1",
        reason: "Allowed to inspect tenant onboarding state.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_support_operator",
        correlationId: "corr_support_operator",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_support",
          organizationId: "org_support",
        },
      }),
    );
    const getOnboardingRunByTenant = vi.fn(() => Effect.succeed(undefined));
    const appendAuditEvent = vi.fn(() =>
      Effect.succeed({
        eventId: "evt_should_not_happen",
        timestamp: "2026-05-02T07:20:00.000Z",
        actorId: "usr_support_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_support",
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.onboardingInspected,
        target: "organization:org_1:onboarding-state",
        correlationId: "corr_support_operator",
      }),
    );
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant,
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(
          OryKetoAdapter,
          {} as unknown as OryKetoAdapter["Type"],
        ),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        service.reviewTenantOnboarding({
          sessionId: "sess_support_operator",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            organizationId: "org_1",
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminTenantManagementAccessDeniedError",
        reason:
          "Admin tenant management operations require a platform-operator session scoped to the platform tenant.",
        auditRequired: false,
      },
    });
    expect(authorizationCheck).not.toHaveBeenCalled();
    expect(getOnboardingRunByTenant).not.toHaveBeenCalled();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });
});
