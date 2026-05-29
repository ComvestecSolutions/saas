import { configDefaultValue } from "@comvestec/config";
import { Effect, Layer } from "effect";
import { describe, expect, it, vi } from "vitest";
import {
  adminTenantDirectoryStatus,
  actorType,
  platformAdapterServiceName,
  platformScope,
  tenantOnboardingRunStatus,
} from "@comvestec/contracts";
import {
  AuditLogModule,
  IdentitySessionModule,
  tenantInvitationPersistedStatus,
  TenantOnboardingPostgresRepository,
  tenantProvisioningStatus,
} from "@comvestec/modules";
import {
  makeAdminTenantManagementService,
  OryKetoAdapter,
} from "@comvestec/platform";

const buildAuditLogLayer = () =>
  Layer.succeed(AuditLogModule, {
    append: vi.fn(() => Effect.die("unexpected")),
    queryByModule: vi.fn(() => Effect.die("unexpected")),
    queryByTarget: vi.fn(() => Effect.die("unexpected")),
    queryByActor: vi.fn(() => Effect.die("unexpected")),
    queryByTenant: vi.fn(() => Effect.die("unexpected")),
    requirements: Effect.die("unexpected"),
  });

const buildOnboardingRepositoryLayer = () =>
  Layer.succeed(TenantOnboardingPostgresRepository, {
    persistOnboardingRun: vi.fn(() => Effect.die("unexpected")),
    getOnboardingRunByTenant: vi.fn(() => Effect.die("unexpected")),
  });

const buildOryKetoLayer = () =>
  Layer.succeed(OryKetoAdapter, {
    serviceName: platformAdapterServiceName.oryKeto,
    readUrl: "http://127.0.0.1:4466",
    writeUrl: "http://127.0.0.1:4467",
    healthcheck: Effect.die("unexpected"),
    writeTuple: vi.fn(() => Effect.die("unexpected")),
    deleteTuple: vi.fn(() => Effect.die("unexpected")),
    listTuples: vi.fn(() => Effect.die("unexpected")),
    check: vi.fn(() => Effect.die("unexpected")),
  });

describe("platform admin tenant directory service", () => {
  it("projects truthful directory rows from persisted tenant-management sources", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_directory",
      correlationId: "corr_admin_tenant_directory",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;

    const identitySessionLayer = Layer.succeed(IdentitySessionModule, {
      startAuthentication: vi.fn(() => Effect.die("unexpected")),
      completeAuthentication: vi.fn(() => Effect.die("unexpected")),
      completePlatformOperatorAuthentication: vi.fn(() =>
        Effect.die("unexpected"),
      ),
      invalidateSession: vi.fn(() => Effect.die("unexpected")),
      resolveRequestContext: vi.fn(() => Effect.succeed(requestContext)),
    });

    const program = makeAdminTenantManagementService({
      loadTenantDirectorySources: () =>
        Effect.succeed({
          provisioningRows: [
            {
              tenantScope: platformScope.organization,
              tenantScopeId: "org_demo",
              status: tenantProvisioningStatus.provisioned,
              updatedAt: new Date("2026-05-11T08:00:00.000Z"),
            },
            {
              tenantScope: platformScope.individual,
              tenantScopeId: "ind_blocked",
              status: tenantProvisioningStatus.failed,
              updatedAt: new Date("2026-05-11T09:00:00.000Z"),
            },
          ],
          onboardingRows: [
            {
              tenantScope: platformScope.organization,
              tenantScopeId: "org_pending",
              status: tenantOnboardingRunStatus.inProgress,
              startedAt: new Date("2026-05-11T10:00:00.000Z"),
            },
          ],
          invitationRows: [
            {
              tenantScope: platformScope.organization,
              tenantScopeId: "org_pending",
              status: tenantInvitationPersistedStatus.pending,
              issuedAt: new Date("2026-05-11T11:00:00.000Z"),
            },
          ],
          brandingRows: [
            {
              scope: platformScope.organization,
              scopeId: "org_demo",
              value: "Acme Co.",
              changedAt: new Date("2026-05-11T12:00:00.000Z"),
            },
            {
              scope: platformScope.organization,
              scopeId: "org_pending",
              value: configDefaultValue.inherit,
              changedAt: new Date("2026-05-11T12:30:00.000Z"),
            },
          ],
          proposalRows: [
            {
              scope: platformScope.organization,
              scopeId: "org_pending",
              status: "pending",
              changedAt: new Date("2026-05-11T13:00:00.000Z"),
            },
            {
              scope: platformScope.organization,
              scopeId: "org_pending",
              status: "approved",
              changedAt: new Date("2026-05-11T13:30:00.000Z"),
            },
            {
              scope: platformScope.individual,
              scopeId: "ind_blocked",
              status: "pending",
              changedAt: new Date("2026-05-11T14:00:00.000Z"),
            },
          ],
          subscriptionRows: [
            {
              scope: platformScope.organization,
              scopeId: "org_demo",
              status: "active",
              updatedAt: new Date("2026-05-11T15:00:00.000Z"),
            },
          ],
        }),
    }).pipe(
      Effect.flatMap((service) =>
        service.listTenantDirectory({
          sessionId: requestContext.sessionId,
        }),
      ),
      Effect.provide(buildOryKetoLayer()),
      Effect.provide(buildOnboardingRepositoryLayer()),
      Effect.provide(buildAuditLogLayer()),
      Effect.provide(identitySessionLayer),
    );

    const result = await Effect.runPromise(program);

    expect(result.rows).toEqual([
      {
        key: "organization:org_demo",
        displayName: "Acme Co.",
        target: {
          scope: platformScope.organization,
          scopeId: "org_demo",
        },
        status: adminTenantDirectoryStatus.active,
        approvalsOpen: 0,
      },
      {
        key: "individual:ind_blocked",
        displayName: "Ind Blocked",
        target: {
          scope: platformScope.individual,
          scopeId: "ind_blocked",
        },
        status: adminTenantDirectoryStatus.blocked,
        approvalsOpen: 1,
      },
      {
        key: "organization:org_pending",
        displayName: "Org Pending",
        target: {
          scope: platformScope.organization,
          scopeId: "org_pending",
        },
        status: adminTenantDirectoryStatus.pending,
        approvalsOpen: 1,
      },
    ]);
  });

  it("denies directory access for non-platform tenant sessions", async () => {
    const identitySessionLayer = Layer.succeed(IdentitySessionModule, {
      startAuthentication: vi.fn(() => Effect.die("unexpected")),
      completeAuthentication: vi.fn(() => Effect.die("unexpected")),
      completePlatformOperatorAuthentication: vi.fn(() =>
        Effect.die("unexpected"),
      ),
      invalidateSession: vi.fn(() => Effect.die("unexpected")),
      resolveRequestContext: vi.fn(() =>
        Effect.succeed({
          actorType: actorType.platformOperator,
          actorId: "usr_platform_operator",
          sessionId: "sess_wrong_scope",
          correlationId: "corr_wrong_scope",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_demo",
          },
        }),
      ),
    });

    const program = makeAdminTenantManagementService({
      loadTenantDirectorySources: () =>
        Effect.die("directory sources should not load for denied sessions"),
    }).pipe(
      Effect.flatMap((service) =>
        Effect.flip(
          service.listTenantDirectory({
            sessionId: "sess_wrong_scope",
          }),
        ),
      ),
      Effect.provide(buildOryKetoLayer()),
      Effect.provide(buildOnboardingRepositoryLayer()),
      Effect.provide(buildAuditLogLayer()),
      Effect.provide(identitySessionLayer),
    );

    const error = await Effect.runPromise(program);

    expect(error).toEqual({
      _tag: "AdminTenantManagementAccessDeniedError",
      reason:
        "Admin tenant management operations require a platform-operator session scoped to the platform tenant.",
      auditRequired: false,
    });
  });
});
