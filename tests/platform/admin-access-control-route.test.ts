import { Effect, Schema } from "effect";
import {
  actorType,
  AdminGovernanceActionPolicyMetadataListSchema,
  adminGovernanceActionPolicyId,
  adminGovernanceActionPolicySeverity,
  adminQuerySortDirection,
  authorizationAuditAction,
  authorizationNamespace,
  authorizationRelation,
  platformModuleId,
  platformScope,
  projectionProfile,
} from "@comvestec/contracts";
import { subscriberJourneySessionCookieName } from "@comvestec/platform";
import { loadAdminAccessControlRouteDataFromRequest } from "../../apps/admin-app/src/lib/access-control-route-data";
import {
  createDeleteAdminAccessControlTuple,
  createProvisionAdminAccessControlOperator,
} from "../../apps/admin-app/src/lib/access-control-route-server";
import { createTanstackStartTestServerRuntime } from "../tanstack-start-test-runtime";

const projectionProfiles = [
  {
    moduleId: platformModuleId.supportOperations,
    profile: projectionProfile.supportSafe,
    visibleFields: ["case.summary", "case.status"],
    auditedFields: ["case.summary"],
  },
] as const;

const actionPolicies = Schema.validateSync(
  AdminGovernanceActionPolicyMetadataListSchema,
)([
  {
    actionId: adminGovernanceActionPolicyId.authorizationTupleWrite,
    label: "Grant authorization tuple",
    description: "Grant reviewed tenant access.",
    severity: adminGovernanceActionPolicySeverity.guarded,
    projectionProfile: projectionProfile.admin,
    requiresReason: true,
    requiresComment: false,
    stepUpRequired: false,
    reasonOptions: [
      {
        value: "reviewed-access-request",
        label: "Reviewed access request",
        description: "The request was reviewed before the grant.",
      },
    ],
  },
  {
    actionId: adminGovernanceActionPolicyId.authorizationTupleDelete,
    label: "Revoke authorization tuple",
    description: "Revoke reviewed tenant access.",
    severity: adminGovernanceActionPolicySeverity.highRisk,
    projectionProfile: projectionProfile.admin,
    requiresReason: true,
    requiresComment: false,
    stepUpRequired: false,
    reasonOptions: [
      {
        value: "reviewed-access-revocation",
        label: "Reviewed access revocation",
        description: "The access revocation was reviewed before removal.",
      },
    ],
  },
]);

const operatorDirectory = {
  currentOperator: {
    identity: {
      actorId: "usr_platform_operator",
      username: "operator@comvestec.com",
      email: "operator@comvestec.com",
      displayName: "Comvestec Platform Operator",
      actorType: actorType.platformOperator,
      enabled: true,
    },
    sessionId: "sess_admin_access_control",
    capabilities: [],
  },
  operators: [
    {
      actorId: "usr_platform_operator",
      username: "operator@comvestec.com",
      email: "operator@comvestec.com",
      displayName: "Comvestec Platform Operator",
      actorType: actorType.platformOperator,
      enabled: true,
    },
    {
      actorId: "usr_support_operator",
      username: "support@comvestec.com",
      email: "support@comvestec.com",
      displayName: "Comvestec Support Operator",
      actorType: actorType.supportOperator,
      enabled: true,
    },
  ],
} as const;

describe("admin access-control route data", () => {
  it("falls back to shell state when the trusted operator session is missing", async () => {
    const listProjectionProfiles = vi.fn(() => {
      throw new Error(
        "Projection-profile helper should not run without a session.",
      );
    });

    await expect(
      Effect.runPromise(
        loadAdminAccessControlRouteDataFromRequest(
          new Request("http://localhost:3001/"),
          {},
          {},
          listProjectionProfiles,
        ),
      ),
    ).resolves.toEqual({ kind: "shell" });

    expect(listProjectionProfiles).not.toHaveBeenCalled();
  });

  it("loads projection profiles, relevant action policies, and exact-scope tuples", async () => {
    let capturedTupleQuery:
      | Parameters<
          NonNullable<
            Parameters<typeof loadAdminAccessControlRouteDataFromRequest>[4]
          >
        >[1]
      | undefined;
    const tupleResult = {
      items: [
        {
          namespace: authorizationNamespace.tenant,
          object: "org_demo",
          relation: authorizationRelation.viewer,
          subject: "usr_member_1",
        },
      ],
      pageInfo: {
        page: {
          page: 1,
          pageSize: 10,
        },
        totalItems: 1,
        totalPages: 1,
        exportMode: false,
      },
      detail: {
        namespace: authorizationNamespace.tenant,
        object: "org_demo",
        relation: authorizationRelation.viewer,
        subject: "usr_member_1",
      },
    } as const;

    await expect(
      Effect.runPromise(
        loadAdminAccessControlRouteDataFromRequest(
          new Request("http://localhost:3001/", {
            headers: {
              cookie: `${subscriberJourneySessionCookieName}=sess_admin_access_control`,
            },
          }),
          {},
          {
            namespace: authorizationNamespace.tenant,
            object: "org_demo",
            relation: authorizationRelation.viewer,
            detailSubject: "usr_member_1",
            page: 1,
          },
          () => Effect.succeed(projectionProfiles),
          (_environment, input) => {
            capturedTupleQuery = input;

            return Effect.succeed(tupleResult);
          },
          () => Effect.succeed(actionPolicies),
          () => Effect.succeed(operatorDirectory),
        ),
      ),
    ).resolves.toEqual({
      kind: "ready",
      profiles: projectionProfiles,
      actionPolicies,
      operatorDirectory,
      tupleQuery: tupleResult,
    });

    expect(capturedTupleQuery).toEqual({
      sessionId: "sess_admin_access_control",
      query: {
        namespace: authorizationNamespace.tenant,
        object: "org_demo",
        relation: authorizationRelation.viewer,
        page: {
          page: 1,
          pageSize: 10,
        },
        sortField: "subject",
        sortDirection: adminQuerySortDirection.asc,
        exportMode: false,
        detailLookup: {
          namespace: authorizationNamespace.tenant,
          object: "org_demo",
          relation: authorizationRelation.viewer,
          subject: "usr_member_1",
        },
      },
    });
  });
});

describe("admin access-control route server boundary", () => {
  it("extracts the trusted session and forwards tuple revocation input through the app-safe helper", async () => {
    const environment = { ADMIN_APP_ENV: "test" };
    const serverRuntime = createTanstackStartTestServerRuntime(
      "http://localhost:3001/",
    );
    let capturedEnvironment: unknown;
    let capturedInput:
      | {
          readonly sessionId: string;
          readonly tuple: {
            readonly namespace: string;
            readonly object: string;
            readonly relation: string;
            readonly subject: string;
          };
          readonly reason: string;
        }
      | undefined;

    const deleteAdminAccessControlTuple = createDeleteAdminAccessControlTuple(
      (currentEnvironment, input) => {
        capturedEnvironment = currentEnvironment;
        capturedInput = input;

        return Effect.succeed({
          mutation: "deleted" as const,
          tuple: input.tuple,
          auditEvent: {
            eventId: "audit_evt_tuple_delete",
            timestamp: "2026-05-14T14:00:00.000Z",
            actorId: "usr_support_operator",
            tenantScope: platformScope.platform,
            tenantScopeId: platformScope.platform,
            moduleId: platformModuleId.authorization,
            action: authorizationAuditAction.tupleChanged,
            target: "authorization:tenant:org_demo:viewer:usr_member_2",
            reason: input.reason,
            correlationId: "corr_admin_access_delete",
          },
        });
      },
      environment,
      serverRuntime,
    );

    await expect(
      deleteAdminAccessControlTuple.__executeServer({
        method: "POST",
        data: {
          tuple: {
            namespace: authorizationNamespace.tenant,
            object: "org_demo",
            relation: authorizationRelation.viewer,
            subject: "usr_member_2",
          },
          reason: "Reviewed access revocation",
        },
        headers: {
          cookie: `${subscriberJourneySessionCookieName}=sess_admin_access_delete`,
        },
      }),
    ).resolves.toMatchObject({
      mutation: "deleted",
      tuple: {
        subject: "usr_member_2",
      },
    });

    expect(capturedEnvironment).toBe(environment);
    expect(capturedInput).toEqual({
      sessionId: "sess_admin_access_delete",
      tuple: {
        namespace: authorizationNamespace.tenant,
        object: "org_demo",
        relation: authorizationRelation.viewer,
        subject: "usr_member_2",
      },
      reason: "Reviewed access revocation",
    });
  });

  it("extracts the trusted session and forwards operator provisioning input through the app-safe helper", async () => {
    const environment = { ADMIN_APP_ENV: "test" };
    const serverRuntime = createTanstackStartTestServerRuntime(
      "http://localhost:3001/",
    );
    let capturedEnvironment: unknown;
    let capturedInput:
      | {
          readonly sessionId: string;
          readonly displayName: string;
          readonly email: string;
          readonly username?: string;
          readonly actorType:
            | typeof actorType.platformOperator
            | typeof actorType.supportOperator;
          readonly reason: string;
        }
      | undefined;

    const provisionAdminAccessControlOperator =
      createProvisionAdminAccessControlOperator(
        (currentEnvironment, input) => {
          capturedEnvironment = currentEnvironment;
          capturedInput = input;

          return Effect.succeed({
            operator: {
              actorId: "usr_audit_operator",
              username: input.username ?? input.email,
              email: input.email,
              displayName: input.displayName,
              actorType: input.actorType,
              enabled: true,
            },
            updatedExisting: false as const,
            credentialHandoff: {
              signInUrl: "https://admin.example.com/auth/sign-in",
              temporaryPassword: "Adm_temp_fixture!aA1",
            },
          });
        },
        environment,
        serverRuntime,
      );

    await expect(
      provisionAdminAccessControlOperator.__executeServer({
        method: "POST",
        data: {
          displayName: "Comvestec Audit Operator",
          email: "audit.operator@comvestec.com",
          username: "audit.operator",
          actorType: actorType.supportOperator,
          reason: "Add audit oversight coverage.",
        },
        headers: {
          cookie: `${subscriberJourneySessionCookieName}=sess_admin_operator_provision`,
        },
      }),
    ).resolves.toMatchObject({
      updatedExisting: false,
      operator: {
        displayName: "Comvestec Audit Operator",
        email: "audit.operator@comvestec.com",
        actorType: actorType.supportOperator,
      },
      credentialHandoff: {
        signInUrl: "https://admin.example.com/auth/sign-in",
      },
    });

    expect(capturedEnvironment).toBe(environment);
    expect(capturedInput).toEqual({
      sessionId: "sess_admin_operator_provision",
      displayName: "Comvestec Audit Operator",
      email: "audit.operator@comvestec.com",
      username: "audit.operator",
      actorType: actorType.supportOperator,
      reason: "Add audit oversight coverage.",
    });
  });
});
