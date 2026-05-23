import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  actorType,
  adminMemberRole,
  novuWorkflowId,
  platformScope,
  type AdminMember,
  type AdminMemberInvitation,
  type RequestContext,
  type ResolvedAdminCapabilities,
} from "@comvestec/contracts";
import { adminMemberStatus } from "@comvestec/modules";
import {
  AdminInvitationAlreadyRedeemed,
  AdminInvitationExpired,
  AdminInvitationNotFound,
  AdminInvitationNotificationDispatchError,
  AdminMemberAlreadyExists,
  AdminMemberNotFound,
  AdminOwnerCountInvariant,
  AdminRoleChangeNotPermitted,
  adminOrganizationApiBasePath,
  adminOrganizationApiPath,
  createAdminOrganizationHttpHandlerWithDependencies,
  type AdminOrganizationServiceImpl,
} from "@comvestec/platform";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const trustedRequestContext: RequestContext = {
  actorType: actorType.platformOperator,
  actorId: "usr_admin_org_http_test_operator",
  sessionId: "sess_admin_org_http_test",
  correlationId: "corr_admin_org_http_test",
  reason: "admin-org http unit test",
  tenant: {
    scope: platformScope.platform,
    scopeId: platformScope.platform,
  },
};

const fakeMember = (overrides: Partial<AdminMember> = {}): AdminMember => ({
  id: overrides.id ?? "mem_http_fake",
  email: overrides.email ?? "http@example.com",
  displayName: overrides.displayName ?? "HTTP Tester",
  role: overrides.role ?? adminMemberRole.adminAdmin,
  status: overrides.status ?? adminMemberStatus.active,
  invitedAt: overrides.invitedAt ?? "2024-01-01T00:00:00.000Z",
  createdBy: overrides.createdBy ?? "usr_http_inviter",
  updatedAt: overrides.updatedAt ?? "2024-01-02T00:00:00.000Z",
  ...(overrides.keycloakSubjectId === undefined
    ? {}
    : { keycloakSubjectId: overrides.keycloakSubjectId }),
  ...(overrides.acceptedAt === undefined
    ? {}
    : { acceptedAt: overrides.acceptedAt }),
});

const fakeInvitation = (
  overrides: Partial<AdminMemberInvitation> = {},
): AdminMemberInvitation => ({
  invitationId: overrides.invitationId ?? "inv_http_fake",
  email: overrides.email ?? "invitee@example.com",
  invitedRole: overrides.invitedRole ?? adminMemberRole.viewer,
  invitedBy: overrides.invitedBy ?? "usr_http_inviter",
  tokenHash: overrides.tokenHash ?? "hash_http_fake",
  status: overrides.status ?? "pending",
  issuedAt: overrides.issuedAt ?? "2024-01-01T00:00:00.000Z",
  expiresAt: overrides.expiresAt ?? "2024-01-08T00:00:00.000Z",
});

const fakeCapabilities = (): ResolvedAdminCapabilities => ({
  role: adminMemberRole.adminAdmin,
  canManageMembers: true,
  canInviteMembers: true,
  canChangeMemberRole: true,
  canRemoveMember: false,
  canReadAudit: true,
  canManageRuntimeConfig: true,
  canManageBilling: true,
  canReadBilling: true,
  canManageRetention: true,
  canImpersonate: false,
  canRevealSecrets: false,
  canMutate: true,
});

const unexpectedServiceCall = <A>(method: string): Effect.Effect<A> =>
  Effect.die(new Error(`unexpected admin-org HTTP service call: ${method}`));

const createServiceDouble = (
  overrides: Partial<AdminOrganizationServiceImpl> = {},
): AdminOrganizationServiceImpl => ({
  seedInitialOwner:
    overrides.seedInitialOwner ??
    (() => unexpectedServiceCall("seedInitialOwner")),
  listMembers:
    overrides.listMembers ?? (() => unexpectedServiceCall("listMembers")),
  inviteMember:
    overrides.inviteMember ?? (() => unexpectedServiceCall("inviteMember")),
  redeemInvitation:
    overrides.redeemInvitation ??
    (() => unexpectedServiceCall("redeemInvitation")),
  changeMemberRole:
    overrides.changeMemberRole ??
    (() => unexpectedServiceCall("changeMemberRole")),
  removeMember:
    overrides.removeMember ?? (() => unexpectedServiceCall("removeMember")),
  resolveCapabilitiesFor:
    overrides.resolveCapabilitiesFor ??
    (() => unexpectedServiceCall("resolveCapabilitiesFor")),
});

const createTestHandler = (
  service: Partial<AdminOrganizationServiceImpl>,
  resolverOverride?: (
    request: Request,
  ) => Effect.Effect<RequestContext, unknown>,
) =>
  createAdminOrganizationHttpHandlerWithDependencies({
    resolveRequestContext:
      // The seam's resolver signature is parameterised by a closed error
      // channel; we adapt the test resolver's `unknown` channel via cast
      // because vitest doubles don't need that fidelity.
      (resolverOverride ?? (() => Effect.succeed(trustedRequestContext))) as (
        request: Request,
      ) => Effect.Effect<RequestContext, never>,
    runWithService: (use) => use(createServiceDouble(service)),
  });

const url = (path: string) => `http://localhost${path}`;

// ---------------------------------------------------------------------------
// Path table + registry assertion
// ---------------------------------------------------------------------------

describe("admin-organization HTTP — path table + registry", () => {
  it("pins the public base path and per-route literals", () => {
    expect(adminOrganizationApiBasePath).toBe("/api/admin-organization");
    expect(adminOrganizationApiPath).toEqual({
      listMembers: "/api/admin-organization/members",
      inviteMember: "/api/admin-organization/invitations",
      redeemInvitation: "/api/admin-organization/invitations/redeem",
      memberRoleByMemberIdTemplate: "/api/admin-organization/members/:id/role",
      memberByMemberIdTemplate: "/api/admin-organization/members/:id",
      capabilitiesBySubjectIdTemplate:
        "/api/admin-organization/capabilities/:subjectId",
    });
  });

  it("is registered against the canonical backend API router via adminOrganizationApiBasePath", async () => {
    // Mechanical check that the backend API surface advertises the
    // base path so the slice 1c-platform commit-2 registration in
    // `packages/platform/src/http/backend-api.ts` cannot be quietly
    // dropped without this test failing.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const backendApiSource = await fs.readFile(
      path.resolve("packages/platform/src/http/backend-api.ts"),
      "utf8",
    );
    expect(backendApiSource.includes("adminOrganizationApiBasePath")).toBe(
      true,
    );
    expect(backendApiSource.includes("adminOrganizationHandler")).toBe(true);
    expect(
      backendApiSource.includes("handleAdminOrganizationHttpRequest"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Per-route happy + sad paths
// ---------------------------------------------------------------------------

describe("admin-organization HTTP — list members", () => {
  it("returns the service's members envelope on GET happy path", async () => {
    const members = [fakeMember({ id: "mem_1" }), fakeMember({ id: "mem_2" })];
    const handler = createTestHandler({
      listMembers: () => Effect.succeed(members),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.listMembers), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ members });
  });

  it("rejects an unsupported method with 405", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.listMembers), {
          method: "POST",
        }),
      ),
    );
    expect(response.status).toBe(405);
  });

  it("returns 400 when the query schema rejects an unsupported filter literal", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url(adminOrganizationApiPath.listMembers)}?includeArchived=yes`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(400);
  });
});

describe("admin-organization HTTP — invite member", () => {
  it("creates an invitation on POST happy path (201)", async () => {
    const invitation = fakeInvitation({ invitationId: "inv_happy" });
    const handler = createTestHandler({
      inviteMember: () =>
        Effect.succeed({
          invitation,
          invitationToken: "amiv_secret_token",
        }),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.inviteMember), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "invite@example.com",
            invitedRole: adminMemberRole.viewer,
            invitedBy: "usr_http_inviter",
          }),
        }),
      ),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      invitation,
      invitationToken: "amiv_secret_token",
    });
  });

  it("returns 400 for an invalid invite body", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.inviteMember), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "",
            invitedRole: "not-a-role",
            invitedBy: "",
          }),
        }),
      ),
    );
    expect(response.status).toBe(400);
  });

  it("maps AdminMemberAlreadyExists to 409", async () => {
    const handler = createTestHandler({
      inviteMember: () =>
        Effect.fail(
          new AdminMemberAlreadyExists({
            field: "email",
            value: "dup@example.com",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.inviteMember), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "dup@example.com",
            invitedRole: adminMemberRole.viewer,
            invitedBy: "usr_http_inviter",
          }),
        }),
      ),
    );
    expect(response.status).toBe(409);
  });

  it("maps AdminInvitationNotificationDispatchError to 502", async () => {
    const handler = createTestHandler({
      inviteMember: () =>
        Effect.fail(
          new AdminInvitationNotificationDispatchError({
            invitationId: "inv_dispatch_fail",
            cause: new Error("novu down"),
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.inviteMember), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "dispatch-fail@example.com",
            invitedRole: adminMemberRole.viewer,
            invitedBy: "usr_http_inviter",
          }),
        }),
      ),
    );
    expect(response.status).toBe(502);
  });
});

describe("admin-organization HTTP — redeem invitation", () => {
  it("returns the redeemed member on POST happy path", async () => {
    const member = fakeMember({
      id: "mem_redeemed",
      role: adminMemberRole.adminAdmin,
    });
    const handler = createTestHandler({
      redeemInvitation: () => Effect.succeed(member),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.redeemInvitation), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invitationToken: "amiv_redeem_token",
            keycloakSubjectId: "kc_redeem",
            displayName: "Redeem User",
          }),
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ member });
  });

  it("maps AdminInvitationNotFound to 404", async () => {
    const handler = createTestHandler({
      redeemInvitation: () =>
        Effect.fail(new AdminInvitationNotFound({ tokenHashOrId: "missing" })),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.redeemInvitation), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invitationToken: "amiv_missing",
            keycloakSubjectId: "kc_missing",
            displayName: "Missing",
          }),
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("maps AdminInvitationExpired to 410", async () => {
    const handler = createTestHandler({
      redeemInvitation: () =>
        Effect.fail(
          new AdminInvitationExpired({
            invitationId: "inv_expired",
            expiresAt: "2020-01-01T00:00:00.000Z",
            now: "2024-01-01T00:00:00.000Z",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.redeemInvitation), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invitationToken: "amiv_expired",
            keycloakSubjectId: "kc_expired",
            displayName: "Expired",
          }),
        }),
      ),
    );
    expect(response.status).toBe(410);
  });

  it("maps AdminInvitationAlreadyRedeemed to 409", async () => {
    const handler = createTestHandler({
      redeemInvitation: () =>
        Effect.fail(
          new AdminInvitationAlreadyRedeemed({
            invitationId: "inv_dbl",
            status: "redeemed",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.redeemInvitation), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invitationToken: "amiv_dbl",
            keycloakSubjectId: "kc_dbl",
            displayName: "Doubled",
          }),
        }),
      ),
    );
    expect(response.status).toBe(409);
  });

  it("returns 400 when JSON body is malformed", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.redeemInvitation), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "not json",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

describe("admin-organization HTTP — change member role", () => {
  it("updates the role on PATCH happy path", async () => {
    const updated = fakeMember({
      id: "mem_promoted",
      role: adminMemberRole.adminOwner,
    });
    let receivedMemberId: string | undefined;
    const handler = createTestHandler({
      changeMemberRole: (input) => {
        receivedMemberId = input.memberId;
        return Effect.succeed(updated);
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/admin-organization/members/mem_promoted/role"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newRole: adminMemberRole.adminOwner }),
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ member: updated });
    expect(receivedMemberId).toBe("mem_promoted");
  });

  it("maps AdminRoleChangeNotPermitted to 403", async () => {
    const handler = createTestHandler({
      changeMemberRole: () =>
        Effect.fail(
          new AdminRoleChangeNotPermitted({
            memberId: "mem_archived",
            reason: "archived",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/admin-organization/members/mem_archived/role"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newRole: adminMemberRole.adminOwner }),
        }),
      ),
    );
    expect(response.status).toBe(403);
  });

  it("maps AdminOwnerCountInvariant to 409", async () => {
    const handler = createTestHandler({
      changeMemberRole: () =>
        Effect.fail(
          new AdminOwnerCountInvariant({
            memberId: "mem_last_owner",
            currentOwnerCount: 1,
            attemptedOperation: "changeMemberRole",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          url("/api/admin-organization/members/mem_last_owner/role"),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newRole: adminMemberRole.viewer }),
          },
        ),
      ),
    );
    expect(response.status).toBe(409);
  });
});

describe("admin-organization HTTP — remove member", () => {
  it("acknowledges removal on DELETE happy path", async () => {
    let receivedMemberId: string | undefined;
    const handler = createTestHandler({
      removeMember: (input) => {
        receivedMemberId = input.memberId;
        return Effect.void;
      },
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/admin-organization/members/mem_to_remove"), {
          method: "DELETE",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      memberId: "mem_to_remove",
    });
    expect(receivedMemberId).toBe("mem_to_remove");
  });

  it("maps AdminMemberNotFound to 404", async () => {
    const handler = createTestHandler({
      removeMember: () =>
        Effect.fail(
          new AdminMemberNotFound({
            memberKey: "mem_missing",
            lookup: "id",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/admin-organization/members/mem_missing"), {
          method: "DELETE",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("maps AdminOwnerCountInvariant to 409 on remove", async () => {
    const handler = createTestHandler({
      removeMember: () =>
        Effect.fail(
          new AdminOwnerCountInvariant({
            memberId: "mem_sole_owner",
            currentOwnerCount: 1,
            attemptedOperation: "removeMember",
          }),
        ),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/admin-organization/members/mem_sole_owner"), {
          method: "DELETE",
        }),
      ),
    );
    expect(response.status).toBe(409);
  });
});

describe("admin-organization HTTP — resolve capabilities", () => {
  it("returns the resolved capability envelope on GET happy path", async () => {
    const capabilities = fakeCapabilities();
    const handler = createTestHandler({
      resolveCapabilitiesFor: () => Effect.succeed(capabilities),
    });
    const response = await Effect.runPromise(
      handler(
        new Request(
          `${url("/api/admin-organization/capabilities/kc_subject")}?hasPrivilegedAccess=false&canImpersonate=false&canRevealSecrets=false&canReadAudit=true`,
          { method: "GET" },
        ),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ capabilities });
  });

  it("returns 400 when capability query parameters are missing", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/admin-organization/capabilities/kc_subject"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Not-found + session-resolver failures
// ---------------------------------------------------------------------------

describe("admin-organization HTTP — routing fallbacks + resolver failures", () => {
  it("returns 404 for an unknown admin-organization route", async () => {
    const handler = createTestHandler({});
    const response = await Effect.runPromise(
      handler(
        new Request(url("/api/admin-organization/unknown/route"), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });

  it("returns 401 when the trusted request-context resolver reports a missing session", async () => {
    const handler = createTestHandler(
      { listMembers: () => Effect.succeed([]) },
      () =>
        Effect.fail({
          _tag: "SubscriberJourneySessionIdMissingError" as const,
        }),
    );
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.listMembers), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(401);
  });

  it("returns 404 when the trusted request-context resolver reports a missing identity-session row", async () => {
    const handler = createTestHandler(
      { listMembers: () => Effect.succeed([]) },
      () =>
        Effect.fail({
          _tag: "IdentitySessionRequestContextNotFoundError" as const,
        }),
    );
    const response = await Effect.runPromise(
      handler(
        new Request(url(adminOrganizationApiPath.listMembers), {
          method: "GET",
        }),
      ),
    );
    expect(response.status).toBe(404);
  });
});

// Sanity-touch the typed workflow id constant so a future regression that
// drops the `novuWorkflowId.adminOrganizationInvitation` literal lands in
// this test surface rather than silently breaking the dispatch wiring.
void novuWorkflowId.adminOrganizationInvitation;
