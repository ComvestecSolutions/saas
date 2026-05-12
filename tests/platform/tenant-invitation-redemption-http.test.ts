import { Effect } from "effect";
import { authorizationRelation, platformScope } from "@comvestec/contracts";
import {
  createTenantInvitationRedemptionHttpHandler,
  subscriberJourneySessionHeaderName,
  tenantInvitationRedemptionApiPath,
  type TenantInvitationRedemptionService,
} from "@comvestec/platform";

const unexpectedTenantInvitationRedemptionServiceEffect = <A>() =>
  Effect.die(
    new Error("Unexpected tenant invitation redemption test service call."),
  );

const createTenantInvitationRedemptionServiceDouble = (
  overrides: Partial<TenantInvitationRedemptionService>,
): TenantInvitationRedemptionService => ({
  redeemTenantInvitation:
    overrides.redeemTenantInvitation ??
    (() => unexpectedTenantInvitationRedemptionServiceEffect()),
});

const createTestHandler = (
  service: Partial<TenantInvitationRedemptionService>,
) =>
  createTenantInvitationRedemptionHttpHandler((use) =>
    use(createTenantInvitationRedemptionServiceDouble(service)),
  );

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

describe("platform tenant invitation redemption http", () => {
  it("routes tenant invitation redemption through the trusted session context and trims the token", async () => {
    let receivedInput:
      | Parameters<
          TenantInvitationRedemptionService["redeemTenantInvitation"]
        >[0]
      | undefined;
    const redeemTenantInvitation = vi.fn((input) => {
      receivedInput = input;

      return Effect.succeed({
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
      } as const);
    });
    const handler = createTestHandler({
      redeemTenantInvitation,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${tenantInvitationRedemptionApiPath.redeem}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_tenant_invitation_redeem",
            },
            body: JSON.stringify({
              invitationToken: "  tmiv_secret_token  ",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
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
    expect(receivedInput).toEqual({
      sessionId: "sess_tenant_invitation_redeem",
      invitationToken: "tmiv_secret_token",
    });
  });

  it("requires the trusted session header for tenant invitation redemption requests", async () => {
    const redeemTenantInvitation = vi.fn(() =>
      unexpectedTenantInvitationRedemptionServiceEffect(),
    );
    const handler = createTestHandler({
      redeemTenantInvitation,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${tenantInvitationRedemptionApiPath.redeem}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              invitationToken: "tmiv_secret_token",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error:
        "Tenant invitation redemption requires a valid authenticated session.",
    });
    expect(redeemTenantInvitation).not.toHaveBeenCalled();
  });

  it("maps unavailable invitation tokens to a not-found response", async () => {
    const redeemTenantInvitation = vi.fn(() =>
      Effect.fail({
        _tag: "TenantInvitationRedemptionUnavailableError",
      } as const),
    );
    const handler = createTestHandler({
      redeemTenantInvitation,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${tenantInvitationRedemptionApiPath.redeem}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_tenant_invitation_redeem_missing",
            },
            body: JSON.stringify({
              invitationToken: "tmiv_missing_token",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Requested resource was not found.",
    });
  });

  it("returns a schema error when the redemption body is malformed", async () => {
    const redeemTenantInvitation = vi.fn(() =>
      unexpectedTenantInvitationRedemptionServiceEffect(),
    );
    const handler = createTestHandler({
      redeemTenantInvitation,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${tenantInvitationRedemptionApiPath.redeem}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_tenant_invitation_redeem_bad_body",
            },
            body: JSON.stringify({
              invitationToken: "   ",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
    expect(redeemTenantInvitation).not.toHaveBeenCalled();
  });
});
