import { Effect, ParseResult, Schema } from "effect";
import { tenantBrandingConfigKey } from "@comvestec/config";
import {
  authorizationAuditAction,
  authorizationNamespace,
  authorizationRelation,
  actorType,
  featureFlagLifecycle,
  permissionScope,
  platformModuleId,
  platformScope,
  runtimeConfigAuditAction,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
  tenantBrandingFeatureFlag,
} from "@comvestec/contracts";
import {
  runtimeConfigProposalDecisionStatus,
  runtimeConfigSyncArtifactStatus,
} from "@comvestec/modules";
import {
  adminGovernanceApiPath,
  createAdminGovernanceHttpHandler,
  subscriberJourneySessionHeaderName,
  type AdminGovernanceService,
} from "@comvestec/platform";

const unexpectedAdminGovernanceServiceEffect = <A>() =>
  Effect.die(new Error("Unexpected admin governance test service call."));

const createAdminGovernanceServiceDouble = (
  overrides: Partial<AdminGovernanceService>,
): AdminGovernanceService => ({
  resolveRequestContext:
    overrides.resolveRequestContext ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  listRuntimeConfigOverrides:
    overrides.listRuntimeConfigOverrides ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  listFeatureFlags:
    overrides.listFeatureFlags ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  inspectAuthorization:
    overrides.inspectAuthorization ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  writeAuthorizationTuple:
    overrides.writeAuthorizationTuple ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  listAuthorizationTuples:
    overrides.listAuthorizationTuples ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  deleteAuthorizationTuple:
    overrides.deleteAuthorizationTuple ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  listProjectionProfiles:
    overrides.listProjectionProfiles ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  listActionPolicies:
    overrides.listActionPolicies ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  submitRuntimeConfigOverrideProposal:
    overrides.submitRuntimeConfigOverrideProposal ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  reviewRuntimeConfigProposal:
    overrides.reviewRuntimeConfigProposal ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  persistRuntimeConfigProposals:
    overrides.persistRuntimeConfigProposals ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  listRuntimeConfigProposals:
    overrides.listRuntimeConfigProposals ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  queryAuditEventsByModule:
    overrides.queryAuditEventsByModule ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  queryAuditEventsByActor:
    overrides.queryAuditEventsByActor ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  queryAuditEventsByTenant:
    overrides.queryAuditEventsByTenant ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  queryAuditEventsByTarget:
    overrides.queryAuditEventsByTarget ??
    (() => unexpectedAdminGovernanceServiceEffect()),
  exportAuditEvents:
    overrides.exportAuditEvents ??
    (() => unexpectedAdminGovernanceServiceEffect()),
});

const createTestHandler = (service: Partial<AdminGovernanceService>) =>
  createAdminGovernanceHttpHandler((use) =>
    use(createAdminGovernanceServiceDouble(service)),
  );

const parseFailureEffect = <A>() =>
  Schema.decodeUnknown(Schema.Struct({ required: Schema.NonEmptyString }))({
    required: "",
  }) as Effect.Effect<A, ParseResult.ParseError>;

describe("platform admin governance http", () => {
  it("does not trust body session ids when the trusted header is missing", async () => {
    const listFeatureFlags = vi.fn(() =>
      unexpectedAdminGovernanceServiceEffect(),
    );
    const handler = createTestHandler({
      listFeatureFlags,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listFeatureFlags}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId: "sess_body_only_governance",
              moduleId: platformModuleId.tenantBranding,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Admin governance requests require a valid authenticated session.",
    });
    expect(listFeatureFlags).not.toHaveBeenCalled();
  });

  it("routes feature-flag listing through trusted session context", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_feature_flags",
        correlationId: "corr_admin_governance_feature_flags",
        reason: "Inspect effective feature flags",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
      }),
    );
    const listFeatureFlags = vi.fn(() =>
      Effect.succeed([
        {
          key: tenantBrandingFeatureFlag.customDomain,
          description: "Allow tenant custom domains.",
          owner: platformModuleId.tenantBranding,
          purpose: "Gate custom-domain configuration and activation.",
          defaultEnabled: false,
          effectiveState: true,
          source: runtimeResolutionSource.runtimeOverride,
          entitled: true,
          dependencies: [tenantBrandingFeatureFlag.enabled],
          lifecycle: featureFlagLifecycle.active,
          retirementPlan: "Retire only with a domain migration plan.",
          scope: platformScope.organization,
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      listFeatureFlags,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listFeatureFlags}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_feature_flags",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_feature_flags",
              moduleId: platformModuleId.tenantBranding,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        key: tenantBrandingFeatureFlag.customDomain,
        description: "Allow tenant custom domains.",
        owner: platformModuleId.tenantBranding,
        purpose: "Gate custom-domain configuration and activation.",
        defaultEnabled: false,
        effectiveState: true,
        source: runtimeResolutionSource.runtimeOverride,
        entitled: true,
        dependencies: [tenantBrandingFeatureFlag.enabled],
        lifecycle: featureFlagLifecycle.active,
        retirementPlan: "Retire only with a domain migration plan.",
        scope: platformScope.organization,
      },
    ]);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_feature_flags",
    });
    expect(listFeatureFlags).toHaveBeenCalledWith({
      requestContext: {
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_feature_flags",
        correlationId: "corr_admin_governance_feature_flags",
        reason: "Inspect effective feature flags",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
      },
      moduleId: platformModuleId.tenantBranding,
    });
  });

  it("routes feature-flag override submissions through trusted session context", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_feature_flag_submit",
        correlationId: "corr_admin_governance_feature_flag_submit",
        reason: "Enable tenant branding for approved rollout",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const submitRuntimeConfigOverrideProposal = vi.fn((input) =>
      Effect.succeed({
        proposal: {
          proposalId: `${input.moduleId}:${input.key}:${input.scope}:${input.scopeId}:override`,
          moduleId: input.moduleId,
          key: input.key,
          scope: input.scope,
          scopeId: input.scopeId,
          value: input.value,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_support_operator",
          changedAt: "2026-04-26T10:00:00.000Z",
          approvalReason: input.approvalReason,
          status: runtimeConfigSyncArtifactStatus.pending,
        },
        auditEvent: {
          eventId:
            "tenant-branding:feature-flag.override-proposed:corr_admin_governance_feature_flag_submit",
          timestamp: "2026-04-26T10:00:00.000Z",
          actorId: "usr_support_operator",
          tenantScope: platformScope.platform,
          tenantScopeId: platformScope.platform,
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.overrideProposed,
          target: `${platformModuleId.tenantBranding}:${tenantBrandingFeatureFlag.enabled}:${platformScope.organization}:org_demo`,
          reason: input.approvalReason,
          correlationId: "corr_admin_governance_feature_flag_submit",
        },
      }),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      submitRuntimeConfigOverrideProposal,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.submitRuntimeConfigOverrideProposal}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_feature_flag_submit",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_feature_flag_submit",
              moduleId: platformModuleId.tenantBranding,
              key: tenantBrandingFeatureFlag.enabled,
              scope: platformScope.organization,
              scopeId: "org_demo",
              value: true,
              approvalReason: "Enable tenant branding for approved rollout",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_feature_flag_submit",
    });
    expect(submitRuntimeConfigOverrideProposal).toHaveBeenCalledWith({
      requestContext: {
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_feature_flag_submit",
        correlationId: "corr_admin_governance_feature_flag_submit",
        reason: "Enable tenant branding for approved rollout",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      },
      moduleId: platformModuleId.tenantBranding,
      key: tenantBrandingFeatureFlag.enabled,
      scope: platformScope.organization,
      scopeId: "org_demo",
      value: true,
      approvalReason: "Enable tenant branding for approved rollout",
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          key: tenantBrandingFeatureFlag.enabled,
          value: true,
        }),
        auditEvent: expect.objectContaining({
          action: runtimeConfigAuditAction.overrideProposed,
        }),
      }),
    );
  });

  it("maps runtime-governed override validation failures to bad requests", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_feature_flag_submit_error",
        correlationId: "corr_admin_governance_feature_flag_submit_error",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const submitRuntimeConfigOverrideProposal = vi.fn(() =>
      Effect.fail({
        _tag: "AdminGovernanceRuntimeGovernedOverrideValidationError",
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.enabled,
        reason:
          "Feature-flag override value for tenant-branding.enabled must be a boolean.",
      } as const),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      submitRuntimeConfigOverrideProposal,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.submitRuntimeConfigOverrideProposal}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_feature_flag_submit_error",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_feature_flag_submit_error",
              moduleId: platformModuleId.tenantBranding,
              key: tenantBrandingFeatureFlag.enabled,
              scope: platformScope.organization,
              scopeId: "org_demo",
              value: "false",
              approvalReason: "Attempt invalid string feature-flag override",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Feature-flag override value for tenant-branding.enabled must be a boolean.",
    });
  });

  it("maps raw parse failures from admin governance execution to server errors", async () => {
    const handler = createAdminGovernanceHttpHandler(() =>
      parseFailureEffect(),
    );

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listFeatureFlags}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_parse_failure",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_parse_failure",
              moduleId: platformModuleId.tenantBranding,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Admin governance request failed.",
    });
  });

  it("routes authorization inspection through trusted session context", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_authorization",
        correlationId: "corr_admin_governance_authorization",
        reason: "Inspect delegated authorization",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const inspectAuthorization = vi.fn((input) =>
      Effect.succeed({
        allowSource: "matched-tuple" as const,
        evaluatedActorType: input.checkInput.requestContext.actorType,
        evaluatedActorId: input.checkInput.requestContext.actorId,
        evaluatedSessionId: input.checkInput.requestContext.sessionId,
        evaluatedCorrelationId: input.checkInput.requestContext.correlationId,
        decision: {
          allowed: true,
          reason: "Matched persisted authorization relation.",
          auditRequired: false,
          matchedTuple: {
            namespace: authorizationNamespace.tenant,
            object: "org_demo",
            relation: authorizationRelation.viewer,
            subject: "usr_member_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
          },
        },
        explanation: {
          subjectCandidates: ["usr_member_1", "actor:usr_member_1"],
          matchedSubject: "usr_member_1",
          usedBreakGlass: false,
          impersonationActive: false,
          requestScope: platformScope.organization,
          requestScopeId: "org_demo",
        },
      }),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      inspectAuthorization,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.inspectAuthorization}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_authorization",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_authorization",
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
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_authorization",
    });
    expect(inspectAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
        checkInput: expect.objectContaining({
          namespace: authorizationNamespace.tenant,
          object: "org_demo",
          relation: authorizationRelation.viewer,
          requestContext: expect.objectContaining({
            actorId: "usr_member_1",
          }),
        }),
      }),
    );
    const body = await response.json();

    expect(body).toEqual(
      expect.objectContaining({
        allowSource: "matched-tuple",
        decision: {
          allowed: true,
          reason: "Matched persisted authorization relation.",
          auditRequired: false,
          matchedTuple: {
            namespace: authorizationNamespace.tenant,
            object: "org_demo",
            relation: authorizationRelation.viewer,
            subject: "usr_member_1",
          },
        },
        explanation: expect.objectContaining({
          matchedSubject: "usr_member_1",
          impersonationActive: false,
        }),
      }),
    );

    expect(body.decision.matchedTuple).not.toHaveProperty("tenantScope");
    expect(body.decision.matchedTuple).not.toHaveProperty("tenantScopeId");
  });

  it("maps delegated authorization dependency failures to backend dependency errors", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_authorization_error",
        correlationId: "corr_admin_governance_authorization_error",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const inspectAuthorization = vi.fn(() =>
      Effect.fail({
        _tag: "AuthorizationDelegatedCheckError",
        reason: "Keto unavailable",
        cause: new Error("keto unavailable"),
      } as const),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      inspectAuthorization,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.inspectAuthorization}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_authorization_error",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_authorization_error",
              checkInput: {
                requestContext: {
                  actorType: actorType.organizationMember,
                  actorId: "usr_member_1",
                  sessionId: "sess_member_1",
                  correlationId: "corr_member_access_error",
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
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("routes authorization tuple writes through trusted session context", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_tuple_write",
        correlationId: "corr_admin_governance_tuple_write",
        reason: "Grant reviewed tenant viewer access",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const writeAuthorizationTuple = vi.fn((input) =>
      Effect.succeed({
        tuple: {
          namespace: authorizationNamespace.tenant,
          object: input.tuple.object,
          relation: input.tuple.relation,
          subject: input.tuple.subject,
          tenantScope: platformScope.organization,
        },
        auditEvent: {
          eventId:
            "authorization:tuple.changed:corr_admin_governance_tuple_write",
          timestamp: "2026-04-26T10:00:00.000Z",
          actorId: "usr_support_operator",
          tenantScope: platformScope.platform,
          tenantScopeId: platformScope.platform,
          moduleId: platformModuleId.authorization,
          action: authorizationAuditAction.tupleChanged,
          target: `${platformModuleId.authorization}:${authorizationNamespace.tenant}:${input.tuple.object}:${input.tuple.relation}:${input.tuple.subject}`,
          reason: input.reason,
          correlationId: "corr_admin_governance_tuple_write",
        },
      }),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      writeAuthorizationTuple,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.writeAuthorizationTuple}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_tuple_write",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_tuple_write",
              tuple: {
                namespace: authorizationNamespace.tenant,
                object: "org_demo",
                relation: authorizationRelation.viewer,
                subject: "usr_member_2",
              },
              reason: "Grant reviewed tenant viewer access.",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_tuple_write",
    });
    expect(writeAuthorizationTuple).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
        tuple: {
          namespace: authorizationNamespace.tenant,
          object: "org_demo",
          relation: authorizationRelation.viewer,
          subject: "usr_member_2",
        },
        reason: "Grant reviewed tenant viewer access.",
      }),
    );

    const body = await response.json();

    expect(body).toEqual(
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
          reason: "Grant reviewed tenant viewer access.",
        }),
      }),
    );
    expect(body.tuple).not.toHaveProperty("tenantScope");
  });

  it("maps authorization tuple write dependency failures to backend dependency errors", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_tuple_write_error",
        correlationId: "corr_admin_governance_tuple_write_error",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const writeAuthorizationTuple = vi.fn(() =>
      Effect.fail({
        _tag: "OryKetoAdapterRequestError",
        operation: "writeTuple",
        cause: new Error("keto unavailable"),
      } as const),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      writeAuthorizationTuple,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.writeAuthorizationTuple}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_tuple_write_error",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_tuple_write_error",
              tuple: {
                namespace: authorizationNamespace.tenant,
                object: "org_demo",
                relation: authorizationRelation.viewer,
                subject: "usr_member_2",
              },
              reason: "Grant reviewed tenant viewer access.",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("routes governance read requests through trusted session context", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_read",
        correlationId: "corr_admin_governance_read",
        reason: "Inspect runtime-config overrides",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const listRuntimeConfigOverrides = vi.fn((input) =>
      Effect.succeed([
        {
          moduleId: input.moduleId,
          key: tenantBrandingConfigKey.companyName,
          scope: platformScope.organization,
          scopeId: "org_demo",
          value: "[REDACTED]",
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "[REDACTED]",
          changedAt: "[REDACTED]",
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      listRuntimeConfigOverrides,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigOverrides}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_read",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_read",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_read",
    });
    expect(listRuntimeConfigOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: platformModuleId.runtimeConfig,
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "[REDACTED]",
        }),
      ]),
    );
  });

  it("allows platform operators to read governance overrides through the HTTP adapter", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.platformOperator,
        actorId: "usr_platform_operator",
        sessionId: "sess_platform_operator",
        correlationId: "corr_platform_operator",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const listRuntimeConfigOverrides = vi.fn((input) =>
      Effect.succeed([
        {
          moduleId: input.moduleId,
          key: tenantBrandingConfigKey.companyName,
          scope: platformScope.organization,
          scopeId: "org_demo",
          value: "Acme Organization",
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: "usr_platform_operator",
          changedAt: "2026-04-22T10:00:00.000Z",
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      listRuntimeConfigOverrides,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigOverrides}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_platform_operator",
            },
            body: JSON.stringify({
              sessionId: "sess_platform_operator",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_platform_operator",
    });
    expect(listRuntimeConfigOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: "Acme Organization",
        }),
      ]),
    );
  });

  it("routes governance proposal reads through trusted session context", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_proposals",
        correlationId: "corr_admin_governance_proposals",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const listRuntimeConfigProposals = vi.fn((input) =>
      Effect.succeed([
        {
          proposalId: `${input.moduleId}:proposal-1`,
          moduleId: input.moduleId,
          key: tenantBrandingConfigKey.companyName,
          action: runtimeChangeProposalAction.update,
          artifactPath:
            "specs/00-governance/runtime-config-proposals/demo.json",
          runtimeValue: "Acme Organization",
          codeValue: "Default Company Name",
          status: runtimeConfigSyncArtifactStatus.pending,
          generatedAt: "2026-04-22T10:00:00.000Z",
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      listRuntimeConfigProposals,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigProposals}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_proposals",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_proposals",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_proposals",
    });
    expect(listRuntimeConfigProposals).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: platformModuleId.runtimeConfig,
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtimeValue: "Acme Organization",
        }),
      ]),
    );
  });

  it("allows platform operators to read governance proposals through the HTTP adapter", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.platformOperator,
        actorId: "usr_platform_operator",
        sessionId: "sess_platform_operator_proposals",
        correlationId: "corr_platform_operator_proposals",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const listRuntimeConfigProposals = vi.fn((input) =>
      Effect.succeed([
        {
          proposalId: `${input.moduleId}:proposal-1`,
          moduleId: input.moduleId,
          key: tenantBrandingConfigKey.companyName,
          action: runtimeChangeProposalAction.update,
          artifactPath:
            "specs/00-governance/runtime-config-proposals/demo.json",
          runtimeValue: "Acme Organization",
          codeValue: "Default Company Name",
          status: runtimeConfigSyncArtifactStatus.pending,
          generatedAt: "2026-04-22T10:00:00.000Z",
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      listRuntimeConfigProposals,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigProposals}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_platform_operator_proposals",
            },
            body: JSON.stringify({
              sessionId: "sess_platform_operator_proposals",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_platform_operator_proposals",
    });
    expect(listRuntimeConfigProposals).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runtimeValue: "Acme Organization",
        }),
      ]),
    );
  });

  it("routes governance audit-event reads through trusted session context", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_audit_events",
        correlationId: "corr_admin_governance_audit_events",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const queryAuditEventsByModule = vi.fn((input) =>
      Effect.succeed([
        {
          eventId: `${input.moduleId}:event-1`,
          timestamp: "2026-04-22T10:00:00.000Z",
          actorId: "usr_platform_operator",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_demo",
          moduleId: input.moduleId,
          action: runtimeConfigAuditAction.overrideChanged,
          target: `${platformModuleId.tenantBranding}:tenant-branding.companyName:${platformScope.organization}:org_demo`,
          reason: "Approved override",
          correlationId: "corr_runtime_config_override",
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      queryAuditEventsByModule,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByModule}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_audit_events",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_audit_events",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_audit_events",
    });
    expect(queryAuditEventsByModule).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: platformModuleId.runtimeConfig,
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "usr_platform_operator",
        }),
      ]),
    );
  });

  it("allows platform operators to read governance audit events through the HTTP adapter", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.platformOperator,
        actorId: "usr_platform_operator",
        sessionId: "sess_platform_operator_audit_events",
        correlationId: "corr_platform_operator_audit_events",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const queryAuditEventsByModule = vi.fn((input) =>
      Effect.succeed([
        {
          eventId: `${input.moduleId}:event-1`,
          timestamp: "2026-04-22T10:00:00.000Z",
          actorId: "usr_platform_operator",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_demo",
          moduleId: input.moduleId,
          action: runtimeConfigAuditAction.overrideChanged,
          target: `${platformModuleId.tenantBranding}:tenant-branding.companyName:${platformScope.organization}:org_demo`,
          reason: "Approved override",
          correlationId: "corr_runtime_config_override",
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      queryAuditEventsByModule,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByModule}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_platform_operator_audit_events",
            },
            body: JSON.stringify({
              sessionId: "sess_platform_operator_audit_events",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_platform_operator_audit_events",
    });
    expect(queryAuditEventsByModule).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "usr_platform_operator",
        }),
      ]),
    );
  });

  it("routes governance audit-event target reads through trusted session context", async () => {
    const target = `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`;
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_audit_target",
        correlationId: "corr_admin_governance_audit_target",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const queryAuditEventsByTarget = vi.fn((input) =>
      Effect.succeed([
        {
          eventId: `${input.moduleId}:event-1`,
          timestamp: "2026-04-22T10:00:00.000Z",
          actorId: "usr_platform_operator",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_demo",
          moduleId: input.moduleId,
          action: runtimeConfigAuditAction.overrideChanged,
          target: input.target,
          reason: "Approved override",
          correlationId: "corr_runtime_config_override",
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      queryAuditEventsByTarget,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByTarget}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_audit_target",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_audit_target",
              moduleId: platformModuleId.runtimeConfig,
              target,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_audit_target",
    });
    expect(queryAuditEventsByTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: platformModuleId.runtimeConfig,
        target,
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: "usr_platform_operator",
          target,
        }),
      ]),
    );
  });

  it("routes governance audit-event actor reads through trusted session context", async () => {
    const actorId = "usr_platform_operator";
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_audit_actor",
        correlationId: "corr_admin_governance_audit_actor",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const queryAuditEventsByActor = vi.fn((input) =>
      Effect.succeed([
        {
          eventId: `${input.actorId}:event-1`,
          timestamp: "2026-04-22T10:00:00.000Z",
          actorId: input.actorId,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_demo",
          moduleId: platformModuleId.runtimeConfig,
          action: runtimeConfigAuditAction.overrideChanged,
          target: `${platformModuleId.tenantBranding}:tenant-branding.companyName:${platformScope.organization}:org_demo`,
          reason: "Approved override",
          correlationId: "corr_runtime_config_override",
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      queryAuditEventsByActor,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByActor}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_audit_actor",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_audit_actor",
              actorId,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_audit_actor",
    });
    expect(queryAuditEventsByActor).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId,
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId,
        }),
      ]),
    );
  });

  it("routes governance audit-event tenant reads through trusted session context", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_audit_tenant",
        correlationId: "corr_admin_governance_audit_tenant",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const queryAuditEventsByTenant = vi.fn((input) =>
      Effect.succeed([
        {
          eventId: `${input.tenantScope}:${input.tenantScopeId}:event-1`,
          timestamp: "2026-04-22T10:00:00.000Z",
          actorId: "usr_platform_operator",
          tenantScope: input.tenantScope,
          tenantScopeId: input.tenantScopeId,
          moduleId: platformModuleId.runtimeConfig,
          action: runtimeConfigAuditAction.overrideChanged,
          target: `${platformModuleId.tenantBranding}:tenant-branding.companyName:${input.tenantScope}:${input.tenantScopeId}`,
          reason: "Approved override",
          correlationId: "corr_runtime_config_override",
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      queryAuditEventsByTenant,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByTenant}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_audit_tenant",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_audit_tenant",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_demo",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_audit_tenant",
    });
    expect(queryAuditEventsByTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_demo",
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantScope: platformScope.organization,
          tenantScopeId: "org_demo",
        }),
      ]),
    );
  });

  it("routes governance audit-event exports through trusted session context", async () => {
    const actorId = "usr_platform_operator";
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_audit_export",
        correlationId: "corr_admin_governance_audit_export",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const exportAuditEvents = vi.fn((input) =>
      Effect.succeed({
        exportedAt: "2026-04-22T10:15:00.000Z",
        recordCount: 1,
        filter: input.filter,
        events: [
          {
            eventId: `${actorId}:event-1`,
            timestamp: "2026-04-22T10:00:00.000Z",
            actorId,
            tenantScope: platformScope.organization,
            tenantScopeId: "org_demo",
            moduleId: platformModuleId.runtimeConfig,
            action: runtimeConfigAuditAction.overrideChanged,
            target: `${platformModuleId.tenantBranding}:tenant-branding.companyName:${platformScope.organization}:org_demo`,
            reason: "Approved override",
            correlationId: "corr_runtime_config_export",
          },
        ],
      }),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      exportAuditEvents,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.exportAuditEvents}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_audit_export",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_audit_export",
              filter: {
                actorId,
                recordedBefore: "2026-04-22T10:30:00.000Z",
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_audit_export",
    });
    expect(exportAuditEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: {
          actorId,
          recordedBefore: "2026-04-22T10:30:00.000Z",
        },
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        recordCount: 1,
        filter: {
          actorId,
          recordedBefore: "2026-04-22T10:30:00.000Z",
        },
      }),
    );
  });

  it("returns 400 for invalid governance audit-export filters", async () => {
    const exportAuditEvents = vi.fn(() =>
      Effect.fail({
        _tag: "AdminGovernanceAuditExportFilterError",
        reason:
          "Audit export requires at least one anchor filter: moduleId, actorId, or tenantScope plus tenantScopeId.",
      } as const),
    );
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.succeed({
          actorType: actorType.supportOperator,
          actorId: "usr_support_operator",
          sessionId: "sess_invalid_export_filter",
          correlationId: "corr_invalid_export_filter",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        }),
      exportAuditEvents,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.exportAuditEvents}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_invalid_export_filter",
            },
            body: JSON.stringify({
              sessionId: "sess_invalid_export_filter",
              filter: {},
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Audit export requires at least one anchor filter: moduleId, actorId, or tenantScope plus tenantScopeId.",
    });
  });

  it("returns 401 when governance reads lack a valid session", async () => {
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.fail({
          _tag: "AdminGovernanceRequestContextNotFoundError",
          sessionId: "sess_missing",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigOverrides}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_missing",
            },
            body: JSON.stringify({
              sessionId: "sess_missing",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Admin governance reads require a valid authenticated session.",
    });
  });

  it("returns 502 when a resolved governance session payload is malformed", async () => {
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.fail({
          _tag: "AdminGovernanceRequestContextMalformedError",
          sessionId: "sess_malformed",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigOverrides}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_malformed",
            },
            body: JSON.stringify({
              sessionId: "sess_malformed",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns 401 when governance proposal reads lack a valid session", async () => {
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.fail({
          _tag: "AdminGovernanceRequestContextNotFoundError",
          sessionId: "sess_missing_proposals",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigProposals}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_missing_proposals",
            },
            body: JSON.stringify({
              sessionId: "sess_missing_proposals",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Admin governance reads require a valid authenticated session.",
    });
  });

  it("returns 502 when a governance proposal session payload is malformed", async () => {
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.fail({
          _tag: "AdminGovernanceRequestContextMalformedError",
          sessionId: "sess_malformed_proposals",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigProposals}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_malformed_proposals",
            },
            body: JSON.stringify({
              sessionId: "sess_malformed_proposals",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns 401 when governance audit reads lack a valid session", async () => {
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.fail({
          _tag: "AdminGovernanceRequestContextNotFoundError",
          sessionId: "sess_missing_audit",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByModule}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_missing_audit",
            },
            body: JSON.stringify({
              sessionId: "sess_missing_audit",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Admin governance reads require a valid authenticated session.",
    });
  });

  it("returns 502 when a governance audit session payload is malformed", async () => {
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.fail({
          _tag: "AdminGovernanceRequestContextMalformedError",
          sessionId: "sess_malformed_audit",
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByModule}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_malformed_audit",
            },
            body: JSON.stringify({
              sessionId: "sess_malformed_audit",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns route-level Allow headers for unsupported admin governance methods", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigOverrides}`,
          {
            method: "GET",
          },
        ),
      ),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    await expect(response.json()).resolves.toEqual({
      error: "Method not allowed.",
    });
  });

  it("returns 404 for unknown admin governance routes", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          "http://localhost/api/admin/governance/runtime-config/unknown",
          {
            method: "POST",
          },
        ),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Admin governance route not found.",
    });
  });

  it("returns 404 for unknown admin governance routes even when the method is unsupported", async () => {
    const handler = createTestHandler({});

    const response = await Effect.runPromise(
      handler(
        new Request(
          "http://localhost/api/admin/governance/runtime-config/unknown",
          {
            method: "GET",
          },
        ),
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("Allow")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      error: "Admin governance route not found.",
    });
  });

  it("returns 403 when governance reads resolve to a non-operator actor", async () => {
    const listRuntimeConfigOverrides = vi.fn((input) =>
      Effect.fail({
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: input.requestContext.actorType,
      } as const),
    );
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.succeed({
          actorType: actorType.organizationAdmin,
          actorId: "usr_org_admin",
          sessionId: "sess_org_admin",
          correlationId: "corr_org_admin",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
            organizationId: "org_demo",
          },
        }),
      listRuntimeConfigOverrides,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigOverrides}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_org_admin",
            },
            body: JSON.stringify({
              sessionId: "sess_org_admin",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    expect(listRuntimeConfigOverrides).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          actorType: actorType.organizationAdmin,
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      error:
        "Admin governance reads are restricted to platform and support operators.",
    });
  });

  it("returns 403 for non-operator proposal reads", async () => {
    const listRuntimeConfigProposals = vi.fn((input) =>
      Effect.fail({
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: input.requestContext.actorType,
      } as const),
    );
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.succeed({
          actorType: actorType.organizationAdmin,
          actorId: "usr_org_admin",
          sessionId: "sess_org_admin_proposals",
          correlationId: "corr_org_admin_proposals",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
            organizationId: "org_demo",
          },
        }),
      listRuntimeConfigProposals,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigProposals}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_org_admin_proposals",
            },
            body: JSON.stringify({
              sessionId: "sess_org_admin_proposals",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    expect(listRuntimeConfigProposals).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          actorType: actorType.organizationAdmin,
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      error:
        "Admin governance reads are restricted to platform and support operators.",
    });
  });

  it("returns 403 for non-operator audit-event reads", async () => {
    const queryAuditEventsByModule = vi.fn((input) =>
      Effect.fail({
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: input.requestContext.actorType,
      } as const),
    );
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.succeed({
          actorType: actorType.organizationAdmin,
          actorId: "usr_org_admin",
          sessionId: "sess_org_admin_audit",
          correlationId: "corr_org_admin_audit",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
            organizationId: "org_demo",
          },
        }),
      queryAuditEventsByModule,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByModule}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_org_admin_audit",
            },
            body: JSON.stringify({
              sessionId: "sess_org_admin_audit",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    expect(queryAuditEventsByModule).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          actorType: actorType.organizationAdmin,
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      error:
        "Admin governance reads are restricted to platform and support operators.",
    });
  });

  it("maps target-scoped audit-event read dependency failures to backend dependency errors", async () => {
    const target = `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`;
    const queryAuditEventsByTarget = vi.fn(() =>
      Effect.fail({
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "queryByTarget",
        cause: new Error("audit store unavailable"),
      } as const),
    );
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.succeed({
          actorType: actorType.supportOperator,
          actorId: "usr_support_operator",
          sessionId: "sess_support_operator_audit_target_failure",
          correlationId: "corr_support_operator_audit_target_failure",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        }),
      queryAuditEventsByTarget,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByTarget}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_support_operator_audit_target_failure",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator_audit_target_failure",
              moduleId: platformModuleId.tenantBranding,
              target,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    expect(queryAuditEventsByTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: platformModuleId.tenantBranding,
        target,
      }),
    );
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("returns 401 for target-scoped audit-event reads without a valid session", async () => {
    const queryAuditEventsByTarget = vi.fn();
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.fail({
          _tag: "AdminGovernanceRequestContextNotFoundError",
          sessionId: "sess_missing_audit_target",
        }),
      queryAuditEventsByTarget,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByTarget}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_missing_audit_target",
            },
            body: JSON.stringify({
              sessionId: "sess_missing_audit_target",
              moduleId: platformModuleId.runtimeConfig,
              target: `${platformModuleId.runtimeConfig}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    expect(queryAuditEventsByTarget).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Admin governance reads require a valid authenticated session.",
    });
  });

  it("returns 403 for non-operator target-scoped audit-event reads", async () => {
    const target = `${platformModuleId.tenantBranding}:${tenantBrandingConfigKey.companyName}:${platformScope.organization}:org_demo`;
    const queryAuditEventsByTarget = vi.fn((input) =>
      Effect.fail({
        _tag: "AdminGovernanceReadAccessDeniedError",
        actorType: input.requestContext.actorType,
      } as const),
    );
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.succeed({
          actorType: actorType.organizationAdmin,
          actorId: "usr_org_admin",
          sessionId: "sess_org_admin_audit_target",
          correlationId: "corr_org_admin_audit_target",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
            organizationId: "org_demo",
          },
        }),
      queryAuditEventsByTarget,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.queryAuditEventsByTarget}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_org_admin_audit_target",
            },
            body: JSON.stringify({
              sessionId: "sess_org_admin_audit_target",
              moduleId: platformModuleId.runtimeConfig,
              target,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    expect(queryAuditEventsByTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          actorType: actorType.organizationAdmin,
        }),
        target,
      }),
    );
    await expect(response.json()).resolves.toEqual({
      error:
        "Admin governance reads are restricted to platform and support operators.",
    });
  });

  it("returns 401 when a resolved governance session lacks an actor id", async () => {
    let capturedReadRequest:
      | Parameters<AdminGovernanceService["listRuntimeConfigOverrides"]>[0]
      | undefined;
    const listRuntimeConfigOverrides = vi.fn((input) => {
      capturedReadRequest = input;

      return Effect.fail({
        _tag: "AdminGovernanceReadUnauthenticatedActorError",
      } as const);
    });
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.succeed({
          actorType: actorType.supportOperator,
          sessionId: "sess_unresolved_operator",
          correlationId: "corr_unresolved_operator",
          tenant: {
            scope: platformScope.platform,
            scopeId: platformScope.platform,
          },
        }),
      listRuntimeConfigOverrides,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigOverrides}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_unresolved_operator",
            },
            body: JSON.stringify({
              sessionId: "sess_unresolved_operator",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    expect(capturedReadRequest).toBeDefined();

    if (capturedReadRequest === undefined) {
      throw new Error("Expected governance read call arguments.");
    }

    expect(capturedReadRequest).toMatchObject({
      requestContext: {
        actorType: actorType.supportOperator,
      },
    });
    expect("actorId" in capturedReadRequest.requestContext).toBe(false);
    await expect(response.json()).resolves.toEqual({
      error: "Admin governance reads require a valid authenticated session.",
    });
  });

  it("returns 502 when governance session lookup hits a Valkey dependency failure", async () => {
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.fail({
          _tag: "ValkeyAdapterOperationError",
          operation: "readSession",
          cause: new Error("valkey unavailable"),
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.listRuntimeConfigOverrides}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_support_operator",
            },
            body: JSON.stringify({
              sessionId: "sess_support_operator",
              moduleId: platformModuleId.runtimeConfig,
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "A backend dependency request failed.",
    });
  });

  it("submits runtime-config override proposals and returns the audit envelope", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.platformOperator,
        actorId: "usr_operator_1",
        sessionId: "sess_admin_governance",
        correlationId: "corr_admin_governance",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const submitRuntimeConfigOverrideProposal = vi.fn((input) =>
      Effect.succeed({
        proposal: {
          proposalId: `${input.moduleId}:${input.key}:${input.scope}:${input.scopeId}:override`,
          moduleId: input.moduleId,
          key: input.key,
          scope: input.scope,
          scopeId: input.scopeId,
          value: input.value,
          source: runtimeResolutionSource.runtimeOverride,
          changedBy: input.requestContext.actorId ?? "usr_operator_1",
          changedAt: "2026-04-17T10:00:00.000Z",
          approvalReason: input.approvalReason,
          status: runtimeConfigSyncArtifactStatus.pending,
        },
        auditEvent: {
          eventId: "runtime-config:override:1",
          timestamp: "2026-04-17T10:00:00.000Z",
          actorId: input.requestContext.actorId ?? "usr_operator_1",
          tenantScope: input.requestContext.tenant.scope,
          tenantScopeId: input.requestContext.tenant.scopeId,
          moduleId: input.moduleId,
          action: runtimeConfigAuditAction.overrideProposed,
          target: `${input.moduleId}:${input.key}:${input.scope}:${input.scopeId}:override`,
          reason: input.approvalReason,
          correlationId: input.requestContext.correlationId,
        },
      }),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      submitRuntimeConfigOverrideProposal,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.submitRuntimeConfigOverrideProposal}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_admin_governance",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance",
              moduleId: platformModuleId.tenantBranding,
              key: "tenant-branding.companyName",
              scope: platformScope.organization,
              scopeId: "org_1",
              value: "Acme Organization",
              approvalReason: "Operator-approved tenant override",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance",
    });
    expect(submitRuntimeConfigOverrideProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: expect.objectContaining({
          actorId: "usr_operator_1",
          correlationId: "corr_admin_governance",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          key: "tenant-branding.companyName",
          approvalReason: "Operator-approved tenant override",
          status: runtimeConfigSyncArtifactStatus.pending,
        }),
        auditEvent: expect.objectContaining({
          action: runtimeConfigAuditAction.overrideProposed,
        }),
      }),
    );
  });

  it("persists runtime-config proposals through the admin governance surface", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_proposals_mutation",
        correlationId: "corr_admin_governance_proposals_mutation",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const persistRuntimeConfigProposals = vi.fn(() =>
      Effect.succeed([
        {
          proposalId: "tenant-branding:companyName:rename",
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          action: runtimeChangeProposalAction.rename,
          artifactPath:
            "specs/00-governance/runtime-config-proposals/tenant-branding.tenant-branding-companyName.json",
          codeValue: tenantBrandingConfigKey.themePrimary,
          runtimeValue: "legacy",
          status: runtimeConfigSyncArtifactStatus.pending,
          generatedAt: "2026-04-17T10:00:00.000Z",
        },
      ]),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      persistRuntimeConfigProposals,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.persistRuntimeConfigProposals}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_proposals_mutation",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_proposals_mutation",
              moduleId: platformModuleId.tenantBranding,
              renameMap: {
                [tenantBrandingConfigKey.companyName]:
                  tenantBrandingConfigKey.themePrimary,
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_proposals_mutation",
    });
    expect(persistRuntimeConfigProposals).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: platformModuleId.tenantBranding,
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: runtimeChangeProposalAction.rename,
          status: runtimeConfigSyncArtifactStatus.pending,
        }),
      ]),
    );
  });

  it("reviews runtime-config proposals through the admin governance surface", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_proposal_review",
        correlationId: "corr_admin_governance_proposal_review",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const reviewRuntimeConfigProposal = vi.fn(() =>
      Effect.succeed({
        proposal: {
          proposalId: "tenant-branding:companyName:update",
          moduleId: platformModuleId.tenantBranding,
          key: tenantBrandingConfigKey.companyName,
          action: runtimeChangeProposalAction.update,
          artifactPath:
            "specs/00-governance/runtime-config-proposals/tenant-branding.companyName.json",
          runtimeValue: "Acme Organization",
          codeValue: "Default Company Name",
          status: runtimeConfigProposalDecisionStatus.approved,
          generatedAt: "2026-04-25T10:00:00.000Z",
          decidedBy: "usr_support_operator",
          decisionReason: "Approved export back to code",
          decidedAt: "2026-04-25T10:05:00.000Z",
        },
        auditEvent: {
          eventId: "runtime-config:proposal:1",
          timestamp: "2026-04-25T10:05:00.000Z",
          actorId: "usr_support_operator",
          tenantScope: platformScope.platform,
          tenantScopeId: platformScope.platform,
          moduleId: platformModuleId.tenantBranding,
          action: runtimeConfigAuditAction.proposalReviewed,
          target: "tenant-branding:companyName:update",
          reason: "Approved export back to code",
          correlationId: "corr_admin_governance_proposal_review",
        },
      }),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      reviewRuntimeConfigProposal,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.reviewRuntimeConfigProposal}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_proposal_review",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_proposal_review",
              proposalId: "tenant-branding:companyName:update",
              status: runtimeConfigProposalDecisionStatus.approved,
              decisionReason: "Approved export back to code",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_proposal_review",
    });
    expect(reviewRuntimeConfigProposal).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: "tenant-branding:companyName:update",
        status: runtimeConfigProposalDecisionStatus.approved,
        decisionReason: "Approved export back to code",
        requestContext: expect.objectContaining({
          actorId: "usr_support_operator",
        }),
      }),
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        proposal: expect.objectContaining({
          status: runtimeConfigProposalDecisionStatus.approved,
          decidedBy: "usr_support_operator",
        }),
        auditEvent: expect.objectContaining({
          action: runtimeConfigAuditAction.proposalReviewed,
        }),
      }),
    );
  });

  it("returns 409 when a runtime-config proposal review targets a non-pending proposal", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.supportOperator,
        actorId: "usr_support_operator",
        sessionId: "sess_admin_governance_proposal_review_conflict",
        correlationId: "corr_admin_governance_proposal_review_conflict",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      reviewRuntimeConfigProposal: () =>
        Effect.fail({
          _tag: "AdminGovernanceProposalReviewConflictError",
          proposalId: "tenant-branding:companyName:update",
          status: runtimeConfigSyncArtifactStatus.applied,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.reviewRuntimeConfigProposal}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_governance_proposal_review_conflict",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance_proposal_review_conflict",
              proposalId: "tenant-branding:companyName:update",
              status: runtimeConfigProposalDecisionStatus.rejected,
              decisionReason: "Attempted second review",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(409);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance_proposal_review_conflict",
    });
    await expect(response.json()).resolves.toEqual({
      error: "Runtime-config proposals can only be reviewed while pending.",
    });
  });

  it("returns 401 when runtime-config mutation lacks an authenticated actor", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.platformOperator,
        sessionId: "sess_admin_governance",
        correlationId: "corr_admin_governance",
        tenant: {
          scope: platformScope.platform,
          scopeId: platformScope.platform,
        },
      }),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      submitRuntimeConfigOverrideProposal: () =>
        Effect.fail({
          _tag: "AdminGovernanceUnauthenticatedActorError",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.submitRuntimeConfigOverrideProposal}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_admin_governance",
            },
            body: JSON.stringify({
              sessionId: "sess_admin_governance",
              moduleId: platformModuleId.tenantBranding,
              key: "tenant-branding.companyName",
              scope: platformScope.organization,
              scopeId: "org_1",
              value: "Acme Organization",
              approvalReason: "Operator-approved tenant override",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_admin_governance",
    });
    await expect(response.json()).resolves.toEqual({
      error:
        "Admin governance mutations require a valid authenticated session.",
    });
  });

  it("returns 401 when runtime-config mutation lacks a valid session", async () => {
    const handler = createTestHandler({
      resolveRequestContext: () =>
        Effect.fail({
          _tag: "AdminGovernanceRequestContextNotFoundError",
          sessionId: "sess_missing_mutation",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.submitRuntimeConfigOverrideProposal}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_missing_mutation",
            },
            body: JSON.stringify({
              sessionId: "sess_missing_mutation",
              moduleId: platformModuleId.tenantBranding,
              key: tenantBrandingConfigKey.companyName,
              scope: platformScope.organization,
              scopeId: "org_1",
              value: "Acme Organization",
              approvalReason: "Operator-approved tenant override",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error:
        "Admin governance mutations require a valid authenticated session.",
    });
  });

  it("returns 403 when runtime-config mutation resolves to a non-operator actor", async () => {
    const resolveRequestContext = vi.fn(() =>
      Effect.succeed({
        actorType: actorType.organizationAdmin,
        actorId: "usr_org_admin",
        sessionId: "sess_org_admin_mutation",
        correlationId: "corr_org_admin_mutation",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_demo",
          organizationId: "org_demo",
        },
      }),
    );
    const handler = createTestHandler({
      resolveRequestContext,
      submitRuntimeConfigOverrideProposal: () =>
        Effect.fail({
          _tag: "AdminGovernanceMutationAccessDeniedError",
          actorType: actorType.organizationAdmin,
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.submitRuntimeConfigOverrideProposal}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_org_admin_mutation",
            },
            body: JSON.stringify({
              sessionId: "sess_org_admin_mutation",
              moduleId: platformModuleId.tenantBranding,
              key: tenantBrandingConfigKey.companyName,
              scope: platformScope.organization,
              scopeId: "org_demo",
              value: "Acme Organization",
              approvalReason: "Operator-approved tenant override",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    expect(resolveRequestContext).toHaveBeenCalledWith({
      sessionId: "sess_org_admin_mutation",
    });
    await expect(response.json()).resolves.toEqual({
      error:
        "Admin governance mutations are restricted to platform and support operators.",
    });
  });
});
