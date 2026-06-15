import { Effect } from "effect";
import {
  deleteAdminAuthorizationTupleFromSessionId,
  getAdminOperatorDirectorySnapshotFromSessionId,
  getAdminOperatorProfileFromSessionId,
  listAdminRuntimeConfigOverridesFromSessionId,
  listAdminAuthorizationTuplesFromSessionId,
  listRetentionPoliciesFromSessionId,
  provisionAdminOperatorFromSessionId,
  listSupportCasesFromSessionId,
  listWebhookSubscriptionsFromSessionId,
} from "@comvestec/platform";
import {
  actorType,
  adminOrgRole,
  adminQuerySortDirection,
  authorizationAuditAction,
  authorizationNamespace,
  authorizationRelation,
  platformModuleId,
  platformScope,
} from "@comvestec/contracts";

describe("admin app action helpers", () => {
  it("delegates governance route reads through the app-safe helper seam", async () => {
    const request: Parameters<
      typeof listAdminRuntimeConfigOverridesFromSessionId
    >[1] = {
      sessionId: "sess_admin_governance",
      moduleId: platformModuleId.runtimeConfig,
    };
    const expected = [] as const;
    const listRuntimeConfigOverrides: NonNullable<
      Parameters<typeof listAdminRuntimeConfigOverridesFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        listAdminRuntimeConfigOverridesFromSessionId(
          {},
          request,
          listRuntimeConfigOverrides,
        ),
      ),
    ).resolves.toBe(expected);

    expect(listRuntimeConfigOverrides).toHaveBeenCalledWith(request);
  });

  it("delegates support route reads through the app-safe helper seam", async () => {
    const request: Parameters<typeof listSupportCasesFromSessionId>[1] = {
      sessionId: "sess_admin_support",
    };
    const expected = [] as const;
    const listSupportCases: NonNullable<
      Parameters<typeof listSupportCasesFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        listSupportCasesFromSessionId({}, request, listSupportCases),
      ),
    ).resolves.toBe(expected);

    expect(listSupportCases).toHaveBeenCalledWith(request);
  });

  it("delegates retention route reads through the app-safe helper seam", async () => {
    const request: Parameters<typeof listRetentionPoliciesFromSessionId>[1] = {
      sessionId: "sess_admin_retention",
      scope: platformScope.organization,
      scopeId: "org_demo",
    };
    const expected = [] as const;
    const listRetentionPolicies: NonNullable<
      Parameters<typeof listRetentionPoliciesFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        listRetentionPoliciesFromSessionId({}, request, listRetentionPolicies),
      ),
    ).resolves.toBe(expected);

    expect(listRetentionPolicies).toHaveBeenCalledWith(request);
  });

  it("delegates webhooks route reads through the app-safe helper seam", async () => {
    const request: Parameters<typeof listWebhookSubscriptionsFromSessionId>[1] =
      {
        sessionId: "sess_admin_webhooks",
        scope: platformScope.organization,
        scopeId: "org_demo",
      };
    const expected = [] as const;
    const listWebhookSubscriptions: NonNullable<
      Parameters<typeof listWebhookSubscriptionsFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        listWebhookSubscriptionsFromSessionId(
          {},
          request,
          listWebhookSubscriptions,
        ),
      ),
    ).resolves.toBe(expected);

    expect(listWebhookSubscriptions).toHaveBeenCalledWith(request);
  });

  it("delegates access-control tuple queries through the app-safe helper seam", async () => {
    const request: Parameters<
      typeof listAdminAuthorizationTuplesFromSessionId
    >[1] = {
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
      },
    };
    const expected = {
      items: [],
      pageInfo: {
        page: {
          page: 1,
          pageSize: 10,
        },
        totalItems: 0,
        totalPages: 0,
        exportMode: false,
      },
    } as const;
    const listAdminAuthorizationTuples: NonNullable<
      Parameters<typeof listAdminAuthorizationTuplesFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        listAdminAuthorizationTuplesFromSessionId(
          {},
          request,
          listAdminAuthorizationTuples,
        ),
      ),
    ).resolves.toBe(expected);

    expect(listAdminAuthorizationTuples).toHaveBeenCalledWith(request);
  });

  it("delegates access-control tuple deletion through the app-safe helper seam", async () => {
    const request: Parameters<
      typeof deleteAdminAuthorizationTupleFromSessionId
    >[1] = {
      sessionId: "sess_admin_access_delete",
      tuple: {
        namespace: authorizationNamespace.tenant,
        object: "org_demo",
        relation: authorizationRelation.viewer,
        subject: "usr_member_2",
      },
      reason: "Revoke reviewed tenant viewer access.",
    };
    const expected = {
      mutation: "deleted",
      tuple: request.tuple,
      auditEvent: {
        eventId: "audit_evt_tuple_delete",
        timestamp: "2026-05-14T14:00:00.000Z",
        actorId: "usr_support_operator",
        tenantScope: platformScope.platform,
        tenantScopeId: platformScope.platform,
        moduleId: platformModuleId.authorization,
        action: authorizationAuditAction.tupleChanged,
        target: "authorization:tenant:org_demo:viewer:usr_member_2",
        reason: request.reason,
      },
    } as const;
    const deleteAdminAuthorizationTuple: NonNullable<
      Parameters<typeof deleteAdminAuthorizationTupleFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        deleteAdminAuthorizationTupleFromSessionId(
          {},
          request,
          deleteAdminAuthorizationTuple,
        ),
      ),
    ).resolves.toBe(expected);

    expect(deleteAdminAuthorizationTuple).toHaveBeenCalledWith(request);
  });

  it("delegates operator profile reads through the app-safe helper seam", async () => {
    const request: Parameters<typeof getAdminOperatorProfileFromSessionId>[1] =
      {
        sessionId: "sess_admin_operator_profile",
      };
    const expected = {
      identity: {
        actorId: "usr_platform_operator",
        username: "operator@comvestec.com",
        email: "operator@comvestec.com",
        displayName: "Comvestec Platform Operator",
        actorType: actorType.platformOperator,
        enabled: true,
      },
      sessionId: request.sessionId,
      adminOrgRole: adminOrgRole.owner,
      capabilities: [],
    } as const;
    const getAdminOperatorProfile: NonNullable<
      Parameters<typeof getAdminOperatorProfileFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        getAdminOperatorProfileFromSessionId(
          {},
          request,
          getAdminOperatorProfile,
        ),
      ),
    ).resolves.toBe(expected);

    expect(getAdminOperatorProfile).toHaveBeenCalledWith(request);
  });

  it("delegates operator directory reads through the app-safe helper seam", async () => {
    const request: Parameters<
      typeof getAdminOperatorDirectorySnapshotFromSessionId
    >[1] = {
      sessionId: "sess_admin_operator_directory",
    };
    const expected = {
      currentOperator: {
        identity: {
          actorId: "usr_platform_operator",
          username: "operator@comvestec.com",
          email: "operator@comvestec.com",
          displayName: "Comvestec Platform Operator",
          actorType: actorType.platformOperator,
          enabled: true,
        },
        sessionId: request.sessionId,
        adminOrgRole: adminOrgRole.owner,
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
      ],
    } as const;
    const getAdminOperatorDirectorySnapshot: NonNullable<
      Parameters<typeof getAdminOperatorDirectorySnapshotFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        getAdminOperatorDirectorySnapshotFromSessionId(
          {},
          request,
          getAdminOperatorDirectorySnapshot,
        ),
      ),
    ).resolves.toBe(expected);

    expect(getAdminOperatorDirectorySnapshot).toHaveBeenCalledWith(request);
  });

  it("delegates operator provisioning through the app-safe helper seam", async () => {
    const request: Parameters<typeof provisionAdminOperatorFromSessionId>[1] = {
      sessionId: "sess_admin_operator_provision",
      displayName: "Comvestec Audit Operator",
      email: "audit.operator@comvestec.com",
      username: "audit.operator",
      actorType: actorType.supportOperator,
      reason: "Add audit oversight coverage.",
    };
    const expected = {
      operator: {
        actorId: "usr_audit_operator",
        username: request.username ?? request.email,
        email: request.email,
        displayName: request.displayName,
        actorType: request.actorType,
        enabled: true,
      },
      updatedExisting: false,
      credentialHandoff: {
        signInUrl: "https://admin.example.com/auth/sign-in",
        temporaryPassword: "Adm_temp_fixture!aA1",
      },
    } as const;
    const provisionAdminOperator: NonNullable<
      Parameters<typeof provisionAdminOperatorFromSessionId>[2]
    > = vi.fn(() => Effect.succeed(expected));

    await expect(
      Effect.runPromise(
        provisionAdminOperatorFromSessionId(
          {},
          request,
          provisionAdminOperator,
        ),
      ),
    ).resolves.toBe(expected);

    expect(provisionAdminOperator).toHaveBeenCalledWith(request);
  });
});
