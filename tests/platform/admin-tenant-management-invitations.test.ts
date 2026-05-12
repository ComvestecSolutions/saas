import { Effect } from "effect";
import {
  actorType,
  authorizationNamespace,
  authorizationRelation,
  permissionScope,
  platformModuleId,
  platformScope,
  tenantInvitationEmailDeliveryStatus,
  tenantInvitationStatus,
  tenantManagementAuditAction,
  tenantManagementConfigKey,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
} from "@comvestec/contracts";
import {
  type AuthorizationModuleService,
  AuditLogModule,
  IdentitySessionModule,
  RuntimeConfigModule,
  TenantInvitationPostgresRepository,
  TenantOnboardingPostgresRepository,
  buildTenantInvitationExpiryNotificationWorkflowJobId,
  buildTenantInvitationReminderWorkflowJobId,
  type TenantInvitationNotificationWorkflowJobRecord,
  type WorkflowJobsPostgresRepositoryServiceForRecord,
} from "@comvestec/modules";
import {
  type AuthenticatedConvexWorkflowClient,
  makeAdminTenantManagementService,
  OryKetoAdapter,
  platformAdapterServiceName,
  tenantInvitationExpiryNotificationEmailTemplateTrackingId,
  tenantInvitationEmailTemplateTrackingId,
  tenantInvitationReminderEmailTemplateTrackingId,
} from "@comvestec/platform";

const unexpectedEffect = <A>() =>
  Effect.die(new Error("Unexpected invitation test service call."));

const createInvitationWorkflowJobsRepositoryDouble = (
  overrides: Partial<
    WorkflowJobsPostgresRepositoryServiceForRecord<TenantInvitationNotificationWorkflowJobRecord>
  >,
): WorkflowJobsPostgresRepositoryServiceForRecord<TenantInvitationNotificationWorkflowJobRecord> => ({
  persistWorkflowJob:
    overrides.persistWorkflowJob ?? (() => unexpectedEffect()),
  getWorkflowJob: overrides.getWorkflowJob ?? (() => unexpectedEffect()),
  claimScheduledWorkflowJob:
    overrides.claimScheduledWorkflowJob ?? (() => unexpectedEffect()),
  restoreWorkflowJobIfUpdatedAtMatches:
    overrides.restoreWorkflowJobIfUpdatedAtMatches ??
    (() => unexpectedEffect()),
  cancelWorkflowJobIfUpdatedAtMatches:
    overrides.cancelWorkflowJobIfUpdatedAtMatches ?? (() => unexpectedEffect()),
  listDueWorkflowJobs:
    overrides.listDueWorkflowJobs ?? (() => unexpectedEffect()),
  listRepairGapWorkflowJobs:
    overrides.listRepairGapWorkflowJobs ?? (() => unexpectedEffect()),
});

const createInvitationWorkflowSchedulerClientDouble = (
  overrides: Partial<{
    scheduleTenantInvitationReminderWorkflowJob: NonNullable<
      AuthenticatedConvexWorkflowClient["scheduleTenantInvitationReminderWorkflowJob"]
    >;
    scheduleTenantInvitationExpiryNotificationWorkflowJob: NonNullable<
      AuthenticatedConvexWorkflowClient["scheduleTenantInvitationExpiryNotificationWorkflowJob"]
    >;
  }>,
) => ({
  scheduleTenantInvitationReminderWorkflowJob:
    overrides.scheduleTenantInvitationReminderWorkflowJob ??
    (() => unexpectedEffect()),
  scheduleTenantInvitationExpiryNotificationWorkflowJob:
    overrides.scheduleTenantInvitationExpiryNotificationWorkflowJob ??
    (() => unexpectedEffect()),
});

const pendingInvitationExpiresAt = new Date(
  Date.now() + 365 * 24 * 60 * 60 * 1_000,
).toISOString();

describe("platform admin tenant management invitation service", () => {
  it("issues tenant invitation records with runtime-config-backed expiry and records an audit event", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_invitation_issue",
      correlationId: "corr_admin_tenant_invitation_issue",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-invitation-issue:org_1",
        reason: "Allowed to manage tenant invitations.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const resolveStoredConfigValue = vi.fn(() =>
      Effect.succeed({
        moduleId: platformModuleId.tenantManagement,
        key: tenantManagementConfigKey.membershipInviteExpiryHours,
        effectiveValue: 48,
        source: "default",
        entitled: true,
      }),
    );
    const createInvitation = vi.fn((input) => Effect.succeed(input));
    const appendAuditEvent = vi.fn((_input) =>
      Effect.succeed({
        eventId: "evt_tenant_invitation_issued",
        timestamp: "2026-05-02T12:00:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.invitationIssued,
        target: "organization:org_1:invitations:invite_stub",
        correlationId: requestContext.correlationId,
        reason: "Invite an emergency admin.",
      }),
    );
    const persistIssuedInvitation = vi.fn((input) =>
      createInvitation(input.invitation).pipe(
        Effect.flatMap(() => appendAuditEvent(input.auditInput)),
        Effect.asVoid,
      ),
    );
    const sendTransactionalEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: "email-delivery:organization:org_1:invite_1",
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-05-02T12:00:05.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const runtimeConfig = {
      resolveStoredConfigValue,
    } as unknown as RuntimeConfigModule["Type"];
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        appBaseUrl: "https://product.example",
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
        emailDelivery: {
          sendTransactionalEmail,
        },
        persistIssuedInvitation,
        runtimeConfig,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const issuedAtFloor = Date.now();

    const result = await Effect.runPromise(
      service.issueTenantInvitation({
        sessionId: "sess_admin_tenant_invitation_issue",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        recipientEmail: "  emergency-admin@example.com  ",
        relation: authorizationRelation.admin,
        issueReason: "  Invite an emergency admin.  ",
      }),
    );
    const issuedAtCeiling = Date.now();
    const persistedInvitation = createInvitation.mock.calls[0]?.[0];
    const persistedIssuedAt = Date.parse(persistedInvitation.issuedAt);
    const persistedExpiresAt = Date.parse(persistedInvitation.expiresAt);

    expect(result.tenant).toEqual({
      scope: platformScope.organization,
      scopeId: "org_1",
      organizationId: "org_1",
    });
    expect(result.invitation.recipientEmail).toBe(
      "emergency-admin@example.com",
    );
    expect(result.invitation.relation).toBe(authorizationRelation.admin);
    expect(result.invitation.status).toBe(tenantInvitationStatus.pending);
    expect(result.invitation.issuedBy).toBe("usr_platform_operator");
    expect(result.handoff.invitationToken).toEqual(expect.any(String));
    expect(result.handoff.expiresAt).toBe(result.invitation.expiresAt);
    expect(result.delivery).toEqual({
      status: tenantInvitationEmailDeliveryStatus.queued,
      template: tenantInvitationEmailTemplateTrackingId,
      messageId: "email-delivery:organization:org_1:invite_1",
    });
    expect(persistedIssuedAt).toBeGreaterThanOrEqual(issuedAtFloor);
    expect(persistedIssuedAt).toBeLessThanOrEqual(issuedAtCeiling);
    expect(persistedExpiresAt - persistedIssuedAt).toBe(48 * 60 * 60 * 1000);
    expect(result.invitation.issuedAt).toBe(persistedInvitation.issuedAt);
    expect(result.invitation.expiresAt).toBe(persistedInvitation.expiresAt);
    expect(persistedInvitation.tokenHash).toEqual(expect.any(String));
    expect(authorizationCheck).toHaveBeenCalledWith({
      requestContext,
      namespace: authorizationNamespace.tenant,
      object: "org_1",
      relation: authorizationRelation.admin,
      permissionScope: permissionScope.memberManage,
    });
    expect(resolveStoredConfigValue).toHaveBeenCalledWith({
      requestContext: {
        ...requestContext,
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
      },
      moduleId: platformModuleId.tenantManagement,
      key: tenantManagementConfigKey.membershipInviteExpiryHours,
      entitlements: [],
    });
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipientEmail: "emergency-admin@example.com",
        relation: authorizationRelation.admin,
        tokenHash: expect.any(String),
        status: "pending",
        issuedBy: "usr_platform_operator",
        correlationId: requestContext.correlationId,
        issuedAt: persistedInvitation.issuedAt,
        expiresAt: persistedInvitation.expiresAt,
      }),
    );
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
      action: tenantManagementAuditAction.invitationIssued,
      target: expect.stringMatching(/^organization:org_1:invitations:invite_/),
      reason: "Invite an emergency admin.",
    });
    expect(persistIssuedInvitation).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        requestContext: {
          ...requestContext,
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            organizationId: "org_1",
          },
        },
        recipient: "emergency-admin@example.com",
        template: tenantInvitationEmailTemplateTrackingId,
        subject: "Invitation to join organization org_1",
        html: expect.stringContaining(result.handoff.invitationToken),
        text: expect.stringContaining("https://product.example/auth/start"),
      }),
    );
    const persistIssuedInvitationCallOrder =
      persistIssuedInvitation.mock.invocationCallOrder[0];
    const sendTransactionalEmailCallOrder =
      sendTransactionalEmail.mock.invocationCallOrder[0];

    expect(persistIssuedInvitationCallOrder).toEqual(expect.any(Number));
    expect(sendTransactionalEmailCallOrder).toEqual(expect.any(Number));
    expect(persistIssuedInvitationCallOrder!).toBeLessThan(
      sendTransactionalEmailCallOrder!,
    );
  });

  it("schedules reminder and expiry workflow jobs after the initial invitation email queues", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_invitation_issue_workflows",
      correlationId: "corr_admin_tenant_invitation_issue_workflows",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-invitation-issue:org_1",
        reason: "Allowed to manage tenant invitations.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const resolveStoredConfigValue = vi.fn(({ key }: { key: string }) =>
      Effect.succeed({
        moduleId: platformModuleId.tenantManagement,
        key,
        effectiveValue:
          key ===
          tenantManagementConfigKey.membershipInviteReminderHoursBeforeExpiry
            ? 24
            : 48,
        source: "default",
        entitled: true,
      }),
    );
    const createInvitation = vi.fn((input) => Effect.succeed(input));
    const appendAuditEvent = vi.fn((_input) =>
      Effect.succeed({
        eventId: "evt_tenant_invitation_issued_workflows",
        timestamp: "2026-05-02T12:00:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.invitationIssued,
        target: "organization:org_1:invitations:invite_stub_workflows",
        correlationId: requestContext.correlationId,
        reason: "Invite a tenant admin.",
      }),
    );
    const persistIssuedInvitation = vi.fn((input) =>
      createInvitation(input.invitation).pipe(
        Effect.flatMap(() => appendAuditEvent(input.auditInput)),
        Effect.asVoid,
      ),
    );
    const sendTransactionalEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: `email-delivery:${input.recipient}`,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-05-02T12:00:05.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const persistedJobs: TenantInvitationNotificationWorkflowJobRecord[] = [];
    const scheduleTenantInvitationReminderWorkflowJob = vi.fn(() =>
      Effect.succeed({
        scheduledFunctionId: "tenant-invitation-reminder-1",
        scheduledFunctionIds: [
          "tenant-invitation-reminder-1",
          "tenant-invitation-reminder-2",
        ],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 1,
        expectedRecoveryAttemptCount: 1,
      }),
    );
    const scheduleTenantInvitationExpiryNotificationWorkflowJob = vi.fn(() =>
      Effect.succeed({
        scheduledFunctionId: "tenant-invitation-expiry-1",
        scheduledFunctionIds: [
          "tenant-invitation-expiry-1",
          "tenant-invitation-expiry-2",
        ],
        primaryScheduled: true,
        scheduledRecoveryAttemptCount: 1,
        expectedRecoveryAttemptCount: 1,
      }),
    );
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        appBaseUrl: "https://product.example",
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
        emailDelivery: {
          sendTransactionalEmail,
        },
        persistIssuedInvitation,
        runtimeConfig: {
          resolveStoredConfigValue,
        } as unknown as RuntimeConfigModule["Type"],
        workflowJobs: createInvitationWorkflowJobsRepositoryDouble({
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
        convexWorkflowClient: createInvitationWorkflowSchedulerClientDouble({
          scheduleTenantInvitationReminderWorkflowJob,
          scheduleTenantInvitationExpiryNotificationWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.issueTenantInvitation({
        sessionId: "sess_admin_tenant_invitation_issue_workflows",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        recipientEmail: "tenant-admin@example.com",
        relation: authorizationRelation.admin,
        issueReason: "Invite a tenant admin.",
      }),
    );
    const persistedInvitation = createInvitation.mock.calls[0]?.[0];
    const reminderScheduledAt = new Date(
      Date.parse(persistedInvitation.expiresAt) - 24 * 60 * 60 * 1_000,
    ).toISOString();

    expect(result.delivery.status).toBe(
      tenantInvitationEmailDeliveryStatus.queued,
    );
    expect(scheduleTenantInvitationReminderWorkflowJob).toHaveBeenCalledWith({
      jobId: buildTenantInvitationReminderWorkflowJobId({
        trigger: workflowJobTrigger.operatorRequested,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        key: persistedInvitation.invitationId,
      }),
      scheduledAt: reminderScheduledAt,
    });
    expect(
      scheduleTenantInvitationExpiryNotificationWorkflowJob,
    ).toHaveBeenCalledWith({
      jobId: buildTenantInvitationExpiryNotificationWorkflowJobId({
        trigger: workflowJobTrigger.operatorRequested,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        key: persistedInvitation.invitationId,
      }),
      scheduledAt: persistedInvitation.expiresAt,
    });
    expect(persistedJobs).toHaveLength(4);
    expect(
      persistedJobs
        .filter((job) => job.kind === workflowJobKind.invitationReminder)
        .at(-1),
    ).toMatchObject({
      status: workflowJobStatus.scheduled,
      payload: {
        dispatch: {
          scheduledFunctionId: "tenant-invitation-reminder-1",
        },
      },
    });
    expect(
      persistedJobs
        .filter(
          (job) => job.kind === workflowJobKind.invitationExpiryNotification,
        )
        .at(-1),
    ).toMatchObject({
      status: workflowJobStatus.scheduled,
      payload: {
        dispatch: {
          scheduledFunctionId: "tenant-invitation-expiry-1",
        },
      },
    });
  });

  it("keeps the issued invitation available for manual handoff when email delivery cannot queue", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_invitation_issue_delivery_failure",
      correlationId: "corr_admin_tenant_invitation_issue_delivery_failure",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-invitation-issue:org_1",
        reason: "Allowed to manage tenant invitations.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const resolveStoredConfigValue = vi.fn(() =>
      Effect.succeed({
        moduleId: platformModuleId.tenantManagement,
        key: tenantManagementConfigKey.membershipInviteExpiryHours,
        effectiveValue: 48,
        source: "default",
        entitled: true,
      }),
    );
    const createInvitation = vi.fn((input) => Effect.succeed(input));
    const appendAuditEvent = vi.fn((_input) =>
      Effect.succeed({
        eventId: "evt_tenant_invitation_issued_delivery_failure",
        timestamp: "2026-05-02T13:00:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.invitationIssued,
        target: "organization:org_1:invitations:invite_stub_delivery_failure",
        correlationId: requestContext.correlationId,
        reason: "Invite a backup admin.",
      }),
    );
    const persistIssuedInvitation = vi.fn((input) =>
      createInvitation(input.invitation).pipe(
        Effect.flatMap(() => appendAuditEvent(input.auditInput)),
        Effect.asVoid,
      ),
    );
    const sendTransactionalEmail = vi.fn(() =>
      Effect.fail({
        _tag: "PostalAdapterRequestError",
        operation: "sendEmail",
        status: 502,
        cause: new Error("Postal delivery unavailable."),
      } as const),
    );
    const scheduleTenantInvitationReminderWorkflowJob = vi.fn(() =>
      Effect.die("unexpected reminder workflow schedule"),
    );
    const scheduleTenantInvitationExpiryNotificationWorkflowJob = vi.fn(() =>
      Effect.die("unexpected expiry workflow schedule"),
    );
    const runtimeConfig = {
      resolveStoredConfigValue,
    } as unknown as RuntimeConfigModule["Type"];
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        appBaseUrl: "https://product.example",
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
        emailDelivery: {
          sendTransactionalEmail,
        },
        persistIssuedInvitation,
        runtimeConfig,
        workflowJobs: createInvitationWorkflowJobsRepositoryDouble({}),
        convexWorkflowClient: createInvitationWorkflowSchedulerClientDouble({
          scheduleTenantInvitationReminderWorkflowJob,
          scheduleTenantInvitationExpiryNotificationWorkflowJob,
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.issueTenantInvitation({
        sessionId: "sess_admin_tenant_invitation_issue_delivery_failure",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        recipientEmail: "backup-admin@example.com",
        relation: authorizationRelation.admin,
        issueReason: "Invite a backup admin.",
      }),
    );

    expect(result.invitation.status).toBe(tenantInvitationStatus.pending);
    expect(result.handoff.invitationToken).toEqual(expect.any(String));
    expect(result.delivery).toEqual({
      status: tenantInvitationEmailDeliveryStatus.notQueued,
      template: tenantInvitationEmailTemplateTrackingId,
    });
    expect(persistIssuedInvitation).toHaveBeenCalledTimes(1);
    expect(sendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(scheduleTenantInvitationReminderWorkflowJob).not.toHaveBeenCalled();
    expect(
      scheduleTenantInvitationExpiryNotificationWorkflowJob,
    ).not.toHaveBeenCalled();
  });

  it("runs reminder workflow jobs, queues the reminder email, and records reminderQueuedAt", async () => {
    const now = new Date();
    const invitationId = "invite_reminder_1";
    const jobId = buildTenantInvitationReminderWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      key: invitationId,
    });
    const scheduledJob: TenantInvitationNotificationWorkflowJobRecord = {
      jobId,
      runtime: "convex",
      sourceModuleId: platformModuleId.tenantManagement,
      kind: workflowJobKind.invitationReminder,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 0,
      scheduledAt: now.toISOString(),
      payload: {
        sourceModuleId: platformModuleId.tenantManagement,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        invitationId,
        recipientEmail: "tenant-admin@example.com",
        relation: authorizationRelation.admin,
        correlationId: "corr_reminder_workflow_1",
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const runningJob: TenantInvitationNotificationWorkflowJobRecord = {
      ...scheduledJob,
      status: workflowJobStatus.running,
      attempts: 1,
      updatedAt: now.toISOString(),
    };
    const invitationRecord = {
      invitationId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      tokenHash: "token-hash",
      recipientEmail: "tenant-admin@example.com",
      relation: authorizationRelation.admin,
      status: "pending" as const,
      issuedBy: "usr_platform_operator",
      correlationId: "corr_reminder_workflow_1",
      issuedAt: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    };
    const persistedJobs: TenantInvitationNotificationWorkflowJobRecord[] = [];
    const persistedInvitations: Array<Record<string, unknown>> = [];
    const sendTransactionalEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: `email-delivery:${input.template}`,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: new Date().toISOString(),
        provider: platformAdapterServiceName.postal,
      }),
    );
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        appBaseUrl: "https://product.example",
        emailDelivery: {
          sendTransactionalEmail,
        },
        invitationRepository: {
          createInvitation: (
            input: Parameters<
              TenantInvitationPostgresRepository["Type"]["createInvitation"]
            >[0],
          ) => {
            persistedInvitations.push(input);

            return Effect.succeed(input);
          },
          getInvitationById: () => Effect.succeed(invitationRecord),
          getInvitationByTokenHash: () => unexpectedEffect(),
          listInvitationsByTenant: () => unexpectedEffect(),
          redeemInvitation: () => unexpectedEffect(),
          revokeInvitation: () => unexpectedEffect(),
        } as unknown as TenantInvitationPostgresRepository["Type"],
        workflowJobs: createInvitationWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(scheduledJob),
          claimScheduledWorkflowJob: () => Effect.succeed(runningJob),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: () => unexpectedEffect(),
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext: () => unexpectedEffect(),
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.runTenantInvitationReminderWorkflowJob({ jobId }),
    );

    expect(result).toMatchObject({
      jobId,
      kind: workflowJobKind.invitationReminder,
      status: workflowJobStatus.completed,
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: tenantInvitationReminderEmailTemplateTrackingId,
        recipient: "tenant-admin@example.com",
        text: expect.stringContaining(
          "request a new invitation from an operator",
        ),
      }),
    );
    expect(persistedInvitations).toEqual([
      expect.objectContaining({
        invitationId,
        reminderQueuedAt: expect.any(String),
      }),
    ]);
    expect(persistedJobs.at(-1)).toMatchObject({
      jobId,
      status: workflowJobStatus.completed,
    });
  });

  it("runs expiry workflow jobs, queues the expiry email, and records expiryNotificationQueuedAt", async () => {
    const invitationId = "invite_expiry_1";
    const jobId = buildTenantInvitationExpiryNotificationWorkflowJobId({
      trigger: workflowJobTrigger.operatorRequested,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      key: invitationId,
    });
    const scheduledAt = new Date(
      Date.now() - 24 * 60 * 60 * 1_000,
    ).toISOString();
    const scheduledJob: TenantInvitationNotificationWorkflowJobRecord = {
      jobId,
      runtime: "convex",
      sourceModuleId: platformModuleId.tenantManagement,
      kind: workflowJobKind.invitationExpiryNotification,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 0,
      scheduledAt,
      payload: {
        sourceModuleId: platformModuleId.tenantManagement,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        invitationId,
        recipientEmail: "tenant-admin@example.com",
        relation: authorizationRelation.admin,
        correlationId: "corr_expiry_workflow_1",
      },
      createdAt: scheduledAt,
      updatedAt: scheduledAt,
    };
    const runningJob: TenantInvitationNotificationWorkflowJobRecord = {
      ...scheduledJob,
      status: workflowJobStatus.running,
      attempts: 1,
      updatedAt: new Date().toISOString(),
    };
    const invitationRecord = {
      invitationId,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      tokenHash: "token-hash",
      recipientEmail: "tenant-admin@example.com",
      relation: authorizationRelation.admin,
      status: "pending" as const,
      issuedBy: "usr_platform_operator",
      correlationId: "corr_expiry_workflow_1",
      issuedAt: new Date(Date.now() - 72 * 60 * 60 * 1_000).toISOString(),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
    };
    const persistedJobs: TenantInvitationNotificationWorkflowJobRecord[] = [];
    const persistedInvitations: Array<Record<string, unknown>> = [];
    const sendTransactionalEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: `email-delivery:${input.template}`,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: new Date().toISOString(),
        provider: platformAdapterServiceName.postal,
      }),
    );
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        appBaseUrl: "https://product.example",
        emailDelivery: {
          sendTransactionalEmail,
        },
        invitationRepository: {
          createInvitation: (
            input: Parameters<
              TenantInvitationPostgresRepository["Type"]["createInvitation"]
            >[0],
          ) => {
            persistedInvitations.push(input);

            return Effect.succeed(input);
          },
          getInvitationById: () => Effect.succeed(invitationRecord),
          getInvitationByTokenHash: () => unexpectedEffect(),
          listInvitationsByTenant: () => unexpectedEffect(),
          redeemInvitation: () => unexpectedEffect(),
          revokeInvitation: () => unexpectedEffect(),
        } as unknown as TenantInvitationPostgresRepository["Type"],
        workflowJobs: createInvitationWorkflowJobsRepositoryDouble({
          getWorkflowJob: () => Effect.succeed(scheduledJob),
          claimScheduledWorkflowJob: () => Effect.succeed(runningJob),
          persistWorkflowJob: (record) => {
            persistedJobs.push(record);

            return Effect.succeed(record);
          },
        }),
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: () => unexpectedEffect(),
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext: () => unexpectedEffect(),
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.runTenantInvitationExpiryNotificationWorkflowJob({ jobId }),
    );

    expect(result).toMatchObject({
      jobId,
      kind: workflowJobKind.invitationExpiryNotification,
      status: workflowJobStatus.completed,
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: tenantInvitationExpiryNotificationEmailTemplateTrackingId,
        recipient: "tenant-admin@example.com",
        text: expect.stringContaining("has expired"),
      }),
    );
    expect(persistedInvitations).toEqual([
      expect.objectContaining({
        invitationId,
        expiryNotificationQueuedAt: expect.any(String),
      }),
    ]);
    expect(persistedJobs.at(-1)).toMatchObject({
      jobId,
      status: workflowJobStatus.completed,
    });
  });

  it("revokes a newly persisted invitation when audit append fails during issuance", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_invitation_issue_audit_failure",
      correlationId: "corr_admin_tenant_invitation_issue_audit_failure",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-invitation-issue:org_1",
        reason: "Allowed to manage tenant invitations.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const resolveStoredConfigValue = vi.fn(() =>
      Effect.succeed({
        moduleId: platformModuleId.tenantManagement,
        key: tenantManagementConfigKey.membershipInviteExpiryHours,
        effectiveValue: 48,
        source: "default",
        entitled: true,
      }),
    );
    const createInvitation = vi.fn((input) => Effect.succeed(input));
    const appendAuditEvent = vi.fn((_input) =>
      Effect.fail({
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
        cause: new Error("Audit persistence unavailable."),
      } as const),
    );
    const committedInvitationIds: string[] = [];
    const persistIssuedInvitation = vi.fn((input) =>
      createInvitation(input.invitation).pipe(
        Effect.flatMap((invitation) =>
          appendAuditEvent(input.auditInput).pipe(Effect.as(invitation)),
        ),
        Effect.tap((invitation) =>
          Effect.sync(() => {
            committedInvitationIds.push(invitation.invitationId);
          }),
        ),
        Effect.asVoid,
      ),
    );
    const runtimeConfig = {
      resolveStoredConfigValue,
    } as unknown as RuntimeConfigModule["Type"];
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
        persistIssuedInvitation,
        runtimeConfig,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    await expect(
      Effect.runPromise(
        service.issueTenantInvitation({
          sessionId: "sess_admin_tenant_invitation_issue_audit_failure",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            organizationId: "org_1",
          },
          recipientEmail: "emergency-admin@example.com",
          relation: authorizationRelation.admin,
          issueReason: "Invite an emergency admin.",
        }),
      ),
    ).rejects.toThrow(/insertAuditEvent/);

    expect(createInvitation).toHaveBeenCalledTimes(1);
    expect(appendAuditEvent).toHaveBeenCalledTimes(1);
    expect(committedInvitationIds).toHaveLength(0);
    expect(persistIssuedInvitation).toHaveBeenCalledTimes(1);
  });

  it("lists tenant invitation records and projects pending, expired, and revoked states", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_invitations",
      correlationId: "corr_admin_tenant_invitations",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const now = Date.now();
    const pendingIssuedAt = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const pendingExpiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const revokedIssuedAt = new Date(now - 48 * 60 * 60 * 1000).toISOString();
    const revokedExpiresAt = new Date(now + 12 * 60 * 60 * 1000).toISOString();
    const revokedAt = new Date(now - 36 * 60 * 60 * 1000).toISOString();
    const expiredIssuedAt = new Date(now - 96 * 60 * 60 * 1000).toISOString();
    const expiredExpiresAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-invitation-read:org_1",
        reason: "Allowed to inspect tenant invitations.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const listInvitationsByTenant = vi.fn(() =>
      Effect.succeed([
        {
          invitationId: "invite_pending",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          tokenHash: "hash_pending",
          recipientEmail: "pending@example.com",
          relation: authorizationRelation.admin,
          status: "pending",
          issuedBy: "usr_platform_operator",
          issuedAt: pendingIssuedAt,
          expiresAt: pendingExpiresAt,
        },
        {
          invitationId: "invite_expired",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          tokenHash: "hash_expired",
          recipientEmail: "expired@example.com",
          relation: authorizationRelation.viewer,
          status: "pending",
          issuedBy: "usr_platform_operator",
          issuedAt: expiredIssuedAt,
          expiresAt: expiredExpiresAt,
        },
        {
          invitationId: "invite_revoked",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          tokenHash: "hash_revoked",
          recipientEmail: "revoked@example.com",
          relation: authorizationRelation.member,
          status: "revoked",
          issuedBy: "usr_platform_operator",
          issuedAt: revokedIssuedAt,
          expiresAt: revokedExpiresAt,
          revokedAt,
          revokedBy: "usr_platform_operator",
        },
      ]),
    );
    const appendAuditEvent = vi.fn(() =>
      Effect.succeed({
        eventId: "evt_tenant_invitations_inspected",
        timestamp: "2026-05-04T12:00:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.invitationsInspected,
        target: "organization:org_1:invitations",
        correlationId: requestContext.correlationId,
      }),
    );
    const invitationRepository = {
      listInvitationsByTenant,
    } as unknown as TenantInvitationPostgresRepository["Type"];
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
        invitationRepository,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.listTenantInvitations({
        sessionId: "sess_admin_tenant_invitations",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        inspectionReason: "  Review invitation inventory  ",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      invitations: [
        {
          invitationId: "invite_pending",
          recipientEmail: "pending@example.com",
          relation: authorizationRelation.admin,
          status: tenantInvitationStatus.pending,
          issuedBy: "usr_platform_operator",
          issuedAt: pendingIssuedAt,
          expiresAt: pendingExpiresAt,
        },
        {
          invitationId: "invite_revoked",
          recipientEmail: "revoked@example.com",
          relation: authorizationRelation.member,
          status: tenantInvitationStatus.revoked,
          issuedBy: "usr_platform_operator",
          issuedAt: revokedIssuedAt,
          expiresAt: revokedExpiresAt,
          revokedAt,
          revokedBy: "usr_platform_operator",
        },
        {
          invitationId: "invite_expired",
          recipientEmail: "expired@example.com",
          relation: authorizationRelation.viewer,
          status: tenantInvitationStatus.expired,
          issuedBy: "usr_platform_operator",
          issuedAt: expiredIssuedAt,
          expiresAt: expiredExpiresAt,
        },
      ],
    });
    expect(authorizationCheck).toHaveBeenCalledWith({
      requestContext,
      namespace: authorizationNamespace.tenant,
      object: "org_1",
      relation: authorizationRelation.viewer,
      permissionScope: permissionScope.tenantRead,
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
      action: tenantManagementAuditAction.invitationsInspected,
      target: "organization:org_1:invitations",
      reason: "Review invitation inventory",
    });
  });

  it("revokes pending tenant invitation records and records an audit event", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_invitation_revoke",
      correlationId: "corr_admin_tenant_invitation_revoke",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-invitation-revoke:org_1",
        reason: "Allowed to revoke tenant invitations.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationById = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_revoke_pending",
        recipientEmail: "owner+invite@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
      }),
    );
    const revokeInvitation = vi.fn((input) =>
      Effect.succeed({
        invitationId: input.invitationId,
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        tokenHash: "hash_revoke_pending",
        recipientEmail: "owner+invite@example.com",
        relation: authorizationRelation.admin,
        status: "revoked" as const,
        issuedBy: "usr_platform_operator",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        revokedAt: input.revokedAt,
        revokedBy: input.revokedBy,
      }),
    );
    const appendAuditEvent = vi.fn((_input) =>
      Effect.succeed({
        eventId: "evt_tenant_invitation_revoked",
        timestamp: "2026-05-02T14:00:00.000Z",
        actorId: requestContext.actorId,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        moduleId: platformModuleId.tenantManagement,
        action: tenantManagementAuditAction.invitationRevoked,
        target: "organization:org_1:invitations:invite_org_1_admin_1",
        correlationId: requestContext.correlationId,
        reason: "Invitation no longer required.",
      }),
    );
    const persistRevokedInvitation = vi.fn((input) =>
      revokeInvitation({
        tenantScope: input.invitation.tenantScope,
        tenantScopeId: input.invitation.tenantScopeId,
        invitationId: input.invitation.invitationId,
        revokedBy: input.revokedBy,
        revokedAt: input.revokedAt,
      }).pipe(
        Effect.flatMap((record) =>
          appendAuditEvent(input.auditInput).pipe(Effect.as(record)),
        ),
      ),
    );
    const invitationRepository = {
      getInvitationById,
      revokeInvitation,
    } as unknown as TenantInvitationPostgresRepository["Type"];
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
        invitationRepository,
        persistRevokedInvitation,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const revokedAtFloor = Date.now();

    const result = await Effect.runPromise(
      service.revokeTenantInvitation({
        sessionId: "sess_admin_tenant_invitation_revoke",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        invitationId: "invite_org_1_admin_1",
        revocationReason: "  Invitation no longer required.  ",
      }),
    );
    const revokedAtCeiling = Date.now();
    const revokeInput = revokeInvitation.mock.calls[0]?.[0];
    const persistedRevokedAt = Date.parse(revokeInput.revokedAt);

    expect(result).toEqual({
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
        expiresAt: pendingInvitationExpiresAt,
        revokedAt: revokeInput.revokedAt,
        revokedBy: "usr_platform_operator",
      },
    });
    expect(authorizationCheck).toHaveBeenCalledWith({
      requestContext,
      namespace: authorizationNamespace.tenant,
      object: "org_1",
      relation: authorizationRelation.admin,
      permissionScope: permissionScope.memberManage,
    });
    expect(revokeInvitation).toHaveBeenCalledWith({
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      invitationId: "invite_org_1_admin_1",
      revokedBy: "usr_platform_operator",
      revokedAt: revokeInput.revokedAt,
    });
    expect(persistedRevokedAt).toBeGreaterThanOrEqual(revokedAtFloor);
    expect(persistedRevokedAt).toBeLessThanOrEqual(revokedAtCeiling);
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
      action: tenantManagementAuditAction.invitationRevoked,
      target: "organization:org_1:invitations:invite_org_1_admin_1",
      reason: "Invitation no longer required.",
    });
  });

  it("does not revoke a pending invitation when transactional audit persistence fails", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_invitation_revoke_audit_failure",
      correlationId: "corr_admin_tenant_invitation_revoke_audit_failure",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-invitation-revoke-audit-failure:org_1",
        reason: "Allowed to revoke tenant invitations.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationById = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_2",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_revoke_pending_audit_failure",
        recipientEmail: "owner+invite@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
      }),
    );
    const revokeInvitation = vi.fn((input) =>
      Effect.succeed({
        invitationId: input.invitationId,
        tenantScope: input.tenantScope,
        tenantScopeId: input.tenantScopeId,
        tokenHash: "hash_revoke_pending_audit_failure",
        recipientEmail: "owner+invite@example.com",
        relation: authorizationRelation.admin,
        status: "revoked" as const,
        issuedBy: "usr_platform_operator",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        revokedAt: input.revokedAt,
        revokedBy: input.revokedBy,
      }),
    );
    const appendAuditEvent = vi.fn((_input) =>
      Effect.fail({
        _tag: "AuditLogPostgresRepositoryPersistenceError",
        operation: "insertAuditEvent",
        cause: new Error("Audit persistence unavailable."),
      } as const),
    );
    const committedRevocationIds: string[] = [];
    const persistRevokedInvitation = vi.fn((input) =>
      revokeInvitation({
        tenantScope: input.invitation.tenantScope,
        tenantScopeId: input.invitation.tenantScopeId,
        invitationId: input.invitation.invitationId,
        revokedBy: input.revokedBy,
        revokedAt: input.revokedAt,
      }).pipe(
        Effect.flatMap((record) =>
          appendAuditEvent(input.auditInput).pipe(Effect.as(record)),
        ),
        Effect.tap((record) =>
          Effect.sync(() => {
            committedRevocationIds.push(record.invitationId);
          }),
        ),
      ),
    );
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
        invitationRepository: {
          getInvitationById,
        } as unknown as TenantInvitationPostgresRepository["Type"],
        persistRevokedInvitation,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    await expect(
      Effect.runPromise(
        service.revokeTenantInvitation({
          sessionId: "sess_admin_tenant_invitation_revoke_audit_failure",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            organizationId: "org_1",
          },
          invitationId: "invite_org_1_admin_2",
          revocationReason: "Invitation no longer required.",
        }),
      ),
    ).rejects.toThrow(/insertAuditEvent/);

    expect(revokeInvitation).toHaveBeenCalledTimes(1);
    expect(appendAuditEvent).toHaveBeenCalledTimes(1);
    expect(committedRevocationIds).toHaveLength(0);
  });

  it("returns changed false and skips revoke writes or audit for expired invitation records", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_invitation_revoke_expired",
      correlationId: "corr_admin_tenant_invitation_revoke_expired",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-invitation-revoke-expired:org_1",
        reason: "Allowed to revoke tenant invitations.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationById = vi.fn(() =>
      Effect.succeed({
        invitationId: "invite_org_1_admin_expired",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        tokenHash: "hash_expired_noop",
        recipientEmail: "expired-admin@example.com",
        relation: authorizationRelation.admin,
        status: "pending",
        issuedBy: "usr_platform_operator",
        issuedAt: "2026-04-28T12:00:00.000Z",
        expiresAt: "2026-04-30T12:00:00.000Z",
      }),
    );
    const revokeInvitation = vi.fn(() => unexpectedEffect());
    const appendAuditEvent = vi.fn(() => unexpectedEffect());
    const persistRevokedInvitation = vi.fn(() => unexpectedEffect());
    const invitationRepository = {
      getInvitationById,
      revokeInvitation,
    } as unknown as TenantInvitationPostgresRepository["Type"];
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
        invitationRepository,
        persistRevokedInvitation,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.revokeTenantInvitation({
        sessionId: "sess_admin_tenant_invitation_revoke_expired",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        invitationId: "invite_org_1_admin_expired",
        revocationReason: "  Invitation expired already.  ",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      invitationId: "invite_org_1_admin_expired",
      changed: false,
      invitation: {
        invitationId: "invite_org_1_admin_expired",
        recipientEmail: "expired-admin@example.com",
        relation: authorizationRelation.admin,
        status: tenantInvitationStatus.expired,
        issuedBy: "usr_platform_operator",
        issuedAt: "2026-04-28T12:00:00.000Z",
        expiresAt: "2026-04-30T12:00:00.000Z",
      },
    });
    expect(revokeInvitation).not.toHaveBeenCalled();
    expect(persistRevokedInvitation).not.toHaveBeenCalled();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });

  it("returns the latest invitation state when a concurrent redemption wins before revoke persistence", async () => {
    const requestContext = {
      actorType: actorType.platformOperator,
      actorId: "usr_platform_operator",
      sessionId: "sess_admin_tenant_invitation_revoke_race",
      correlationId: "corr_admin_tenant_invitation_revoke_race",
      tenant: {
        scope: platformScope.platform,
        scopeId: platformScope.platform,
      },
    } as const;
    const authorizationCheck = vi.fn(() =>
      Effect.succeed({
        allowed: true,
        cacheKey: "tenant-invitation-revoke-race:org_1",
        reason: "Allowed to revoke tenant invitations.",
        auditRequired: false,
      }),
    );
    const resolveRequestContext = vi.fn(() => Effect.succeed(requestContext));
    const getInvitationById = vi
      .fn()
      .mockImplementationOnce(() =>
        Effect.succeed({
          invitationId: "invite_org_1_admin_race",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          tokenHash: "hash_revoke_race",
          recipientEmail: "owner+invite@example.com",
          relation: authorizationRelation.admin,
          status: "pending",
          issuedBy: "usr_platform_operator",
          issuedAt: "2026-05-02T12:00:00.000Z",
          expiresAt: pendingInvitationExpiresAt,
        }),
      )
      .mockImplementationOnce(() =>
        Effect.succeed({
          invitationId: "invite_org_1_admin_race",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          tokenHash: "hash_revoke_race",
          recipientEmail: "owner+invite@example.com",
          relation: authorizationRelation.admin,
          status: "redeemed",
          issuedBy: "usr_platform_operator",
          issuedAt: "2026-05-02T12:00:00.000Z",
          expiresAt: pendingInvitationExpiresAt,
          redeemedAt: "2026-05-02T12:30:00.000Z",
          redeemedBy: "usr_member_1",
        }),
      );
    const revokeInvitation = vi.fn(() => unexpectedEffect());
    const appendAuditEvent = vi.fn(() => unexpectedEffect());
    const persistRevokedInvitation = vi.fn((_input) =>
      Effect.succeed(undefined),
    );
    const invitationRepository = {
      getInvitationById,
      revokeInvitation,
    } as unknown as TenantInvitationPostgresRepository["Type"];
    const service = await Effect.runPromise(
      makeAdminTenantManagementService({
        authorization: {
          check: authorizationCheck,
        } as unknown as AuthorizationModuleService,
        invitationRepository,
        persistRevokedInvitation,
      }).pipe(
        Effect.provideService(AuditLogModule, {
          append: appendAuditEvent,
        } as unknown as AuditLogModule["Type"]),
        Effect.provideService(IdentitySessionModule, {
          resolveRequestContext,
        } as unknown as IdentitySessionModule["Type"]),
        Effect.provideService(TenantOnboardingPostgresRepository, {
          getOnboardingRunByTenant: () => unexpectedEffect(),
        } as unknown as TenantOnboardingPostgresRepository["Type"]),
        Effect.provideService(OryKetoAdapter, {
          listTuples: () => unexpectedEffect(),
          writeTuple: () => unexpectedEffect(),
          deleteTuple: () => unexpectedEffect(),
        } as unknown as OryKetoAdapter["Type"]),
      ),
    );

    const result = await Effect.runPromise(
      service.revokeTenantInvitation({
        sessionId: "sess_admin_tenant_invitation_revoke_race",
        tenant: {
          scope: platformScope.organization,
          scopeId: "org_1",
          organizationId: "org_1",
        },
        invitationId: "invite_org_1_admin_race",
        revocationReason: "Invitation no longer required.",
      }),
    );

    expect(result).toEqual({
      tenant: {
        scope: platformScope.organization,
        scopeId: "org_1",
        organizationId: "org_1",
      },
      invitationId: "invite_org_1_admin_race",
      changed: false,
      invitation: {
        invitationId: "invite_org_1_admin_race",
        recipientEmail: "owner+invite@example.com",
        relation: authorizationRelation.admin,
        status: tenantInvitationStatus.redeemed,
        issuedBy: "usr_platform_operator",
        issuedAt: "2026-05-02T12:00:00.000Z",
        expiresAt: pendingInvitationExpiresAt,
        redeemedAt: "2026-05-02T12:30:00.000Z",
        redeemedBy: "usr_member_1",
      },
    });
    expect(persistRevokedInvitation).toHaveBeenCalledTimes(1);
    expect(revokeInvitation).not.toHaveBeenCalled();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });
});
