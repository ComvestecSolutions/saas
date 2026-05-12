import { Effect } from "effect";
import {
  authorizationAuditAction,
  authorizationNamespace,
  authorizationRelation,
  actorType,
  auditLogAuditAction,
  fieldSecurityAuditAction,
  featureFlagLifecycle,
  permissionScope,
  platformModuleId,
  platformScope,
  runtimeConfigAuditAction,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
  tenantBrandingFeatureFlag,
  type AuditEvent,
} from "@comvestec/contracts";
import {
  emailDeliveryFeatureFlag,
  featureFlagsFeatureFlag,
  notificationCenterFeatureFlag,
  runtimeConfigFeatureFlag,
  tenantBrandingConfigKey,
} from "@comvestec/config";
import {
  AuditLogPostgresRepository,
  BillingStatePostgresRepository,
  type BillingEntitlementRecord,
  makeAuthorizationModule,
  buildAuditEvent,
  makeRuntimeConfigModule,
  RuntimeConfigModule,
  runtimeConfigProposalDecisionStatus,
  runtimeConfigSyncArtifactStatus,
  type AuthorizationDecision,
  type AuthorizationExplanation,
  type AuthorizationModuleService,
  type AuthorizationTuple,
  type AuditLogPostgresRepositoryService,
  type RuntimeConfigOverrideRecord,
  type RuntimeConfigOverrideProposalNotFoundError,
  type RuntimeConfigOverrideProposalRecord,
  type RuntimeConfigPostgresRepositoryService,
  type RuntimeFeatureFlagRolloutService,
  type RuntimeConfigSyncArtifactReviewRecord,
  type RuntimeConfigSyncArtifactRecord,
} from "@comvestec/modules";
import {
  makeAdminGovernanceService,
  makeValkeyAdapter,
  type OryKetoTuple,
  ValkeyAdapter,
  type ValkeyRedisClient,
} from "@comvestec/platform";

const anonymousGovernanceRequestContext = {
  actorType: actorType.anonymous,
  correlationId: "corr_admin_governance_anonymous",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} as const;

const supportOperatorGovernanceRequestContext = {
  actorType: actorType.supportOperator,
  actorId: "usr_support_operator",
  sessionId: "sess_support_operator",
  correlationId: "corr_admin_governance_support",
  reason: "Inspect projected governance state",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} as const;

const platformOperatorGovernanceRequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_platform_operator",
  sessionId: "sess_platform_operator",
  correlationId: "corr_admin_governance_platform",
  reason: "Inspect projected governance state",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
} as const;

const createInMemoryValkeyClient = (): ValkeyRedisClient => {
  const entries = new Map<string, string>();

  return {
    isOpen: true,
    connect: async () => undefined,
    quit: async () => undefined,
    ping: async () => "PONG",
    incrByFloat: async (key, increment) => {
      const nextValue = Number(entries.get(key) ?? "0") + increment;
      entries.set(key, String(nextValue));

      return String(nextValue);
    },
    del: async (key) => (entries.delete(key) ? 1 : 0),
    set: async (key, value) => {
      entries.set(key, value);
      return "OK";
    },
    get: async (key) => entries.get(key) ?? null,
  };
};

const createFeatureFlagRollout = (
  evaluations: Readonly<
    Record<
      string,
      {
        readonly effectiveValue: boolean;
        readonly definitionExists: boolean;
        readonly resolvedScope?: (typeof platformScope)[keyof typeof platformScope];
        readonly resolvedScopeId?: string;
      }
    >
  >,
): RuntimeFeatureFlagRolloutService => ({
  evaluateFeatureFlag: (input) =>
    Effect.succeed(
      evaluations[input.flag.key] ?? {
        effectiveValue: input.flag.defaultEnabled,
        definitionExists: false,
      },
    ),
});

const resolveTenantAccessCandidates = (
  input: Parameters<
    BillingStatePostgresRepository["Type"]["getTenantAccessState"]
  >[0],
) => {
  const candidates: Array<{
    readonly scope: string;
    readonly scopeId: string;
  }> = [];

  const addCandidate = (scope: string, scopeId: string) => {
    if (
      candidates.some(
        (candidate) =>
          candidate.scope === scope && candidate.scopeId === scopeId,
      )
    ) {
      return;
    }

    candidates.push({ scope, scopeId });
  };

  switch (input.scope) {
    case platformScope.individual:
      addCandidate(
        platformScope.individual,
        input.individualId ?? input.scopeId,
      );

      if (input.organizationId !== undefined) {
        addCandidate(platformScope.organization, input.organizationId);
      }

      if (input.enterpriseId !== undefined) {
        addCandidate(platformScope.enterprise, input.enterpriseId);
      }

      break;
    case platformScope.organization:
      addCandidate(
        platformScope.organization,
        input.organizationId ?? input.scopeId,
      );

      if (input.enterpriseId !== undefined) {
        addCandidate(platformScope.enterprise, input.enterpriseId);
      }

      break;
    case platformScope.enterprise:
      addCandidate(
        platformScope.enterprise,
        input.enterpriseId ?? input.scopeId,
      );

      break;
    case platformScope.platform:
      break;
  }

  addCandidate(platformScope.platform, platformScope.platform);

  return candidates;
};

const createAdminGovernanceHarness = async (input?: {
  readonly overrides?: readonly RuntimeConfigOverrideRecord[];
  readonly overrideProposals?: readonly RuntimeConfigOverrideProposalRecord[];
  readonly proposals?: readonly RuntimeConfigSyncArtifactRecord[];
  readonly auditEvents?: readonly AuditEvent[];
  readonly entitlements?: readonly BillingEntitlementRecord[];
  readonly featureFlagRollout?: RuntimeFeatureFlagRolloutService;
  readonly authorizationTuples?: readonly AuthorizationTuple[];
  readonly authorization?: Pick<
    AuthorizationModuleService,
    "check" | "explain"
  >;
  readonly writeAuthorizationTuple?: (
    tuple: OryKetoTuple,
  ) => Effect.Effect<OryKetoTuple, never>;
}) => {
  const insertedAuditEvents: AuditEvent[] = [];
  const overrides = [...(input?.overrides ?? [])];
  const overrideProposals = [...(input?.overrideProposals ?? [])];
  const proposals = [...(input?.proposals ?? [])];
  const auditEvents = [...(input?.auditEvents ?? [])];
  const entitlements = [...(input?.entitlements ?? [])];
  const authorizationTuples = [...(input?.authorizationTuples ?? [])];

  const runtimeConfigRepository = {
    listOverridesByModule: (moduleId) =>
      Effect.succeed(
        overrides.filter((override) => override.moduleId === moduleId),
      ),
    upsertOverride: (override) => Effect.succeed(override),
    listOverrideProposalsByModule: (moduleId) =>
      Effect.succeed(
        overrideProposals.filter((proposal) => proposal.moduleId === moduleId),
      ),
    submitOverrideProposal: (proposal) =>
      Effect.succeed({
        ...proposal,
        status: runtimeConfigSyncArtifactStatus.pending,
      }),
    reviewSyncArtifact: (input: RuntimeConfigSyncArtifactReviewRecord) =>
      Effect.suspend(() => {
        const proposal = proposals.find(
          (candidate) => candidate.proposalId === input.proposalId,
        );

        if (proposal === undefined) {
          return Effect.fail({
            _tag: "RuntimeConfigSyncArtifactNotFoundError",
            proposalId: input.proposalId,
          } as const);
        }

        return Effect.succeed({
          ...proposal,
          status: input.status,
          decidedBy: input.decidedBy,
          decisionReason: input.decisionReason,
          decidedAt: input.decidedAt,
        });
      }),
    listSyncArtifactsByModule: (moduleId) =>
      Effect.succeed(
        proposals.filter((proposal) => proposal.moduleId === moduleId),
      ),
    persistSyncArtifacts: (records) => Effect.succeed(records),
  } satisfies RuntimeConfigPostgresRepositoryService;

  const auditLogRepository = {
    insertAuditEvent: (event) => {
      insertedAuditEvents.push(event);
      return Effect.succeed(event);
    },
    queryByModule: (moduleId) =>
      Effect.succeed(
        auditEvents.filter((event) => event.moduleId === moduleId),
      ),
    queryByTarget: (input) =>
      Effect.succeed(
        auditEvents.filter(
          (event) =>
            event.moduleId === input.moduleId && event.target === input.target,
        ),
      ),
    queryByActor: (actorId) =>
      Effect.succeed(auditEvents.filter((event) => event.actorId === actorId)),
    queryByTenant: (input) =>
      Effect.succeed(
        auditEvents.filter(
          (event) =>
            event.tenantScope === input.tenantScope &&
            event.tenantScopeId === input.tenantScopeId,
        ),
      ),
  } satisfies AuditLogPostgresRepositoryService;

  const runtimeConfig = await Effect.runPromise(
    makeRuntimeConfigModule(runtimeConfigRepository, input?.featureFlagRollout),
  );
  const authorization =
    input?.authorization ??
    (await Effect.runPromise(
      makeAuthorizationModule({
        tuples: [],
        cacheTtlSeconds: 60,
        maxCacheSize: 128,
        ...(authorizationTuples.length > 0
          ? {
              delegatedCheck: () => Effect.succeed(false),
              delegatedTupleLookup: () =>
                Effect.succeed([...authorizationTuples]),
            }
          : {}),
      }),
    ));
  const valkey = await Effect.runPromise(
    makeValkeyAdapter({
      url: "redis://127.0.0.1:6379",
      client: createInMemoryValkeyClient(),
    }),
  );
  const billingStateRepository: BillingStatePostgresRepository["Type"] = {
    getTenantAccessState: (
      tenantLookup: Parameters<
        BillingStatePostgresRepository["Type"]["getTenantAccessState"]
      >[0],
    ) =>
      Effect.succeed({
        entitlements: entitlements.filter((entitlement) =>
          resolveTenantAccessCandidates(tenantLookup).some(
            (candidate) =>
              entitlement.scope === candidate.scope &&
              entitlement.scopeId === candidate.scopeId,
          ),
        ),
        invoiceHistory: [],
      }),
  };
  const proposalReviewPersistence: Parameters<
    typeof makeAdminGovernanceService
  >[0] = {
    persistSubmittedOverrideProposal: ({
      requestContext,
      moduleId,
      key,
      scope,
      scopeId,
      value,
      approvalReason,
    }): ReturnType<
      Parameters<
        typeof makeAdminGovernanceService
      >[0]["persistSubmittedOverrideProposal"]
    > => {
      const submittedProposal: RuntimeConfigOverrideProposalRecord = {
        proposalId: `${moduleId}:${key}:${scope}:${scopeId}:override`,
        moduleId,
        key,
        scope,
        scopeId,
        value,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: requestContext.actorId,
        changedAt: "2026-04-25T10:00:00.000Z",
        approvalReason,
        status: runtimeConfigSyncArtifactStatus.pending,
      };

      overrideProposals.unshift(submittedProposal);

      return buildAuditEvent({
        requestContext: {
          ...requestContext,
          reason: approvalReason,
        },
        moduleId,
        action: runtimeConfigAuditAction.overrideProposed,
        target: submittedProposal.proposalId,
        reason: approvalReason,
      }).pipe(
        Effect.map((auditEvent) => {
          insertedAuditEvents.push(auditEvent);

          return {
            proposal: submittedProposal,
            auditEvent,
          };
        }),
      );
    },
    persistReviewedProposal: ({
      requestContext,
      proposalId,
      status,
      decisionReason,
    }): ReturnType<
      Parameters<
        typeof makeAdminGovernanceService
      >[0]["persistReviewedProposal"]
    > => {
      const proposal = proposals.find(
        (candidate) => candidate.proposalId === proposalId,
      );

      if (proposal !== undefined) {
        if (proposal.status !== runtimeConfigSyncArtifactStatus.pending) {
          return Effect.fail({
            _tag: "AdminGovernanceProposalReviewConflictError",
            proposalId,
            status: proposal.status,
          } as const);
        }

        const reviewedProposal: RuntimeConfigSyncArtifactRecord = {
          ...proposal,
          status,
          decidedBy: requestContext.actorId,
          decisionReason,
          decidedAt: "2026-04-25T10:05:00.000Z",
        };
        const proposalIndex = proposals.findIndex(
          (candidate) => candidate.proposalId === proposalId,
        );

        proposals.splice(proposalIndex, 1, reviewedProposal);

        return buildAuditEvent({
          requestContext: {
            ...requestContext,
            reason: decisionReason,
          },
          moduleId: proposal.moduleId,
          action: runtimeConfigAuditAction.proposalReviewed,
          target: proposalId,
          reason: decisionReason,
        }).pipe(
          Effect.map((auditEvent) => {
            insertedAuditEvents.push(auditEvent);

            return {
              proposal: reviewedProposal,
              auditEvent,
            };
          }),
        );
      }

      const overrideProposal = overrideProposals.find(
        (candidate) => candidate.proposalId === proposalId,
      );

      if (overrideProposal === undefined) {
        return Effect.fail({
          _tag: "RuntimeConfigOverrideProposalNotFoundError",
          proposalId,
        } as RuntimeConfigOverrideProposalNotFoundError);
      }

      if (overrideProposal.status !== runtimeConfigSyncArtifactStatus.pending) {
        return Effect.fail({
          _tag: "AdminGovernanceProposalReviewConflictError",
          proposalId,
          status: overrideProposal.status,
        } as const);
      }

      const reviewedOverrideProposal: RuntimeConfigOverrideProposalRecord = {
        ...overrideProposal,
        status:
          status === runtimeConfigProposalDecisionStatus.approved
            ? runtimeConfigSyncArtifactStatus.applied
            : runtimeConfigSyncArtifactStatus.rejected,
        decidedBy: requestContext.actorId,
        decisionReason,
        decidedAt: "2026-04-25T10:05:00.000Z",
      };
      const overrideProposalIndex = overrideProposals.findIndex(
        (candidate) => candidate.proposalId === proposalId,
      );

      overrideProposals.splice(
        overrideProposalIndex,
        1,
        reviewedOverrideProposal,
      );

      if (status === runtimeConfigProposalDecisionStatus.approved) {
        overrides.unshift({
          moduleId: overrideProposal.moduleId,
          key: overrideProposal.key,
          scope: overrideProposal.scope,
          scopeId: overrideProposal.scopeId,
          value: overrideProposal.value,
          source: overrideProposal.source,
          changedBy: requestContext.actorId,
          changedAt: "2026-04-25T10:05:00.000Z",
          approvalReason: overrideProposal.approvalReason,
        });
      }

      return buildAuditEvent({
        requestContext: {
          ...requestContext,
          reason: decisionReason,
        },
        moduleId: overrideProposal.moduleId,
        action: runtimeConfigAuditAction.proposalReviewed,
        target: proposalId,
        reason: decisionReason,
      }).pipe(
        Effect.flatMap((auditEvent) => {
          insertedAuditEvents.push(auditEvent);

          if (status !== runtimeConfigProposalDecisionStatus.approved) {
            return Effect.succeed({
              proposal: reviewedOverrideProposal,
              auditEvent,
            });
          }

          return buildAuditEvent({
            requestContext: {
              ...requestContext,
              reason: decisionReason,
            },
            moduleId: overrideProposal.moduleId,
            action: runtimeConfigAuditAction.overrideChanged,
            target: `${overrideProposal.moduleId}:${overrideProposal.key}:${overrideProposal.scope}:${overrideProposal.scopeId}`,
            reason: decisionReason,
          }).pipe(
            Effect.map((overrideChangedAuditEvent) => {
              insertedAuditEvents.push(overrideChangedAuditEvent);

              return {
                proposal: reviewedOverrideProposal,
                auditEvent,
              };
            }),
          );
        }),
      );
    },
  };
  const service = await Effect.runPromise(
    makeAdminGovernanceService(proposalReviewPersistence, {
      authorization,
      writeAuthorizationTuple:
        input?.writeAuthorizationTuple ?? ((tuple) => Effect.succeed(tuple)),
    }).pipe(
      Effect.provideService(RuntimeConfigModule, runtimeConfig),
      Effect.provideService(
        BillingStatePostgresRepository,
        billingStateRepository,
      ),
      Effect.provideService(AuditLogPostgresRepository, auditLogRepository),
      Effect.provideService(ValkeyAdapter, valkey),
    ),
  );

  return {
    insertedAuditEvents,
    service,
    valkey,
  };
};

describe("platform admin governance", () => {
  it("denies runtime-config override proposal submissions for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.submitRuntimeConfigOverrideProposal({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin_mutation",
            correlationId: "corr_org_admin_mutation",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          scope: platformScope.organization,
          scopeId: "org_demo",
          value: "Acme Organization",
          approvalReason: "Operator-approved tenant override",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceMutationAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("denies runtime-config proposal persistence for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.persistRuntimeConfigProposals({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin_persist",
            correlationId: "corr_org_admin_persist",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          moduleId: platformModuleId.tenantBranding,
          renameMap: {
            [tenantBrandingConfigKey.companyName]:
              tenantBrandingConfigKey.themePrimary,
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceMutationAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("returns a projected runtime-config override proposal submission envelope for support operators", async () => {
    const { insertedAuditEvents, service } =
      await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      service.submitRuntimeConfigOverrideProposal({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.organization,
        scopeId: "org_demo",
        value: "Acme Organization",
        approvalReason: "Approved override",
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          proposalId: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo:override`,
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          value: "Acme Organization",
          approvalReason: "Approved override",
          status: runtimeConfigSyncArtifactStatus.pending,
        }),
        auditEvent: expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideProposed,
          correlationId: supportOperatorGovernanceRequestContext.correlationId,
          reason: "Approved override",
        }),
      }),
    );
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideProposed,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: expect.stringContaining(
            `${platformModuleId.runtimeConfig}:${platformModuleId.tenantBranding}:proposal-mutation:`,
          ),
        }),
      ]),
    );
  });

  it("returns a projected feature-flag override proposal submission envelope for support operators", async () => {
    const { insertedAuditEvents, service } =
      await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      service.submitRuntimeConfigOverrideProposal({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.enabled,
        scope: platformScope.organization,
        scopeId: "org_demo",
        value: true,
        approvalReason: "Enable tenant branding for approved rollout",
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          proposalId: `${platformModuleId.tenantBranding}:${tenantBrandingFeatureFlag.enabled}:${platformScope.organization}:org_demo:override`,
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingFeatureFlag.enabled,
          value: true,
          approvalReason: "Enable tenant branding for approved rollout",
          status: runtimeConfigSyncArtifactStatus.pending,
        }),
        auditEvent: expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideProposed,
          correlationId: supportOperatorGovernanceRequestContext.correlationId,
          reason: "Enable tenant branding for approved rollout",
        }),
      }),
    );
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideProposed,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: expect.stringContaining(
            `${platformModuleId.runtimeConfig}:${platformModuleId.tenantBranding}:proposal-mutation:`,
          ),
        }),
      ]),
    );
  });

  it("rejects feature-flag override proposal submissions for undeclared module keys", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.submitRuntimeConfigOverrideProposal({
          requestContext: supportOperatorGovernanceRequestContext,
          moduleId: platformModuleId.tenantBranding,
          key: notificationCenterFeatureFlag.enabled,
          scope: platformScope.organization,
          scopeId: "org_demo",
          value: true,
          approvalReason: "Attempt invalid cross-module feature-flag override",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceRuntimeGovernedOverrideValidationError",
        moduleId: platformModuleId.tenantBranding,
        key: notificationCenterFeatureFlag.enabled,
        reason: expect.stringContaining("is not declared"),
      },
    });
  });

  it("rejects feature-flag override proposal submissions with non-boolean values", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.submitRuntimeConfigOverrideProposal({
          requestContext: supportOperatorGovernanceRequestContext,
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingFeatureFlag.enabled,
          scope: platformScope.organization,
          scopeId: "org_demo",
          value: "false",
          approvalReason: "Attempt invalid string feature-flag override",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceRuntimeGovernedOverrideValidationError",
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.enabled,
        reason: expect.stringContaining("must be a boolean"),
      },
    });
  });

  it("rejects feature-flag override proposal submissions for retired flags", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.submitRuntimeConfigOverrideProposal({
          requestContext: supportOperatorGovernanceRequestContext,
          moduleId: platformModuleId.featureFlags,
          key: featureFlagsFeatureFlag.legacyRolloutCatalog,
          scope: platformScope.platform,
          scopeId: platformScope.platform,
          value: true,
          approvalReason: "Attempt to re-enable a retired feature flag",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceRuntimeGovernedOverrideValidationError",
        moduleId: platformModuleId.featureFlags,
        key: featureFlagsFeatureFlag.legacyRolloutCatalog,
        reason: expect.stringContaining("retired flag"),
      },
    });
  });

  it("applies approved runtime-config override proposals through proposal review", async () => {
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        overrideProposals: [
          {
            proposalId: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo:override`,
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.companyName,
            scope: platformScope.organization,
            scopeId: "org_demo",
            value: "Acme Organization",
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_platform_operator",
            changedAt: "2026-04-25T10:00:00.000Z",
            approvalReason: "Approved override",
            status: runtimeConfigSyncArtifactStatus.pending,
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.reviewRuntimeConfigProposal({
        requestContext: supportOperatorGovernanceRequestContext,
        proposalId: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo:override`,
        status: runtimeConfigProposalDecisionStatus.approved,
        decisionReason: "Approved direct override application",
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          proposalId: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo:override`,
          status: runtimeConfigSyncArtifactStatus.applied,
          decidedBy: supportOperatorGovernanceRequestContext.actorId,
          decisionReason: "Approved direct override application",
        }),
        auditEvent: expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.proposalReviewed,
          reason: "Approved direct override application",
        }),
      }),
    );
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.proposalReviewed,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideChanged,
          reason: "Approved direct override application",
        }),
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: expect.stringContaining(
            `${platformModuleId.runtimeConfig}:${platformModuleId.tenantBranding}:proposal-mutation:`,
          ),
        }),
      ]),
    );
  });

  it("applies approved feature-flag override proposals through proposal review", async () => {
    const organizationGovernanceRequestContext = {
      ...supportOperatorGovernanceRequestContext,
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
    } as const;
    const proposalId = `${platformModuleId.tenantBranding}:${tenantBrandingFeatureFlag.enabled}:${platformScope.organization}:org_1:override`;
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        overrideProposals: [
          {
            proposalId,
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            value: true,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_platform_operator",
            changedAt: "2026-04-25T10:00:00.000Z",
            approvalReason: "Enable tenant branding for approved rollout",
            status: runtimeConfigSyncArtifactStatus.pending,
          },
        ],
      },
    );

    const reviewResult = await Effect.runPromise(
      service.reviewRuntimeConfigProposal({
        requestContext: supportOperatorGovernanceRequestContext,
        proposalId,
        status: runtimeConfigProposalDecisionStatus.approved,
        decisionReason: "Approved feature-flag override",
      }),
    );
    const flags = await Effect.runPromise(
      service.listFeatureFlags({
        requestContext: organizationGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(reviewResult).toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          proposalId,
          key: tenantBrandingFeatureFlag.enabled,
          value: true,
          status: runtimeConfigSyncArtifactStatus.applied,
          decidedBy: supportOperatorGovernanceRequestContext.actorId,
          decisionReason: "Approved feature-flag override",
        }),
        auditEvent: expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.proposalReviewed,
          reason: "Approved feature-flag override",
        }),
      }),
    );
    expect(flags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: tenantBrandingFeatureFlag.enabled,
          effectiveState: true,
          source: runtimeResolutionSource.runtimeOverride,
          entitled: false,
          scope: platformScope.organization,
        }),
      ]),
    );
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.proposalReviewed,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideChanged,
          reason: "Approved feature-flag override",
        }),
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.featureFlags}:${platformModuleId.tenantBranding}:flags:effectiveState`,
        }),
      ]),
    );
  });

  it("rejects approving persisted out-of-scope feature-flag override proposals", async () => {
    const proposalId = `${platformModuleId.tenantBranding}:${tenantBrandingFeatureFlag.enabled}:${platformScope.individual}:usr_demo:override`;
    const { service } = await createAdminGovernanceHarness({
      overrideProposals: [
        {
          proposalId,
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingFeatureFlag.enabled,
          scope: platformScope.individual,
          scopeId: "usr_demo",
          value: true,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_platform_operator",
          changedAt: "2026-04-25T10:00:00.000Z",
          approvalReason:
            "Attempt invalid individual-scope feature-flag override",
          status: runtimeConfigSyncArtifactStatus.pending,
        },
      ],
    });

    const result = await Effect.runPromise(
      Effect.either(
        service.reviewRuntimeConfigProposal({
          requestContext: supportOperatorGovernanceRequestContext,
          proposalId,
          status: runtimeConfigProposalDecisionStatus.approved,
          decisionReason:
            "Approve invalid individual-scope feature-flag override",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceRuntimeGovernedOverrideValidationError",
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.enabled,
        reason: expect.stringContaining(
          "cannot be overridden at individual scope",
        ),
      },
    });
  });

  it("rejects approving persisted retired feature-flag override proposals", async () => {
    const proposalId = `${platformModuleId.featureFlags}:${featureFlagsFeatureFlag.legacyRolloutCatalog}:${platformScope.platform}:${platformScope.platform}:override`;
    const { service } = await createAdminGovernanceHarness({
      overrideProposals: [
        {
          proposalId,
          moduleId: platformModuleId.featureFlags,
          key: featureFlagsFeatureFlag.legacyRolloutCatalog,
          scope: platformScope.platform,
          scopeId: platformScope.platform,
          value: true,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_platform_operator",
          changedAt: "2026-04-25T10:00:00.000Z",
          approvalReason: "Attempt to re-enable a retired feature flag",
          status: runtimeConfigSyncArtifactStatus.pending,
        },
      ],
    });

    const result = await Effect.runPromise(
      Effect.either(
        service.reviewRuntimeConfigProposal({
          requestContext: supportOperatorGovernanceRequestContext,
          proposalId,
          status: runtimeConfigProposalDecisionStatus.approved,
          decisionReason: "Attempted approval for retired feature flag",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceRuntimeGovernedOverrideValidationError",
        moduleId: platformModuleId.featureFlags,
        key: featureFlagsFeatureFlag.legacyRolloutCatalog,
        reason: expect.stringContaining("retired flag"),
      },
    });
  });

  it("rejects repeat runtime-config proposal reviews once a proposal is no longer pending", async () => {
    const { service } = await createAdminGovernanceHarness({
      overrideProposals: [
        {
          proposalId: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo:override`,
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          scope: platformScope.organization,
          scopeId: "org_demo",
          value: "Acme Organization",
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_platform_operator",
          changedAt: "2026-04-25T10:00:00.000Z",
          approvalReason: "Approved override",
          status: runtimeConfigSyncArtifactStatus.applied,
          decidedBy: "usr_support_operator",
          decisionReason: "Approved direct override application",
          decidedAt: "2026-04-25T10:05:00.000Z",
        },
      ],
    });

    const result = await Effect.runPromise(
      Effect.either(
        service.reviewRuntimeConfigProposal({
          requestContext: supportOperatorGovernanceRequestContext,
          proposalId: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo:override`,
          status: runtimeConfigProposalDecisionStatus.rejected,
          decisionReason: "Attempted second review",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceProposalReviewConflictError",
        proposalId: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo:override`,
        status: runtimeConfigSyncArtifactStatus.applied,
      },
    });
  });

  it("returns a projected runtime-config proposal review envelope for support operators", async () => {
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        proposals: [
          {
            proposalId: "tenant-branding:companyName:update",
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.companyName,
            action: runtimeChangeProposalAction.update,
            artifactPath:
              "specs/00-governance/runtime-config-proposals/tenant-branding.companyName.json",
            runtimeValue: "Acme Organization",
            codeValue: "Default Company Name",
            status: runtimeConfigSyncArtifactStatus.pending,
            generatedAt: "2026-04-22T10:00:00.000Z",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.reviewRuntimeConfigProposal({
        requestContext: supportOperatorGovernanceRequestContext,
        proposalId: "tenant-branding:companyName:update",
        status: runtimeConfigProposalDecisionStatus.approved,
        decisionReason: "Approved export back to code",
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          proposalId: "tenant-branding:companyName:update",
          status: runtimeConfigProposalDecisionStatus.approved,
          decidedBy: supportOperatorGovernanceRequestContext.actorId,
          decisionReason: "Approved export back to code",
        }),
        auditEvent: expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.proposalReviewed,
          correlationId: supportOperatorGovernanceRequestContext.correlationId,
          reason: "Approved export back to code",
        }),
      }),
    );
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.proposalReviewed,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.runtimeConfig}:${platformModuleId.tenantBranding}:proposal-mutation:runtimeValue,codeValue,decidedBy,decisionReason`,
        }),
      ]),
    );
  });

  it("denies governance reads for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.listRuntimeConfigOverrides({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin",
            correlationId: "corr_org_admin",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          moduleId: platformModuleId.tenantBranding,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("denies governance proposal reads for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.listRuntimeConfigProposals({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin",
            correlationId: "corr_org_admin_proposals",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          moduleId: platformModuleId.tenantBranding,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("denies governance reads when the actor is unresolved", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.listRuntimeConfigOverrides({
          requestContext: {
            actorType: actorType.supportOperator,
            sessionId: "sess_unresolved_operator",
            correlationId: "corr_unresolved_operator",
            tenant: {
              scope: platformScope.platform,
              scopeId: platformScope.platform,
            },
          },
          moduleId: platformModuleId.tenantBranding,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceReadUnauthenticatedActorError",
      },
    });
  });

  it("denies governance audit-event reads for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.queryAuditEventsByModule({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin",
            correlationId: "corr_org_admin_audit_events",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          moduleId: platformModuleId.tenantBranding,
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("resolves governance request context from Valkey-backed session state", async () => {
    const { service, valkey } = await createAdminGovernanceHarness();

    await Effect.runPromise(
      valkey.writeSession({
        sessionId: supportOperatorGovernanceRequestContext.sessionId,
        requestContext: supportOperatorGovernanceRequestContext,
      }),
    );

    const result = await Effect.runPromise(
      service.resolveRequestContext({
        sessionId: supportOperatorGovernanceRequestContext.sessionId,
      }),
    );

    expect(result).toEqual(supportOperatorGovernanceRequestContext);
  });

  it("returns projected runtime-config overrides for support operators", async () => {
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        overrides: [
          {
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.companyName,
            scope: platformScope.organization,
            scopeId: "org_demo",
            value: "Acme Organization",
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: "usr_platform_operator",
            changedAt: "2026-04-22T10:00:00.000Z",
            approvalReason: "Approved override",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.listRuntimeConfigOverrides({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        value: "Acme Organization",
        approvalReason: "Approved override",
      }),
    ]);
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.runtimeConfig}:${platformModuleId.tenantBranding}:overrides:value,approvalReason`,
        }),
      ]),
    );
  });

  it("returns projected effective feature flags for the requested module", async () => {
    const organizationGovernanceRequestContext = {
      ...supportOperatorGovernanceRequestContext,
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
    } as const;
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        entitlements: [
          {
            entitlementId: "ent_tenant_branding_enabled",
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.enabled,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: "2026-04-25T10:00:00.000Z",
          },
          {
            entitlementId: "ent_tenant_branding_custom_domain",
            moduleId: platformModuleId.tenantBranding,
            featureKey: tenantBrandingFeatureFlag.customDomain,
            scope: platformScope.organization,
            scopeId: "org_1",
            active: true,
            grantedAt: "2026-04-25T10:00:00.000Z",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.listFeatureFlags({
        requestContext: organizationGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: tenantBrandingFeatureFlag.enabled,
          defaultEnabled: false,
          effectiveState: true,
          source: runtimeResolutionSource.entitlement,
          entitled: true,
          dependencies: [],
          lifecycle: featureFlagLifecycle.active,
          retirementPlan: "None — premium capability.",
          scope: platformScope.organization,
        }),
        expect.objectContaining({
          key: tenantBrandingFeatureFlag.customDomain,
          defaultEnabled: false,
          effectiveState: true,
          source: runtimeResolutionSource.entitlement,
          entitled: true,
          dependencies: [tenantBrandingFeatureFlag.enabled],
          lifecycle: featureFlagLifecycle.active,
          retirementPlan: "Retire only with a domain migration plan.",
          scope: platformScope.organization,
        }),
      ]),
    );
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.featureFlags}:${platformModuleId.tenantBranding}:flags:effectiveState`,
        }),
      ]),
    );
  });

  it("returns retired feature flags in projected admin views", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      service.listFeatureFlags({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.featureFlags,
      }),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: featureFlagsFeatureFlag.legacyRolloutCatalog,
          effectiveState: false,
          source: runtimeResolutionSource.retired,
          entitled: true,
          dependencies: [],
          lifecycle: featureFlagLifecycle.retired,
        }),
      ]),
    );
  });

  it("uses ancestor entitlements when projecting organization feature flags", async () => {
    const organizationGovernanceRequestContext = {
      ...supportOperatorGovernanceRequestContext,
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        enterpriseId: "ent_1",
        organizationId: "org_1",
      },
    } as const;
    const { service } = await createAdminGovernanceHarness({
      entitlements: [
        {
          entitlementId: "ent_tenant_branding_enabled_enterprise",
          moduleId: platformModuleId.tenantBranding,
          featureKey: tenantBrandingFeatureFlag.enabled,
          scope: platformScope.enterprise,
          scopeId: "ent_1",
          active: true,
          grantedAt: "2026-04-25T10:00:00.000Z",
        },
      ],
    });

    const result = await Effect.runPromise(
      service.listFeatureFlags({
        requestContext: organizationGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: tenantBrandingFeatureFlag.enabled,
          effectiveState: true,
          source: runtimeResolutionSource.entitlement,
          entitled: true,
          scope: platformScope.enterprise,
        }),
      ]),
    );
  });

  it("does not let stored enabling overrides bypass billable feature entitlements", async () => {
    const organizationGovernanceRequestContext = {
      ...supportOperatorGovernanceRequestContext,
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
    } as const;
    const { service } = await createAdminGovernanceHarness({
      overrides: [
        {
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingFeatureFlag.customDomain,
          scope: platformScope.organization,
          scopeId: "org_1",
          value: true,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: supportOperatorGovernanceRequestContext.actorId,
          changedAt: "2026-04-25T10:00:00.000Z",
        },
      ],
    });

    const result = await Effect.runPromise(
      service.listFeatureFlags({
        requestContext: organizationGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: tenantBrandingFeatureFlag.customDomain,
          effectiveState: false,
          source: runtimeResolutionSource.unentitledDefault,
          entitled: false,
        }),
      ]),
    );
    expect(
      result.find((flag) => flag.key === tenantBrandingFeatureFlag.customDomain)
        ?.scope,
    ).toBeUndefined();
  });

  it("returns projected effective feature flags from rollout-backed resolution", async () => {
    const organizationGovernanceRequestContext = {
      ...supportOperatorGovernanceRequestContext,
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
    } as const;
    const { service } = await createAdminGovernanceHarness({
      entitlements: [
        {
          entitlementId: "ent_tenant_branding_enabled",
          moduleId: platformModuleId.tenantBranding,
          featureKey: tenantBrandingFeatureFlag.enabled,
          scope: platformScope.organization,
          scopeId: "org_1",
          active: true,
          grantedAt: "2026-04-25T10:00:00.000Z",
        },
        {
          entitlementId: "ent_tenant_branding_custom_domain",
          moduleId: platformModuleId.tenantBranding,
          featureKey: tenantBrandingFeatureFlag.customDomain,
          scope: platformScope.organization,
          scopeId: "org_1",
          active: true,
          grantedAt: "2026-04-25T10:00:00.000Z",
        },
      ],
      featureFlagRollout: createFeatureFlagRollout({
        [tenantBrandingFeatureFlag.enabled]: {
          effectiveValue: true,
          definitionExists: true,
          resolvedScope: platformScope.platform,
          resolvedScopeId: platformScope.platform,
        },
        [tenantBrandingFeatureFlag.customDomain]: {
          effectiveValue: false,
          definitionExists: true,
          resolvedScope: platformScope.platform,
          resolvedScopeId: platformScope.platform,
        },
      }),
    });

    const result = await Effect.runPromise(
      service.listFeatureFlags({
        requestContext: organizationGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: tenantBrandingFeatureFlag.enabled,
          effectiveState: true,
          source: runtimeResolutionSource.rollout,
          entitled: true,
          scope: platformScope.platform,
        }),
        expect.objectContaining({
          key: tenantBrandingFeatureFlag.customDomain,
          effectiveState: false,
          source: runtimeResolutionSource.rollout,
          entitled: true,
          scope: platformScope.platform,
        }),
      ]),
    );
  });

  it("projects persisted cross-module dependency-disabled feature flags", async () => {
    const organizationGovernanceRequestContext = {
      ...supportOperatorGovernanceRequestContext,
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
    } as const;
    const { service } = await createAdminGovernanceHarness({
      overrides: [
        {
          moduleId: platformModuleId.emailDelivery,
          key: emailDeliveryFeatureFlag.enabled,
          scope: platformScope.platform,
          scopeId: platformScope.platform,
          value: false,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_platform_operator",
          changedAt: "2026-04-25T10:00:00.000Z",
        },
      ],
      entitlements: [
        {
          entitlementId: "ent_tenant_branding_enabled",
          moduleId: platformModuleId.tenantBranding,
          featureKey: tenantBrandingFeatureFlag.enabled,
          scope: platformScope.organization,
          scopeId: "org_1",
          active: true,
          grantedAt: "2026-04-25T10:00:00.000Z",
        },
        {
          entitlementId: "ent_tenant_branding_branded_emails",
          moduleId: platformModuleId.tenantBranding,
          featureKey: tenantBrandingFeatureFlag.brandedEmails,
          scope: platformScope.organization,
          scopeId: "org_1",
          active: true,
          grantedAt: "2026-04-25T10:00:00.000Z",
        },
      ],
    });

    const result = await Effect.runPromise(
      service.listFeatureFlags({
        requestContext: organizationGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: tenantBrandingFeatureFlag.brandedEmails,
          effectiveState: false,
          source: runtimeResolutionSource.dependencyDisabled,
          entitled: true,
        }),
      ]),
    );
  });

  it("reports disabled non-billable feature flags as entitled in admin projections", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      service.listFeatureFlags({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.runtimeConfig,
      }),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: runtimeConfigFeatureFlag.inlineDiffViewer,
          effectiveState: false,
          source: runtimeResolutionSource.codeDefault,
          entitled: true,
        }),
      ]),
    );
    expect(
      result.find(
        (flag) => flag.key === runtimeConfigFeatureFlag.inlineDiffViewer,
      )?.scope,
    ).toBeUndefined();
  });

  it("keeps module-gated non-billable flags entitled in admin projections", async () => {
    const { service } = await createAdminGovernanceHarness({
      overrides: [
        {
          moduleId: platformModuleId.runtimeConfig,
          key: runtimeConfigFeatureFlag.enabled,
          scope: platformScope.platform,
          scopeId: platformScope.platform,
          value: false,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_platform_operator",
          changedAt: "2026-04-25T10:00:00.000Z",
        },
      ],
    });

    const result = await Effect.runPromise(
      service.listFeatureFlags({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.runtimeConfig,
      }),
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: runtimeConfigFeatureFlag.inlineDiffViewer,
          effectiveState: false,
          source: runtimeResolutionSource.runtimeOverride,
          entitled: true,
          scope: platformScope.platform,
        }),
      ]),
    );
  });

  it("returns projected runtime-config overrides for platform operators", async () => {
    const { service } = await createAdminGovernanceHarness({
      overrides: [
        {
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          scope: platformScope.organization,
          scopeId: "org_demo",
          value: "Acme Organization",
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_platform_operator",
          changedAt: "2026-04-22T10:00:00.000Z",
          approvalReason: "Approved override",
        },
      ],
    });

    const result = await Effect.runPromise(
      service.listRuntimeConfigOverrides({
        requestContext: platformOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        value: "Acme Organization",
      }),
    ]);
  });

  it("audits visible sensitive proposal reads for support operators", async () => {
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        proposals: [
          {
            proposalId: "tenant-branding:companyName:update",
            moduleId: platformModuleId.tenantBranding,
            key: tenantBrandingConfigKey.companyName,
            action: runtimeChangeProposalAction.update,
            artifactPath:
              "specs/00-governance/runtime-config-proposals/tenant-branding.companyName.json",
            runtimeValue: "Acme Organization",
            codeValue: "Default Company Name",
            status: runtimeConfigSyncArtifactStatus.pending,
            generatedAt: "2026-04-22T10:00:00.000Z",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.listRuntimeConfigProposals({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        runtimeValue: "Acme Organization",
        codeValue: "Default Company Name",
      }),
    ]);
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.runtimeConfig}:${platformModuleId.tenantBranding}:proposals:runtimeValue,codeValue`,
        }),
      ]),
    );
  });

  it("returns projected runtime-config proposals for platform operators", async () => {
    const { service } = await createAdminGovernanceHarness({
      proposals: [
        {
          proposalId: "tenant-branding:companyName:update",
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          action: runtimeChangeProposalAction.update,
          artifactPath:
            "specs/00-governance/runtime-config-proposals/tenant-branding.companyName.json",
          runtimeValue: "Acme Organization",
          codeValue: "Default Company Name",
          status: runtimeConfigSyncArtifactStatus.pending,
          generatedAt: "2026-04-22T10:00:00.000Z",
        },
      ],
    });

    const result = await Effect.runPromise(
      service.listRuntimeConfigProposals({
        requestContext: platformOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        runtimeValue: "Acme Organization",
        codeValue: "Default Company Name",
      }),
    ]);
  });

  it("returns projected audit-log events for support operators", async () => {
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        auditEvents: [
          {
            eventId: "runtime-config:override:1",
            timestamp: "2026-04-22T10:00:00.000Z",
            actorId: "usr_platform_operator",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
            moduleId: platformModuleId.tenantBranding,
            action: runtimeConfigAuditAction.overrideChanged,
            target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
            reason: "Approved override",
            correlationId: "corr_runtime_config_override",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.queryAuditEventsByModule({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        actorId: "usr_platform_operator",
        tenantScopeId: "org_demo",
        target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
        reason: "Approved override",
      }),
    ]);
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.auditLog}:${platformModuleId.tenantBranding}:events:actorId,tenantScopeId,target,reason`,
        }),
      ]),
    );
  });

  it("returns projected audit-log events for platform operators", async () => {
    const { service } = await createAdminGovernanceHarness({
      auditEvents: [
        {
          eventId: "runtime-config:override:1",
          timestamp: "2026-04-22T10:00:00.000Z",
          actorId: "usr_platform_operator",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_demo",
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideChanged,
          target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
          reason: "Approved override",
          correlationId: "corr_runtime_config_override",
        },
      ],
    });

    const result = await Effect.runPromise(
      service.queryAuditEventsByModule({
        requestContext: platformOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        actorId: "usr_platform_operator",
        tenantScopeId: "org_demo",
        reason: "Approved override",
      }),
    ]);
  });

  it("returns projected audit-log events for a target for support operators", async () => {
    const target = `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`;
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        auditEvents: [
          {
            eventId: "runtime-config:override:1",
            timestamp: "2026-04-22T10:00:00.000Z",
            actorId: "usr_platform_operator",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
            moduleId: platformModuleId.tenantBranding,
            action: runtimeConfigAuditAction.overrideChanged,
            target,
            reason: "Approved override",
            correlationId: "corr_runtime_config_override",
          },
          {
            eventId: "runtime-config:override:2",
            timestamp: "2026-04-22T11:00:00.000Z",
            actorId: "usr_platform_operator",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
            moduleId: platformModuleId.tenantBranding,
            action: runtimeConfigAuditAction.overrideChanged,
            target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.supportEmail}:${platformScope.organization}:org_demo`,
            reason: "Approved support email override",
            correlationId: "corr_runtime_config_override_2",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.queryAuditEventsByTarget({
        requestContext: supportOperatorGovernanceRequestContext,
        moduleId: platformModuleId.tenantBranding,
        target,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        actorId: "usr_platform_operator",
        tenantScopeId: "org_demo",
        target,
        reason: "Approved override",
      }),
    ]);
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.auditLog}:${platformModuleId.tenantBranding}:target:${target}:events:actorId,tenantScopeId,target,reason`,
        }),
      ]),
    );
  });

  it("returns projected audit-log events for an actor for support operators", async () => {
    const actorId = "usr_platform_operator";
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        auditEvents: [
          {
            eventId: "runtime-config:override:actor-1",
            timestamp: "2026-04-22T10:00:00.000Z",
            actorId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
            moduleId: platformModuleId.tenantBranding,
            action: runtimeConfigAuditAction.overrideChanged,
            target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
            reason: "Approved override",
            correlationId: "corr_runtime_config_override_actor",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.queryAuditEventsByActor({
        requestContext: supportOperatorGovernanceRequestContext,
        actorId,
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        actorId,
        tenantScopeId: "org_demo",
      }),
    ]);
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.auditLog}:actor:${actorId}:events:actorId,tenantScopeId,target,reason`,
        }),
      ]),
    );
  });

  it("returns projected audit-log events for a tenant for support operators", async () => {
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        auditEvents: [
          {
            eventId: "runtime-config:override:tenant-1",
            timestamp: "2026-04-22T10:00:00.000Z",
            actorId: "usr_platform_operator",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
            moduleId: platformModuleId.tenantBranding,
            action: runtimeConfigAuditAction.overrideChanged,
            target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
            reason: "Approved override",
            correlationId: "corr_runtime_config_override_tenant",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.queryAuditEventsByTenant({
        requestContext: supportOperatorGovernanceRequestContext,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_demo",
      }),
    );

    expect(result).toEqual([
      expect.objectContaining({
        actorId: "usr_platform_operator",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_demo",
      }),
    ]);
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.auditLog}:tenant:${platformScope.organization}:org_demo:events:actorId,tenantScopeId,target,reason`,
        }),
      ]),
    );
  });

  it("exports projected audit-log events for filtered operator review", async () => {
    const actorId = "usr_platform_operator";
    const recordedBefore = "2026-04-22T10:30:00.000Z";
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        auditEvents: [
          {
            eventId: "runtime-config:export:1",
            timestamp: "2026-04-22T10:00:00.000Z",
            actorId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
            moduleId: platformModuleId.tenantBranding,
            action: runtimeConfigAuditAction.overrideChanged,
            target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
            reason: "Approved override",
            correlationId: "corr_runtime_config_export_1",
          },
          {
            eventId: "runtime-config:export:2",
            timestamp: "2026-04-22T11:00:00.000Z",
            actorId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
            moduleId: platformModuleId.tenantBranding,
            action: runtimeConfigAuditAction.overrideChanged,
            target: `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.supportEmail}:${platformScope.organization}:org_demo`,
            reason: "Approved support email override",
            correlationId: "corr_runtime_config_export_2",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.exportAuditEvents({
        requestContext: supportOperatorGovernanceRequestContext,
        filter: {
          actorId,
          recordedBefore,
        },
      }),
    );

    expect(result.recordCount).toBe(1);
    expect(result.filter).toEqual({
      actorId,
      recordedBefore,
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        eventId: "runtime-config:export:1",
        actorId,
      }),
    ]);
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: expect.stringContaining(
            `${platformModuleId.auditLog}:export:actor:${actorId}`,
          ),
        }),
        expect.objectContaining({
          moduleId: platformModuleId.auditLog,
          action: auditLogAuditAction.exported,
          target: expect.stringContaining(
            `export:actor:${actorId}|before:${recordedBefore}:records:1`,
          ),
        }),
      ]),
    );
  });

  it("rejects audit-log exports with non-ISO recordedBefore filters", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.exportAuditEvents({
          requestContext: supportOperatorGovernanceRequestContext,
          filter: {
            actorId: "usr_platform_operator",
            recordedBefore: "April 22, 2026 10:30:00 GMT",
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceAuditExportFilterError",
        reason: "recordedBefore must be a valid ISO-8601 timestamp.",
      },
    });
  });

  it("returns projected authorization inspection for support operators", async () => {
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        authorizationTuples: [
          {
            namespace: authorizationNamespace.tenant,
            object: "org_demo",
            relation: authorizationRelation.viewer,
            subject: "usr_member_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
          },
        ],
      },
    );

    const result = await Effect.runPromise(
      service.inspectAuthorization({
        requestContext: supportOperatorGovernanceRequestContext,
        checkInput: {
          requestContext: {
            actorType: actorType.organizationMember,
            actorId: "usr_member_1",
            sessionId: "sess_member_1",
            correlationId: "corr_authorization_inspection",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
            impersonation: {
              impersonatedActorId: "usr_member_1",
              approvedBy: supportOperatorGovernanceRequestContext.actorId,
              reason: "Investigate a customer access report",
            },
          },
          namespace: authorizationNamespace.tenant,
          object: "org_demo",
          relation: authorizationRelation.viewer,
          permissionScope: permissionScope.tenantRead,
        },
      }),
    );

    expect(result).toEqual(
      expect.objectContaining({
        allowSource: "matched-tuple",
        evaluatedActorType: actorType.organizationMember,
        evaluatedActorId: "usr_member_1",
        evaluatedSessionId: "sess_member_1",
        evaluatedCorrelationId: "corr_authorization_inspection",
        decision: expect.objectContaining({
          allowed: true,
          reason: "Matched persisted authorization relation.",
          matchedTuple: expect.objectContaining({
            namespace: authorizationNamespace.tenant,
            object: "org_demo",
            relation: authorizationRelation.viewer,
            subject: "usr_member_1",
          }),
        }),
        explanation: expect.objectContaining({
          matchedSubject: "usr_member_1",
          usedBreakGlass: false,
          impersonationActive: true,
          requestScope: platformScope.organization,
          requestScopeId: "org_demo",
        }),
      }),
    );
    expect(result.decision.matchedTuple).not.toHaveProperty("tenantScope");
    expect(result.decision.matchedTuple).not.toHaveProperty("tenantScopeId");
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.authorization}:${authorizationNamespace.tenant}:org_demo:${authorizationRelation.viewer}:inspection:evaluatedActorId,decision.matchedTuple.subject,explanation.subjectCandidates,explanation.matchedSubject`,
        }),
      ]),
    );
  });

  it("maps delegated-subject, break-glass, and denied authorization inspections", async () => {
    const checkInput = {
      requestContext: {
        actorType: actorType.organizationMember,
        actorId: "usr_member_1",
        sessionId: "sess_member_1",
        correlationId: "corr_authorization_branch_coverage",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_demo",
          organizationId: "org_demo",
        },
      },
      namespace: authorizationNamespace.tenant,
      object: "org_demo",
      relation: authorizationRelation.viewer,
      permissionScope: permissionScope.tenantRead,
    } as const;

    const createAuthorizationDouble = (input: {
      readonly decision: AuthorizationDecision;
      readonly explanation: AuthorizationExplanation;
    }): Pick<AuthorizationModuleService, "check" | "explain"> => ({
      check: vi.fn(() => Effect.succeed(input.decision)),
      explain: vi.fn(() => Effect.succeed(input.explanation)),
    });

    const delegatedSubjectHarness = await createAdminGovernanceHarness({
      authorization: createAuthorizationDouble({
        decision: {
          allowed: true,
          reason: "Matched delegated authorization subject.",
          auditRequired: false,
          cacheKey: "authorization:delegated-subject",
        },
        explanation: {
          subjectCandidates: ["usr_member_1", "actor:usr_member_1"],
          matchedSubject: "actor:usr_member_1",
          usedBreakGlass: false,
          requestScope: platformScope.organization,
          requestScopeId: "org_demo",
          cacheKey: "authorization:delegated-subject",
        },
      }),
    });

    const delegatedSubjectResult = await Effect.runPromise(
      delegatedSubjectHarness.service.inspectAuthorization({
        requestContext: supportOperatorGovernanceRequestContext,
        checkInput,
      }),
    );

    expect(delegatedSubjectResult.allowSource).toBe("delegated-subject");
    expect(delegatedSubjectResult.decision.allowed).toBe(true);
    expect(delegatedSubjectResult.decision.matchedTuple).toBeUndefined();

    const breakGlassHarness = await createAdminGovernanceHarness({
      authorization: createAuthorizationDouble({
        decision: {
          allowed: true,
          reason: "Allowed via break-glass context.",
          auditRequired: true,
          cacheKey: "authorization:break-glass",
        },
        explanation: {
          subjectCandidates: ["usr_support_operator", "actor:usr_member_1"],
          usedBreakGlass: true,
          requestScope: platformScope.organization,
          requestScopeId: "org_demo",
          cacheKey: "authorization:break-glass",
        },
      }),
    });

    const breakGlassResult = await Effect.runPromise(
      breakGlassHarness.service.inspectAuthorization({
        requestContext: supportOperatorGovernanceRequestContext,
        checkInput,
      }),
    );

    expect(breakGlassResult.allowSource).toBe("break-glass");
    expect(breakGlassResult.explanation.usedBreakGlass).toBe(true);
    expect(breakGlassResult.decision.matchedTuple).toBeUndefined();

    const deniedHarness = await createAdminGovernanceHarness({
      authorization: createAuthorizationDouble({
        decision: {
          allowed: false,
          reason: "Access denied because no authorization rule matched.",
          auditRequired: false,
          cacheKey: "authorization:denied",
        },
        explanation: {
          subjectCandidates: ["usr_member_1", "actor:usr_member_1"],
          usedBreakGlass: false,
          requestScope: platformScope.organization,
          requestScopeId: "org_demo",
          cacheKey: "authorization:denied",
        },
      }),
    });

    const deniedResult = await Effect.runPromise(
      deniedHarness.service.inspectAuthorization({
        requestContext: supportOperatorGovernanceRequestContext,
        checkInput,
      }),
    );

    expect(deniedResult.allowSource).toBe("denied");
    expect(deniedResult.decision.allowed).toBe(false);
    expect(deniedResult.decision.matchedTuple).toBeUndefined();
  });

  it("writes projected authorization tuples for support operators", async () => {
    const writeAuthorizationTuple = vi.fn((tuple: OryKetoTuple) =>
      Effect.succeed(tuple),
    );
    const { insertedAuditEvents, service } = await createAdminGovernanceHarness(
      {
        writeAuthorizationTuple,
      },
    );

    const result = await Effect.runPromise(
      service.writeAuthorizationTuple({
        requestContext: supportOperatorGovernanceRequestContext,
        tuple: {
          namespace: authorizationNamespace.tenant,
          object: "org_demo",
          relation: authorizationRelation.viewer,
          subject: "usr_member_2",
        },
        reason: "Grant reviewed tenant viewer access.",
      }),
    );

    expect(writeAuthorizationTuple).toHaveBeenCalledWith({
      namespace: authorizationNamespace.tenant,
      object: "org_demo",
      relation: authorizationRelation.viewer,
      subject: "usr_member_2",
    });
    expect(result).toEqual(
      expect.objectContaining({
        tuple: {
          namespace: authorizationNamespace.tenant,
          object: "org_demo",
          relation: authorizationRelation.viewer,
          subject: "usr_member_2",
        },
        auditEvent: expect.objectContaining({
          moduleId: platformModuleId.authorization,
          action: authorizationAuditAction.tupleChanged,
          target: `${platformModuleId.authorization}:${authorizationNamespace.tenant}:org_demo:${authorizationRelation.viewer}:usr_member_2`,
          reason: "Grant reviewed tenant viewer access.",
          correlationId: supportOperatorGovernanceRequestContext.correlationId,
        }),
      }),
    );
    expect(insertedAuditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.authorization,
          action: authorizationAuditAction.tupleChanged,
          target: `${platformModuleId.authorization}:${authorizationNamespace.tenant}:org_demo:${authorizationRelation.viewer}:usr_member_2`,
        }),
        expect.objectContaining({
          moduleId: platformModuleId.fieldSecurity,
          action: fieldSecurityAuditAction.sensitiveRead,
          target: `${platformModuleId.authorization}:${authorizationNamespace.tenant}:org_demo:${authorizationRelation.viewer}:usr_member_2:tuple-mutation:tuple.subject`,
        }),
      ]),
    );
  });

  it("denies authorization tuple writes for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.writeAuthorizationTuple({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin_tuple_write",
            correlationId: "corr_org_admin_tuple_write",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          tuple: {
            namespace: authorizationNamespace.tenant,
            object: "org_demo",
            relation: authorizationRelation.viewer,
            subject: "usr_member_2",
          },
          reason: "Attempt unauthorized tuple write.",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceMutationAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });

  it("requires a session-backed context for authorization tuple writes", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.writeAuthorizationTuple({
          requestContext: {
            actorType: actorType.supportOperator,
            actorId: "usr_support_operator",
            correlationId: "corr_support_operator_tuple_write",
            tenant: {
              scope: platformScope.platform,
              scopeId: platformScope.platform,
            },
          },
          tuple: {
            namespace: authorizationNamespace.tenant,
            object: "org_demo",
            relation: authorizationRelation.viewer,
            subject: "usr_member_2",
          },
          reason: "Attempt tuple write without a session-backed context.",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceUnauthenticatedActorError",
      },
    });
  });

  it("denies authorization inspection for non-operator actors", async () => {
    const { service } = await createAdminGovernanceHarness();

    const result = await Effect.runPromise(
      Effect.either(
        service.inspectAuthorization({
          requestContext: {
            actorType: actorType.organizationAdmin,
            actorId: "usr_org_admin",
            sessionId: "sess_org_admin",
            correlationId: "corr_org_admin_authorization_inspection",
            tenant: {
              scope: platformScope.organization,
              scopeId: "org_demo",
              organizationId: "org_demo",
            },
          },
          checkInput: {
            requestContext: {
              actorType: actorType.organizationMember,
              actorId: "usr_member_1",
              sessionId: "sess_member_1",
              correlationId: "corr_member_access",
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_demo",
                organizationId: "org_demo",
              },
            },
            namespace: authorizationNamespace.tenant,
            object: "org_demo",
            relation: authorizationRelation.viewer,
            permissionScope: permissionScope.tenantRead,
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: actorType.organizationAdmin,
      },
    });
  });
});
