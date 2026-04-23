import { Effect } from "effect";
import { tenantBrandingConfigKey } from "@comvestec/config";
import {
  actorType,
  platformModuleId,
  platformScope,
  runtimeConfigAuditAction,
  runtimeChangeProposalAction,
  runtimeResolutionSource,
} from "@comvestec/contracts";
import { runtimeConfigSyncArtifactStatus } from "@comvestec/modules";
import {
  adminGovernanceApiPath,
  createAdminGovernanceHttpHandler,
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
  upsertRuntimeConfigOverride:
    overrides.upsertRuntimeConfigOverride ??
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
});

const createTestHandler = (service: Partial<AdminGovernanceService>) =>
  createAdminGovernanceHttpHandler((use) =>
    use(createAdminGovernanceServiceDouble(service)),
  );

describe("platform admin governance http", () => {
  it("routes governance read requests through trusted session context", async () => {
    const resolveRequestContext = jest.fn(() =>
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
    const listRuntimeConfigOverrides = jest.fn((input) =>
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
    const resolveRequestContext = jest.fn(() =>
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
    const listRuntimeConfigOverrides = jest.fn((input) =>
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
    const resolveRequestContext = jest.fn(() =>
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
    const listRuntimeConfigProposals = jest.fn((input) =>
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
    const resolveRequestContext = jest.fn(() =>
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
    const listRuntimeConfigProposals = jest.fn((input) =>
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
    const resolveRequestContext = jest.fn(() =>
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
    const queryAuditEventsByModule = jest.fn((input) =>
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
    const resolveRequestContext = jest.fn(() =>
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
    const queryAuditEventsByModule = jest.fn((input) =>
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

  it("returns 403 when governance reads resolve to a non-operator actor", async () => {
    const listRuntimeConfigOverrides = jest.fn((input) =>
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
    const listRuntimeConfigProposals = jest.fn((input) =>
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
    const queryAuditEventsByModule = jest.fn((input) =>
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

  it("returns 401 when a resolved governance session lacks an actor id", async () => {
    let capturedReadRequest:
      | Parameters<AdminGovernanceService["listRuntimeConfigOverrides"]>[0]
      | undefined;
    const listRuntimeConfigOverrides = jest.fn((input) => {
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
      error: "Admin governance reads require an authenticated operator.",
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

  it("upserts runtime-config overrides and returns the audit envelope", async () => {
    const handler = createTestHandler({
      upsertRuntimeConfigOverride: (input) =>
        Effect.succeed({
          override: {
            moduleId: input.moduleId,
            key: input.key,
            scope: input.scope,
            scopeId: input.scopeId,
            value: input.value,
            source: runtimeResolutionSource.runtimeOverride,
            changedBy: input.requestContext.actorId ?? "usr_operator_1",
            changedAt: "2026-04-17T10:00:00.000Z",
            approvalReason: input.approvalReason,
          },
          auditEvent: {
            eventId: "runtime-config:override:1",
            timestamp: "2026-04-17T10:00:00.000Z",
            actorId: input.requestContext.actorId ?? "usr_operator_1",
            tenantScope: input.requestContext.tenant.scope,
            tenantScopeId: input.requestContext.tenant.scopeId,
            moduleId: input.moduleId,
            action: runtimeConfigAuditAction.overrideChanged,
            target: `${input.moduleId}:${input.key}:${input.scope}:${input.scopeId}`,
            reason: input.approvalReason,
            correlationId: input.requestContext.correlationId,
          },
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.upsertRuntimeConfigOverride}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestContext: {
                actorType: actorType.platformOperator,
                actorId: "usr_operator_1",
                sessionId: "sess_admin_governance",
                correlationId: "corr_admin_governance",
                tenant: {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              },
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
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        override: expect.objectContaining({
          key: "tenant-branding.companyName",
          approvalReason: "Operator-approved tenant override",
        }),
        auditEvent: expect.objectContaining({
          action: runtimeConfigAuditAction.overrideChanged,
        }),
      }),
    );
  });

  it("persists runtime-config proposals through the admin governance surface", async () => {
    const handler = createTestHandler({
      persistRuntimeConfigProposals: () =>
        Effect.succeed([
          {
            proposalId: "tenant-branding:legacyTheme:rename",
            moduleId: platformModuleId.tenantBranding,
            key: "tenant-branding.legacyTheme",
            action: runtimeChangeProposalAction.rename,
            artifactPath:
              "specs/00-governance/runtime-config-proposals/tenant-branding.tenant-branding-legacyTheme.json",
            codeValue: "tenant-branding.themePrimary",
            runtimeValue: "legacy",
            status: runtimeConfigSyncArtifactStatus.pending,
            generatedAt: "2026-04-17T10:00:00.000Z",
          },
        ]),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.persistRuntimeConfigProposals}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              moduleId: platformModuleId.tenantBranding,
              renameMap: {
                "tenant-branding.legacyTheme": "tenant-branding.themePrimary",
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: runtimeChangeProposalAction.rename,
          status: runtimeConfigSyncArtifactStatus.pending,
        }),
      ]),
    );
  });

  it("returns 401 when runtime-config mutation lacks an authenticated actor", async () => {
    const handler = createTestHandler({
      upsertRuntimeConfigOverride: () =>
        Effect.fail({
          _tag: "AdminGovernanceUnauthenticatedActorError",
        }),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminGovernanceApiPath.upsertRuntimeConfigOverride}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestContext: {
                actorType: actorType.platformOperator,
                sessionId: "sess_admin_governance",
                correlationId: "corr_admin_governance",
                tenant: {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              },
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
    await expect(response.json()).resolves.toEqual({
      error: "Runtime-config mutations require an authenticated actor.",
    });
  });
});
