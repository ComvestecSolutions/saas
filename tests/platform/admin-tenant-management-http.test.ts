import { Effect, Schema } from "effect";
import {
  authorizationRelation,
  onboardingStepStatus,
  platformScope,
  tenantInvitationEmailDeliveryStatus,
  tenantInvitationStatus,
  tenantMembershipMutationAction,
  tenantOnboardingRunStatus,
} from "@comvestec/contracts";
import {
  adminTenantManagementApiPath,
  createAdminTenantManagementHttpHandler,
  subscriberJourneySessionHeaderName,
  type AdminTenantManagementService,
} from "@comvestec/platform";

const unexpectedAdminTenantManagementServiceEffect = <A>() =>
  Effect.die(
    new Error("Unexpected admin tenant management test service call."),
  );

const createAdminTenantManagementServiceDouble = (
  overrides: Partial<AdminTenantManagementService>,
): AdminTenantManagementService => ({
  issueTenantInvitation:
    overrides.issueTenantInvitation ??
    (() => unexpectedAdminTenantManagementServiceEffect()),
  listTenantInvitations:
    overrides.listTenantInvitations ??
    (() => unexpectedAdminTenantManagementServiceEffect()),
  mutateTenantMembership:
    overrides.mutateTenantMembership ??
    (() => unexpectedAdminTenantManagementServiceEffect()),
  listTenantMemberships:
    overrides.listTenantMemberships ??
    (() => unexpectedAdminTenantManagementServiceEffect()),
  runTenantInvitationReminderWorkflowJob:
    overrides.runTenantInvitationReminderWorkflowJob ??
    (() => unexpectedAdminTenantManagementServiceEffect()),
  runTenantInvitationExpiryNotificationWorkflowJob:
    overrides.runTenantInvitationExpiryNotificationWorkflowJob ??
    (() => unexpectedAdminTenantManagementServiceEffect()),
  revokeTenantInvitation:
    overrides.revokeTenantInvitation ??
    (() => unexpectedAdminTenantManagementServiceEffect()),
  reviewTenantOnboarding:
    overrides.reviewTenantOnboarding ??
    (() => unexpectedAdminTenantManagementServiceEffect()),
});

const createTestHandler = (service: Partial<AdminTenantManagementService>) =>
  createAdminTenantManagementHttpHandler((use) =>
    use(createAdminTenantManagementServiceDouble(service)),
  );

const parseFailureEffect = <A>() =>
  Schema.decodeUnknown(Schema.Struct({ required: Schema.NonEmptyString }))({
    required: "",
  }) as Effect.Effect<A>;

describe("platform admin tenant management http", () => {
  it("routes tenant membership mutation through the trusted session context", async () => {
    let receivedInput:
      | Parameters<AdminTenantManagementService["mutateTenantMembership"]>[0]
      | undefined;
    const mutateTenantMembership = vi.fn((input) => {
      receivedInput = input;

      return Effect.succeed({
        tenant: input.tenant,
        subject: input.subject,
        relation: input.relation,
        action: input.action,
        changed: true,
        membership: {
          subject: input.subject,
          relations: [
            authorizationRelation.admin,
            authorizationRelation.member,
            authorizationRelation.viewer,
          ],
        },
      } as const);
    });
    const handler = createTestHandler({
      mutateTenantMembership,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.mutateMembership}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_tenant_membership_mutation",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_1",
                organizationId: "org_1",
              },
              subject: "usr_member_1",
              relation: authorizationRelation.admin,
              action: tenantMembershipMutationAction.grant,
              mutationReason: "  Grant admin access for recovery.  ",
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
      subject: "usr_member_1",
      relation: authorizationRelation.admin,
      action: tenantMembershipMutationAction.grant,
      changed: true,
      membership: {
        subject: "usr_member_1",
        relations: [
          authorizationRelation.admin,
          authorizationRelation.member,
          authorizationRelation.viewer,
        ],
      },
    });
    expect(receivedInput).toEqual({
      sessionId: "sess_admin_tenant_membership_mutation",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      subject: "usr_member_1",
      relation: authorizationRelation.admin,
      action: tenantMembershipMutationAction.grant,
      mutationReason: "Grant admin access for recovery.",
    });
  });

  it("rejects membership mutation payloads whose reason is only whitespace", async () => {
    const mutateTenantMembership = vi.fn(() =>
      unexpectedAdminTenantManagementServiceEffect(),
    );
    const handler = createTestHandler({
      mutateTenantMembership,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.mutateMembership}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_tenant_membership_mutation_bad_reason",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_1",
                organizationId: "org_1",
              },
              subject: "usr_member_1",
              relation: authorizationRelation.admin,
              action: tenantMembershipMutationAction.grant,
              mutationReason: "   ",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
    expect(mutateTenantMembership).not.toHaveBeenCalled();
  });

  it("routes tenant membership inspection through the trusted session context and trims inspection reasons", async () => {
    let receivedInput:
      | Parameters<AdminTenantManagementService["listTenantMemberships"]>[0]
      | undefined;
    const listTenantMemberships = vi.fn((input) => {
      receivedInput = input;

      return Effect.succeed({
        tenant: input.tenant,
        memberships: [
          {
            subject: "usr_member_1",
            relations: [
              authorizationRelation.member,
              authorizationRelation.viewer,
            ],
          },
        ],
      } as const);
    });
    const handler = createTestHandler({
      listTenantMemberships,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.queryMemberships}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_tenant_memberships",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_1",
                organizationId: "org_1",
              },
              inspectionReason: "  Investigate current memberships  ",
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
      memberships: [
        {
          subject: "usr_member_1",
          relations: [
            authorizationRelation.member,
            authorizationRelation.viewer,
          ],
        },
      ],
    });
    expect(receivedInput).toEqual({
      sessionId: "sess_admin_tenant_memberships",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      inspectionReason: "Investigate current memberships",
    });
  });

  it("routes tenant invitation issuance through the trusted session context and trims operator input", async () => {
    let receivedInput:
      | Parameters<AdminTenantManagementService["issueTenantInvitation"]>[0]
      | undefined;
    const issueTenantInvitation = vi.fn((input) => {
      receivedInput = input;

      return Effect.succeed({
        tenant: input.tenant,
        invitation: {
          invitationId: "invite_org_1_admin_1",
          recipientEmail: input.recipientEmail,
          relation: input.relation,
          status: tenantInvitationStatus.pending,
          issuedBy: "usr_platform_operator",
          issuedAt: "2026-05-02T12:00:00.000Z",
          expiresAt: "2026-05-05T12:00:00.000Z",
        },
        handoff: {
          invitationToken: "tmiv_secret_token",
          expiresAt: "2026-05-05T12:00:00.000Z",
        },
        delivery: {
          status: tenantInvitationEmailDeliveryStatus.queued,
          template: "tenant-management.membership-invitation@v1",
          messageId: "email-delivery:organization:org_1:invite_1",
        },
      } as const);
    });
    const handler = createTestHandler({
      issueTenantInvitation,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.issueInvitation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_tenant_invitation_issue",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_1",
                organizationId: "org_1",
              },
              recipientEmail: "  owner+invite@example.com  ",
              relation: authorizationRelation.admin,
              issueReason: "  Invite a recovery admin  ",
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
      invitation: {
        invitationId: "invite_org_1_admin_1",
        recipientEmail: "owner+invite@example.com",
        relation: authorizationRelation.admin,
        status: tenantInvitationStatus.pending,
        issuedBy: "usr_platform_operator",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: "2026-05-05T12:00:00.000Z",
      },
      handoff: {
        invitationToken: "tmiv_secret_token",
        expiresAt: "2026-05-05T12:00:00.000Z",
      },
      delivery: {
        status: tenantInvitationEmailDeliveryStatus.queued,
        template: "tenant-management.membership-invitation@v1",
        messageId: "email-delivery:organization:org_1:invite_1",
      },
    });
    expect(receivedInput).toEqual({
      sessionId: "sess_admin_tenant_invitation_issue",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      recipientEmail: "owner+invite@example.com",
      relation: authorizationRelation.admin,
      issueReason: "Invite a recovery admin",
    });
  });

  it("routes tenant invitation inspection through the trusted session context and trims inspection reasons", async () => {
    let receivedInput:
      | Parameters<AdminTenantManagementService["listTenantInvitations"]>[0]
      | undefined;
    const listTenantInvitations = vi.fn((input) => {
      receivedInput = input;

      return Effect.succeed({
        tenant: input.tenant,
        invitations: [
          {
            invitationId: "invite_org_1_admin_1",
            recipientEmail: "owner+invite@example.com",
            relation: authorizationRelation.admin,
            status: tenantInvitationStatus.pending,
            issuedBy: "usr_platform_operator",
            issuedAt: "2026-05-02T12:00:00.000Z",
            expiresAt: "2026-05-05T12:00:00.000Z",
          },
        ],
      } as const);
    });
    const handler = createTestHandler({
      listTenantInvitations,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.queryInvitations}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_tenant_invitations",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_1",
                organizationId: "org_1",
              },
              inspectionReason: "  Review pending invites  ",
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
      invitations: [
        {
          invitationId: "invite_org_1_admin_1",
          recipientEmail: "owner+invite@example.com",
          relation: authorizationRelation.admin,
          status: tenantInvitationStatus.pending,
          issuedBy: "usr_platform_operator",
          issuedAt: "2026-05-02T12:00:00.000Z",
          expiresAt: "2026-05-05T12:00:00.000Z",
        },
      ],
    });
    expect(receivedInput).toEqual({
      sessionId: "sess_admin_tenant_invitations",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      inspectionReason: "Review pending invites",
    });
  });

  it("routes tenant invitation revocation through the trusted session context and trims revocation reasons", async () => {
    let receivedInput:
      | Parameters<AdminTenantManagementService["revokeTenantInvitation"]>[0]
      | undefined;
    const revokeTenantInvitation = vi.fn((input) => {
      receivedInput = input;

      return Effect.succeed({
        tenant: input.tenant,
        invitationId: input.invitationId,
        changed: true,
        invitation: {
          invitationId: input.invitationId,
          recipientEmail: "owner+invite@example.com",
          relation: authorizationRelation.admin,
          status: tenantInvitationStatus.revoked,
          issuedBy: "usr_platform_operator",
          issuedAt: "2026-05-02T12:00:00.000Z",
          expiresAt: "2026-05-05T12:00:00.000Z",
          revokedAt: "2026-05-02T13:00:00.000Z",
          revokedBy: "usr_platform_operator",
        },
      } as const);
    });
    const handler = createTestHandler({
      revokeTenantInvitation,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.revokeInvitation}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_tenant_invitation_revoke",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_1",
                organizationId: "org_1",
              },
              invitationId: "invite_org_1_admin_1",
              revocationReason: "  Access request was withdrawn  ",
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
      changed: true,
      invitation: {
        invitationId: "invite_org_1_admin_1",
        recipientEmail: "owner+invite@example.com",
        relation: authorizationRelation.admin,
        status: tenantInvitationStatus.revoked,
        issuedBy: "usr_platform_operator",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: "2026-05-05T12:00:00.000Z",
        revokedAt: "2026-05-02T13:00:00.000Z",
        revokedBy: "usr_platform_operator",
      },
    });
    expect(receivedInput).toEqual({
      sessionId: "sess_admin_tenant_invitation_revoke",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      invitationId: "invite_org_1_admin_1",
      revocationReason: "Access request was withdrawn",
    });
  });

  it("requires the trusted session header for tenant onboarding review requests", async () => {
    const reviewTenantOnboarding = vi.fn(() =>
      unexpectedAdminTenantManagementServiceEffect(),
    );
    const handler = createTestHandler({
      reviewTenantOnboarding,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.reviewOnboarding}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_1",
                organizationId: "org_1",
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error:
        "Admin tenant management requests require a valid authenticated session.",
    });
    expect(reviewTenantOnboarding).not.toHaveBeenCalled();
  });

  it("routes onboarding review through the trusted session context and trims inspection reasons", async () => {
    let receivedInput:
      | Parameters<AdminTenantManagementService["reviewTenantOnboarding"]>[0]
      | undefined;
    const reviewTenantOnboarding = vi.fn((input) => {
      receivedInput = input;

      return Effect.succeed({
        tenant: input.tenant,
        run: {
          runId: "onboarding:org_1:latest",
          triggeredBy: "usr_owner_org_1",
          correlationId: "corr_onboarding_org_1",
          status: tenantOnboardingRunStatus.inProgress,
          currentStepId: "team-invites",
          startedAt: "2026-05-02T07:10:00.000Z",
          steps: [
            {
              stepId: "team-invites",
              label: "Invite core team members and assign roles.",
              status: onboardingStepStatus.inProgress,
              retryCount: 0,
            },
          ],
        },
      } as const);
    });
    const handler = createTestHandler({
      reviewTenantOnboarding,
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.reviewOnboarding}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_tenant_onboarding",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_1",
                organizationId: "org_1",
              },
              inspectionReason: "  Investigate stuck onboarding  ",
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
      run: {
        runId: "onboarding:org_1:latest",
        triggeredBy: "usr_owner_org_1",
        correlationId: "corr_onboarding_org_1",
        status: tenantOnboardingRunStatus.inProgress,
        currentStepId: "team-invites",
        startedAt: "2026-05-02T07:10:00.000Z",
        steps: [
          {
            stepId: "team-invites",
            label: "Invite core team members and assign roles.",
            status: "in-progress",
            retryCount: 0,
          },
        ],
      },
    });
    expect(receivedInput).toEqual({
      sessionId: "sess_admin_tenant_onboarding",
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      inspectionReason: "Investigate stuck onboarding",
    });
  });

  it("returns a schema error when the review body is malformed", async () => {
    const handler = createTestHandler({
      reviewTenantOnboarding: () => parseFailureEffect(),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.reviewOnboarding}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]: "sess_admin_bad_request",
            },
            body: JSON.stringify({
              tenant: {
                scopeId: "org_1",
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request payload did not match the expected schema.",
    });
  });

  it("maps membership access denial to a 403 response", async () => {
    const handler = createTestHandler({
      listTenantMemberships: () =>
        Effect.fail({
          _tag: "AdminTenantManagementAccessDeniedError",
          reason: "Denied delegated tenant-read access for this operator.",
          auditRequired: true,
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.queryMemberships}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_tenant_memberships_denied",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_2",
                organizationId: "org_2",
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Tenant membership inspection is not allowed for this session.",
    });
  });

  it("maps membership mutation access denial to a 403 response", async () => {
    const handler = createTestHandler({
      mutateTenantMembership: () =>
        Effect.fail({
          _tag: "AdminTenantManagementAccessDeniedError",
          reason:
            "Denied delegated membership-manage access for this operator.",
          auditRequired: true,
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.mutateMembership}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_tenant_membership_mutation_denied",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_2",
                organizationId: "org_2",
              },
              subject: "usr_member_2",
              relation: authorizationRelation.admin,
              action: tenantMembershipMutationAction.grant,
              mutationReason: "Grant admin access for recovery.",
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Tenant membership mutation is not allowed for this session.",
    });
  });

  it("maps tenant-read access denial to a 403 response", async () => {
    const handler = createTestHandler({
      reviewTenantOnboarding: () =>
        Effect.fail({
          _tag: "AdminTenantManagementAccessDeniedError",
          reason: "Denied delegated tenant-read access for this operator.",
          auditRequired: true,
        } as const),
    });

    const response = await Effect.runPromise(
      handler(
        new Request(
          `http://localhost${adminTenantManagementApiPath.reviewOnboarding}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              [subscriberJourneySessionHeaderName]:
                "sess_admin_tenant_onboarding_denied",
            },
            body: JSON.stringify({
              tenant: {
                scope: platformScope.organization,
                scopeId: "org_2",
                organizationId: "org_2",
              },
            }),
          },
        ),
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Tenant onboarding review is not allowed for this session.",
    });
  });
});
