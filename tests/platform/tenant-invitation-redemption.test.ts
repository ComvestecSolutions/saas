import {
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import { Effect } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  platformModuleId,
  platformScope,
  runtimeResolutionSource,
  tenantMembershipRelations,
  tenantManagementAuditAction,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  BillingStatePostgresRepository,
  IdentitySessionModule,
  makeRuntimeConfigModule,
  platformBrandFallbackCompanyName,
  type RuntimeConfigOverrideRecord,
  RuntimeConfigModule,
  TenantInvitationPostgresRepository,
} from "@comvestec/modules";
import {
  makeTenantInvitationRedemptionService,
  OryKetoAdapter,
  type TenantInvitationRedemptionService,
} from "@comvestec/platform";

const unexpectedEffect = <A>() =>
  Effect.die(new Error("Unexpected tenant invitation redemption test call."));

const pendingInvitationExpiresAt = new Date(
  Date.now() + 365 * 24 * 60 * 60 * 1_000,
).toISOString();

const expectedTenantBrandingProjection = {
  companyName: "Acme",
  themeTokens: {
    primary: "#111827",
    secondary: "#334155",
    accent: "#0EA5E9",
  },
  effectiveScope: platformScope.organization,
  entitled: true,
} as const;

const expectedPlatformFallbackBrandingProjection = {
  companyName: platformBrandFallbackCompanyName,
  themeTokens: {
    primary: "#0F172A",
    secondary: "#334155",
    accent: "#0EA5E9",
  },
  effectiveScope: platformScope.platform,
  entitled: false,
} as const;

const defaultTenantBrandingOverrides = [
  {
    moduleId: platformModuleId.tenantBranding,
    key: tenantBrandingConfigKey.companyName,
    scope: platformScope.organization,
    scopeId: "org_1",
    value: expectedTenantBrandingProjection.companyName,
    source: runtimeResolutionSource.runtimeOverride,
    changedBy: "usr_support_operator",
    changedAt: "2026-05-04T12:00:00.000Z",
  },
  {
    moduleId: platformModuleId.tenantBranding,
    key: tenantBrandingConfigKey.themePrimary,
    scope: platformScope.organization,
    scopeId: "org_1",
    value: expectedTenantBrandingProjection.themeTokens.primary,
    source: runtimeResolutionSource.runtimeOverride,
    changedBy: "usr_support_operator",
    changedAt: "2026-05-04T12:00:00.000Z",
  },
] satisfies readonly RuntimeConfigOverrideRecord[];

const createTenantBrandingEntitlement = (
  featureKey: (typeof tenantBrandingFeatureFlag)[keyof typeof tenantBrandingFeatureFlag],
) => ({
  entitlementId: `entitlement:${featureKey}`,
  moduleId: platformModuleId.tenantBranding,
  featureKey,
  scope: platformScope.organization,
  scopeId: "org_1",
  active: true,
  grantedAt: "2026-05-04T12:00:00.000Z",
});

const createBillingStateRepository = (
  entitlements: readonly ReturnType<
    typeof createTenantBrandingEntitlement
  >[] = [createTenantBrandingEntitlement(tenantBrandingFeatureFlag.enabled)],
): BillingStatePostgresRepository["Type"] => ({
  getTenantAccessState: () =>
    Effect.succeed({
      entitlements,
      invoiceHistory: [],
    }),
});

const createRuntimeConfigService = async (
  overrides: readonly RuntimeConfigOverrideRecord[] = defaultTenantBrandingOverrides,
): Promise<RuntimeConfigModule["Type"]> => {
  const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

  return {
    ...runtimeConfig,
    listOverridesByModule: (moduleId) =>
      Effect.succeed(
        overrides.filter((override) => override.moduleId === moduleId),
      ),
  };
};

const createTenantInvitationRedemptionServiceForTest = async (
  effect: Effect.Effect<
    TenantInvitationRedemptionService,
    never,
    BillingStatePostgresRepository | RuntimeConfigModule
  >,
  input?: {
    readonly overrides?: readonly RuntimeConfigOverrideRecord[];
    readonly billingState?: BillingStatePostgresRepository["Type"];
    readonly runtimeConfig?: RuntimeConfigModule["Type"];
  },
) => {
  const runtimeConfig =
    input?.runtimeConfig ??
    (await createRuntimeConfigService(input?.overrides));
  const billingState = input?.billingState ?? createBillingStateRepository();

  return Effect.runPromise(
    effect.pipe(
      Effect.provideService(BillingStatePostgresRepository, billingState),
      Effect.provideService(RuntimeConfigModule, runtimeConfig),
    ),
  );
};

describe("platform tenant invitation redemption service", () => {
  it("redeems a pending tenant invitation token and grants the invited relation once", async () => {
    const requestContext = {
      actorType: actorType.organizationMember,
      actorId: "usr_member_1",
      sessionId: "sess_tenant_invitation_redeem",
      correlationId: "corr_tenant_invitation_redeem",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_home",
        organizationId: "org_home",
      },
    } as const;
    const tuples: Array<{
      readonly subject: string;
      readonly relation: typeof authorizationRelation.admin;
    }> = [];
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationByTokenHash = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
      }),
    );
    const redeemInvitation = vi.fn((input) =>
      Effect.succeed({
        invitationId: input.invitationId,
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "redeemed" as const,
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        redeemedAt: input.redeemedAt,
        redeemedBy: input.redeemedBy,
      }),
    );
    const appendAuditEvent = vi.fn((_input) =>
      Effect.succeed({
        eventId: "evt_tenant_invitation_redeemed",
        timestamp: "2026-05-02T12:30:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.invitationRedeemed,
        target: "organization:org_1:invitations:invite_org_1_admin_1",
        correlationId: requestContext.correlationId,
      }),
    );
    const persistRedeemedInvitation = vi.fn((input) =>
      redeemInvitation({
        tenantScope: input.invitation.tenantScope,
        tenantScopeId: input.invitation.tenantScopeId,
        invitationId: input.invitation.invitationId,
        redeemedBy: input.redeemedBy,
        redeemedAt: input.redeemedAt,
      }).pipe(
        Effect.flatMap((record) =>
          appendAuditEvent(input.auditInput).pipe(Effect.as(record)),
        ),
      ),
    );
    const listTuples = vi.fn(({ relation, subject }) =>
      Effect.succeed(
        tuples
          .filter(
            (tuple) => tuple.relation === relation && tuple.subject === subject,
          )
          .map((tuple) => ({
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: tuple.relation,
            subject: tuple.subject,
          })),
      ),
    );
    const writeTuple = vi.fn((tuple) => {
      tuples.push({
        subject: tuple.subject,
        relation: tuple.relation,
      });

      return Effect.succeed(undefined);
    });
    const service = await createTenantInvitationRedemptionServiceForTest(
      makeTenantInvitationRedemptionService({
        persistRedeemedInvitation,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantInvitationPostgresRepository, {
          getInvitationByTokenHash,
          redeemInvitation,
        } as unknown as TenantInvitationPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.redeemTenantInvitation({
        sessionId: "sess_tenant_invitation_redeem",
        invitationToken: "tmiv_pending_token",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      invitationId: "invite_org_1_admin_1",
      relation: authorizationRelation.admin,
      membershipChanged: true,
      membership: {
        subject: "usr_member_1",
        relations: [authorizationRelation.admin],
      },
      branding: expectedTenantBrandingProjection,
    });
    expect(writeTuple).toHaveBeenCalledWith({
      namespace: authorizationNamespace.tenant,
      object: "org_1",
      relation: authorizationRelation.admin,
      subject: "usr_member_1",
    });
    expect(redeemInvitation).toHaveBeenCalledWith({
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      invitationId: "invite_org_1_admin_1",
      redeemedBy: "usr_member_1",
      redeemedAt: expect.any(String),
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
      action: tenantManagementAuditAction.invitationRedeemed,
      target: "organization:org_1:invitations:invite_org_1_admin_1",
    });
  });

  it("does not reread membership after the tuple grant before redeem persistence", async () => {
    const requestContext = {
      actorType: actorType.organizationMember,
      actorId: "usr_member_1",
      sessionId: "sess_tenant_invitation_redeem_no_reread",
      correlationId: "corr_tenant_invitation_redeem_no_reread",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_home",
        organizationId: "org_home",
      },
    } as const;
    const tuples: Array<{
      readonly subject: string;
      readonly relation: typeof authorizationRelation.admin;
    }> = [];
    let listTupleCalls = 0;
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationByTokenHash = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
      }),
    );
    const redeemInvitation = vi.fn((input) =>
      Effect.succeed({
        invitationId: input.invitationId,
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "redeemed" as const,
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        redeemedAt: input.redeemedAt,
        redeemedBy: input.redeemedBy,
      }),
    );
    const appendAuditEvent = vi.fn((_input) =>
      Effect.succeed({
        eventId: "evt_tenant_invitation_redeemed_no_reread",
        timestamp: "2026-05-02T12:30:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.invitationRedeemed,
        target: "organization:org_1:invitations:invite_org_1_admin_1",
        correlationId: requestContext.correlationId,
      }),
    );
    const persistRedeemedInvitation = vi.fn((input) =>
      redeemInvitation({
        tenantScope: input.invitation.tenantScope,
        tenantScopeId: input.invitation.tenantScopeId,
        invitationId: input.invitation.invitationId,
        redeemedBy: input.redeemedBy,
        redeemedAt: input.redeemedAt,
      }).pipe(
        Effect.flatMap((record) =>
          appendAuditEvent(input.auditInput).pipe(Effect.as(record)),
        ),
      ),
    );
    const listTuples = vi.fn(({ relation, subject }) => {
      listTupleCalls += 1;

      if (listTupleCalls > tenantMembershipRelations.length) {
        return Effect.die(
          new Error("Membership should not be reread after the tuple grant."),
        );
      }

      return Effect.succeed(
        tuples
          .filter(
            (tuple) => tuple.relation === relation && tuple.subject === subject,
          )
          .map((tuple) => ({
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: tuple.relation,
            subject: tuple.subject,
          })),
      );
    });
    const writeTuple = vi.fn((tuple) => {
      tuples.push({
        subject: tuple.subject,
        relation: tuple.relation,
      });

      return Effect.succeed(undefined);
    });
    const service = await createTenantInvitationRedemptionServiceForTest(
      makeTenantInvitationRedemptionService({
        persistRedeemedInvitation,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantInvitationPostgresRepository, {
          getInvitationByTokenHash,
          redeemInvitation,
        } as unknown as TenantInvitationPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.redeemTenantInvitation({
        sessionId: "sess_tenant_invitation_redeem_no_reread",
        invitationToken: "tmiv_pending_token_no_reread",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      invitationId: "invite_org_1_admin_1",
      relation: authorizationRelation.admin,
      membershipChanged: true,
      membership: {
        subject: "usr_member_1",
        relations: [authorizationRelation.admin],
      },
      branding: expectedTenantBrandingProjection,
    });
    expect(listTuples).toHaveBeenCalledTimes(tenantMembershipRelations.length);
  });

  it("falls back to platform branding when the post-redemption branding read fails", async () => {
    const requestContext = {
      actorType: actorType.organizationMember,
      actorId: "usr_member_1",
      sessionId: "sess_tenant_invitation_redeem_branding_fallback",
      correlationId: "corr_tenant_invitation_redeem_branding_fallback",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_home",
        organizationId: "org_home",
      },
    } as const;
    const tuples: Array<{
      readonly subject: string;
      readonly relation: typeof authorizationRelation.admin;
    }> = [];
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationByTokenHash = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
      }),
    );
    const redeemInvitation = vi.fn((input) =>
      Effect.succeed({
        invitationId: input.invitationId,
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "redeemed" as const,
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        redeemedAt: input.redeemedAt,
        redeemedBy: input.redeemedBy,
      }),
    );
    const appendAuditEvent = vi.fn((_input) =>
      Effect.succeed({
        eventId: "evt_tenant_invitation_redeemed_branding_fallback",
        timestamp: "2026-05-02T12:30:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.invitationRedeemed,
        target: "organization:org_1:invitations:invite_org_1_admin_1",
        correlationId: requestContext.correlationId,
      }),
    );
    const persistRedeemedInvitation = vi.fn((input) =>
      redeemInvitation({
        tenantScope: input.invitation.tenantScope,
        tenantScopeId: input.invitation.tenantScopeId,
        invitationId: input.invitation.invitationId,
        redeemedBy: input.redeemedBy,
        redeemedAt: input.redeemedAt,
      }).pipe(
        Effect.flatMap((record) =>
          appendAuditEvent(input.auditInput).pipe(Effect.as(record)),
        ),
      ),
    );
    const listTuples = vi.fn(({ relation, subject }) =>
      Effect.succeed(
        tuples
          .filter(
            (tuple) => tuple.relation === relation && tuple.subject === subject,
          )
          .map((tuple) => ({
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: tuple.relation,
            subject: tuple.subject,
          })),
      ),
    );
    const writeTuple = vi.fn((tuple) => {
      tuples.push({
        subject: tuple.subject,
        relation: tuple.relation,
      });

      return Effect.succeed(undefined);
    });
    const getTenantAccessState = vi.fn(() =>
      Effect.fail({
        _tag: "BillingStatePostgresRepositoryQueryError",
        operation: "getTenantAccessState",
        cause: new Error("Branding read unavailable."),
      } as const),
    );
    const service = await createTenantInvitationRedemptionServiceForTest(
      makeTenantInvitationRedemptionService({
        persistRedeemedInvitation,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantInvitationPostgresRepository, {
          getInvitationByTokenHash,
          redeemInvitation,
        } as unknown as TenantInvitationPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
      {
        billingState: {
          getTenantAccessState,
        } as BillingStatePostgresRepository["Type"],
      },
    );

    const result = await Effect.runPromise(
      service.redeemTenantInvitation({
        sessionId: "sess_tenant_invitation_redeem_branding_fallback",
        invitationToken: "tmiv_pending_token_branding_fallback",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      invitationId: "invite_org_1_admin_1",
      relation: authorizationRelation.admin,
      membershipChanged: true,
      membership: {
        subject: "usr_member_1",
        relations: [authorizationRelation.admin],
      },
      branding: expectedPlatformFallbackBrandingProjection,
    });
    expect(getTenantAccessState).toHaveBeenCalledTimes(1);
  });

  it("does not grant membership when transactional audit persistence fails during redemption", async () => {
    const requestContext = {
      actorType: actorType.organizationMember,
      actorId: "usr_member_1",
      sessionId: "sess_tenant_invitation_redeem_audit_failure",
      correlationId: "corr_tenant_invitation_redeem_audit_failure",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_home",
        organizationId: "org_home",
      },
    } as const;
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationByTokenHash = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
      }),
    );
    const redeemInvitation = vi.fn((input) =>
      Effect.succeed({
        invitationId: input.invitationId,
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "redeemed" as const,
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        redeemedAt: input.redeemedAt,
        redeemedBy: input.redeemedBy,
      }),
    );
    const appendAuditEvent = vi.fn((_input) =>
      Effect.fail({
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
        cause: new Error("Audit persistence unavailable."),
      } as const),
    );
    const persistRedeemedInvitation = vi.fn((input) =>
      redeemInvitation({
        tenantScope: input.invitation.tenantScope,
        tenantScopeId: input.invitation.tenantScopeId,
        invitationId: input.invitation.invitationId,
        redeemedBy: input.redeemedBy,
        redeemedAt: input.redeemedAt,
      }).pipe(
        Effect.flatMap((record) =>
          appendAuditEvent(input.auditInput).pipe(Effect.as(record)),
        ),
      ),
    );
    const tuples: Array<{
      readonly subject: string;
      readonly relation: typeof authorizationRelation.admin;
    }> = [];
    const getInvitationById = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
      }),
    );
    const listTuples = vi.fn(({ relation, subject }) =>
      Effect.succeed(
        tuples
          .filter(
            (tuple) => tuple.relation === relation && tuple.subject === subject,
          )
          .map((tuple) => ({
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: tuple.relation,
            subject: tuple.subject,
          })),
      ),
    );
    const writeTuple = vi.fn((tuple) => {
      tuples.push({
        subject: tuple.subject,
        relation: tuple.relation,
      });

      return Effect.succeed(undefined);
    });
    const deleteTuple = vi.fn((tuple) => {
      const tupleIndex = tuples.findIndex(
        (currentTuple) =>
          currentTuple.subject === tuple.subject &&
          currentTuple.relation === tuple.relation,
      );

      if (tupleIndex >= 0) {
        tuples.splice(tupleIndex, 1);
      }

      return Effect.succeed(tuple);
    });
    const getTenantAccessState = vi.fn(() => unexpectedEffect());
    const runtimeConfig = await createRuntimeConfigService();
    const listOverridesByModule = vi.fn(() => unexpectedEffect());
    const resolveConfigValue = vi.fn(() => unexpectedEffect());
    const service = await createTenantInvitationRedemptionServiceForTest(
      makeTenantInvitationRedemptionService({
        persistRedeemedInvitation,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantInvitationPostgresRepository, {
          getInvitationByTokenHash,
          getInvitationById,
        } as unknown as TenantInvitationPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple,
        } as unknown as OryKetoAdapter["Type"]),
      ),
      {
        billingState: {
          getTenantAccessState,
        } as BillingStatePostgresRepository["Type"],
        runtimeConfig: {
          ...runtimeConfig,
          listOverridesByModule,
          resolveConfigValue,
        },
      },
    );

    await expect(
      Effect.runPromise(
        service.redeemTenantInvitation({
          sessionId: "sess_tenant_invitation_redeem_audit_failure",
          invitationToken: "tmiv_pending_token_audit_failure",
        }),
      ),
    ).rejects.toThrow(/insertAuditEvent/);
    expect(writeTuple).toHaveBeenCalledTimes(1);
    expect(deleteTuple).toHaveBeenCalledTimes(1);
    expect(tuples).toEqual([]);
  });

  it("keeps the granted membership when a concurrent redemption by the same actor wins first", async () => {
    const requestContext = {
      actorType: actorType.organizationMember,
      actorId: "usr_member_1",
      sessionId: "sess_tenant_invitation_redeem_same_actor_race",
      correlationId: "corr_tenant_invitation_redeem_same_actor_race",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_home",
        organizationId: "org_home",
      },
    } as const;
    const tuples: Array<{
      readonly subject: string;
      readonly relation: typeof authorizationRelation.admin;
    }> = [];
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationByTokenHash = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
      }),
    );
    const getInvitationById = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "redeemed",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        redeemedAt: "2026-05-02T12:15:00.000Z",
        redeemedBy: "usr_member_1",
      }),
    );
    const redeemInvitation = vi.fn((_input) => Effect.succeed(undefined));
    const appendAuditEvent = vi.fn(() => unexpectedEffect());
    const persistRedeemedInvitation = vi.fn((input) =>
      redeemInvitation({
        tenantScope: input.invitation.tenantScope,
        tenantScopeId: input.invitation.tenantScopeId,
        invitationId: input.invitation.invitationId,
        redeemedBy: input.redeemedBy,
        redeemedAt: input.redeemedAt,
      }),
    );
    const listTuples = vi.fn(({ relation, subject }) =>
      Effect.succeed(
        tuples
          .filter(
            (tuple) => tuple.relation === relation && tuple.subject === subject,
          )
          .map((tuple) => ({
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: tuple.relation,
            subject: tuple.subject,
          })),
      ),
    );
    const writeTuple = vi.fn((tuple) => {
      tuples.push({
        subject: tuple.subject,
        relation: tuple.relation,
      });

      return Effect.succeed(undefined);
    });
    const deleteTuple = vi.fn(() => unexpectedEffect());
    const service = await createTenantInvitationRedemptionServiceForTest(
      makeTenantInvitationRedemptionService({
        persistRedeemedInvitation,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantInvitationPostgresRepository, {
          getInvitationByTokenHash,
          getInvitationById,
          redeemInvitation,
        } as unknown as TenantInvitationPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple,
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.redeemTenantInvitation({
        sessionId: "sess_tenant_invitation_redeem_same_actor_race",
        invitationToken: "tmiv_pending_token_same_actor_race",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      invitationId: "invite_org_1_admin_1",
      relation: authorizationRelation.admin,
      membershipChanged: false,
      membership: {
        subject: "usr_member_1",
        relations: [authorizationRelation.admin],
      },
      branding: expectedTenantBrandingProjection,
    });
    expect(writeTuple).toHaveBeenCalledTimes(1);
    expect(deleteTuple).not.toHaveBeenCalled();
  });

  it("returns membershipChanged false without tuple or audit writes when the same actor replays a redeemed invitation", async () => {
    const requestContext = {
      actorType: actorType.organizationMember,
      actorId: "usr_member_1",
      sessionId: "sess_tenant_invitation_redeem_repeat",
      correlationId: "corr_tenant_invitation_redeem_repeat",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_home",
        organizationId: "org_home",
      },
    } as const;
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationByTokenHash = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "redeemed",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        redeemedAt: "2026-05-02T12:15:00.000Z",
        redeemedBy: "usr_member_1",
      }),
    );
    const redeemInvitation = vi.fn(() => unexpectedEffect());
    const appendAuditEvent = vi.fn(() => unexpectedEffect());
    const listTuples = vi.fn(({ relation, subject }) =>
      Effect.succeed(
        relation === authorizationRelation.admin && subject === "usr_member_1"
          ? [
              {
                namespace: authorizationNamespace.tenant,
                object: "org_1",
                relation,
                subject,
              },
            ]
          : [],
      ),
    );
    const writeTuple = vi.fn(() => unexpectedEffect());
    const service = await createTenantInvitationRedemptionServiceForTest(
      makeTenantInvitationRedemptionService().pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantInvitationPostgresRepository, {
          getInvitationByTokenHash,
          redeemInvitation,
        } as unknown as TenantInvitationPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.redeemTenantInvitation({
        sessionId: "sess_tenant_invitation_redeem_repeat",
        invitationToken: "tmiv_redeemed_token",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      invitationId: "invite_org_1_admin_1",
      relation: authorizationRelation.admin,
      membershipChanged: false,
      membership: {
        subject: "usr_member_1",
        relations: [authorizationRelation.admin],
      },
      branding: expectedTenantBrandingProjection,
    });
    expect(writeTuple).not.toHaveBeenCalled();
    expect(redeemInvitation).not.toHaveBeenCalled();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects replay when the same actor no longer has the redeemed membership", async () => {
    const requestContext = {
      actorType: actorType.organizationMember,
      actorId: "usr_member_1",
      sessionId: "sess_tenant_invitation_redeem_repair",
      correlationId: "corr_tenant_invitation_redeem_repair",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_home",
        organizationId: "org_home",
      },
    } as const;
    const tuples: Array<{
      readonly subject: string;
      readonly relation: typeof authorizationRelation.admin;
    }> = [];
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationByTokenHash = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "redeemed",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        redeemedAt: "2026-05-02T12:15:00.000Z",
        redeemedBy: "usr_member_1",
      }),
    );
    const redeemInvitation = vi.fn(() => unexpectedEffect());
    const appendAuditEvent = vi.fn(() => unexpectedEffect());
    const listTuples = vi.fn(({ relation, subject }) =>
      Effect.succeed(
        tuples
          .filter(
            (tuple) => tuple.relation === relation && tuple.subject === subject,
          )
          .map((tuple) => ({
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: tuple.relation,
            subject: tuple.subject,
          })),
      ),
    );
    const writeTuple = vi.fn(() => unexpectedEffect());
    const service = await createTenantInvitationRedemptionServiceForTest(
      makeTenantInvitationRedemptionService().pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantInvitationPostgresRepository, {
          getInvitationByTokenHash,
          redeemInvitation,
        } as unknown as TenantInvitationPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    await expect(
      Effect.runPromise(
        service.redeemTenantInvitation({
          sessionId: "sess_tenant_invitation_redeem_repair",
          invitationToken: "tmiv_redeemed_token_repair",
        }),
      ),
    ).rejects.toThrow(/TenantInvitationRedemptionUnavailableError/);

    expect(writeTuple).not.toHaveBeenCalled();
    expect(redeemInvitation).not.toHaveBeenCalled();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects redemption when another actor wins the pending invitation claim first", async () => {
    const requestContext = {
      actorType: actorType.organizationMember,
      actorId: "usr_member_2",
      sessionId: "sess_tenant_invitation_redeem_race",
      correlationId: "corr_tenant_invitation_redeem_race",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_home",
        organizationId: "org_home",
      },
    } as const;
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationByTokenHash = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
      }),
    );
    const redeemInvitation = vi.fn((_input) => Effect.succeed(undefined));
    const getInvitationById = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_org_1_admin_1",
        recipientEmail: "admin@example.com",
        relation: authorizationRelation.admin,
        status: "redeemed",
        issuedBy: "usr_platform_operator",
        correlationId: "corr_issue_tenant_invitation",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        redeemedAt: "2026-05-02T12:15:00.000Z",
        redeemedBy: "usr_member_1",
      }),
    );
    const appendAuditEvent = vi.fn(() => unexpectedEffect());
    const persistRedeemedInvitation = vi.fn((input) =>
      redeemInvitation({
        tenantScope: input.invitation.tenantScope,
        tenantScopeId: input.invitation.tenantScopeId,
        invitationId: input.invitation.invitationId,
        redeemedBy: input.redeemedBy,
        redeemedAt: input.redeemedAt,
      }),
    );
    const tuples: Array<{
      readonly subject: string;
      readonly relation: typeof authorizationRelation.admin;
    }> = [];
    const listTuples = vi.fn(({ relation, subject }) =>
      Effect.succeed(
        tuples
          .filter(
            (tuple) => tuple.relation === relation && tuple.subject === subject,
          )
          .map((tuple) => ({
            namespace: authorizationNamespace.tenant,
            object: "org_1",
            relation: tuple.relation,
            subject: tuple.subject,
          })),
      ),
    );
    const writeTuple = vi.fn((tuple) => {
      tuples.push({
        subject: tuple.subject,
        relation: tuple.relation,
      });

      return Effect.succeed(undefined);
    });
    const deleteTuple = vi.fn((tuple) => {
      const tupleIndex = tuples.findIndex(
        (currentTuple) =>
          currentTuple.subject === tuple.subject &&
          currentTuple.relation === tuple.relation,
      );

      if (tupleIndex >= 0) {
        tuples.splice(tupleIndex, 1);
      }

      return Effect.succeed(tuple);
    });
    const getTenantAccessState = vi.fn(() => unexpectedEffect());
    const runtimeConfig = await createRuntimeConfigService();
    const listOverridesByModule = vi.fn(() => unexpectedEffect());
    const resolveConfigValue = vi.fn(() => unexpectedEffect());
    const service = await createTenantInvitationRedemptionServiceForTest(
      makeTenantInvitationRedemptionService({
        persistRedeemedInvitation,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantInvitationPostgresRepository, {
          getInvitationByTokenHash,
          getInvitationById,
          redeemInvitation,
        } as unknown as TenantInvitationPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples,
          writeTuple,
          deleteTuple,
        } as unknown as OryKetoAdapter["Type"]),
      ),
      {
        billingState: {
          getTenantAccessState,
        } as BillingStatePostgresRepository["Type"],
        runtimeConfig: {
          ...runtimeConfig,
          listOverridesByModule,
          resolveConfigValue,
        },
      },
    );

    await expect(
      Effect.runPromise(
        service.redeemTenantInvitation({
          sessionId: "sess_tenant_invitation_redeem_race",
          invitationToken: "tmiv_pending_token_race",
        }),
      ),
    ).rejects.toThrow(/TenantInvitationRedemptionUnavailableError/);
    expect(writeTuple).toHaveBeenCalledTimes(1);
    expect(deleteTuple).toHaveBeenCalledTimes(1);
    expect(tuples).toEqual([]);
    expect(getInvitationById).toHaveBeenCalledWith({
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      invitationId: "invite_org_1_admin_1",
    });
    expect(getTenantAccessState).not.toHaveBeenCalled();
    expect(listOverridesByModule).not.toHaveBeenCalled();
    expect(resolveConfigValue).not.toHaveBeenCalled();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });
});
