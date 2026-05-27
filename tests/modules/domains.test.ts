import { Effect, Schema } from "effect";
import {
  billingAndMeteringFeatureFlag,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
  tenantBrandingRuntimeValueKey,
} from "@comvestec/config";
import {
  actorType,
  billingEnforcementMode,
  billingMeteringMode,
  emailDeliveryBounceType,
  emailDeliveryProviderEventType,
  emailDeliveryStatus,
  emailSuppressionReason,
  billingPaymentEventStatus,
  billingPlanInterval,
  billingSubscriptionStatus,
  billingWebhookReceiptProcessingState,
  billingWebhookEventType,
  billingWebhookReconciliationAction,
  customDomainLifecycleState,
  identityBrandingHandoffMode,
  permissionScope,
  platformModuleId,
  platformScope,
  searchDocumentFamily,
  searchIndexLifecycleState,
  supportOperationsCasePriority,
  supportOperationsCaseStatus,
  SearchTenantIndexEnsureWorkflowPayloadSchema,
  workflowJobKind,
  workflowJobStatus,
  workflowJobTrigger,
  type SearchTenantIndexRecord,
  tenantManagementFeatureFlag,
  telemetryKind,
  usageQuotaPeriod,
} from "@comvestec/contracts";
import {
  buildSearchTenantIndexEnsureWorkflowJobId,
  buildWorkflowJobSummary,
  createWorkflowJobRecordSchema,
  emailDeliveryTrackingTable,
  emailRecipientSuppressionsTable,
  EmailDeliveryPostgresRepository,
  NotificationCenterPostgresRepository,
  type EmailDeliveryPostgresQueryable,
  createProvisioningTenantContext,
  makeEmailDeliveryModule,
  makeEmailDeliveryPostgresRepository,
  makeBillingMeteringModule,
  makeNotificationCenterModule,
  makeObservabilityModule,
  makeSearchModule,
  SearchTenantIndexPostgresRepository,
  makeTenantBrandingModule,
  makeTenantManagementModule,
} from "@comvestec/modules";
import {
  MeilisearchAdapter,
  NovuAdapter,
  PostalAdapter,
  platformAdapterServiceName,
} from "@comvestec/platform";
import { organizationRequestContext } from "./_fixtures";

const createEmailDeliveryRepository = (input?: {
  readonly suppressions?: ReadonlyArray<{
    readonly suppressionId: string;
    readonly recipient: string;
    readonly reason:
      | typeof emailSuppressionReason.bounced
      | typeof emailSuppressionReason.complained;
    readonly sourceMessageId: string;
    readonly bounceType?:
      | typeof emailDeliveryBounceType.hard
      | typeof emailDeliveryBounceType.soft;
    readonly suppressedAt: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }>;
}) => {
  const trackedDeliveries = new Map<string, Record<string, unknown>>();
  const suppressions = new Map<string, Record<string, unknown>>(
    (input?.suppressions ?? []).map((suppression) => [
      suppression.recipient.toLowerCase(),
      suppression,
    ]),
  );

  return {
    trackedDeliveries,
    suppressions,
    service: {
      createTrackedDelivery: (record) => {
        trackedDeliveries.set(record.messageId, record);

        return Effect.succeed(record);
      },
      updateTrackedDelivery: ({ currentRecord, nextRecord }) => {
        const existing = trackedDeliveries.get(nextRecord.messageId) as
          | { readonly updatedAt?: string }
          | undefined;

        if (existing === undefined) {
          return Effect.succeed(undefined);
        }

        if (existing.updatedAt !== currentRecord.updatedAt) {
          return Effect.succeed(existing as never);
        }

        trackedDeliveries.set(nextRecord.messageId, nextRecord);

        return Effect.succeed(nextRecord);
      },
      findTrackedDelivery: ({ messageId }) =>
        Effect.succeed(trackedDeliveries.get(messageId) as never),
      findRecipientSuppression: ({ recipient }) =>
        Effect.succeed(suppressions.get(recipient.toLowerCase()) as never),
      upsertRecipientSuppression: ({ currentRecord, nextRecord }) => {
        const normalizedRecipient = nextRecord.recipient.toLowerCase();
        const existing = suppressions.get(normalizedRecipient) as
          | { readonly updatedAt?: string }
          | undefined;

        if (
          existing !== undefined &&
          existing.updatedAt !== currentRecord?.updatedAt
        ) {
          return Effect.succeed(existing as never);
        }

        suppressions.set(normalizedRecipient, nextRecord);

        return Effect.succeed(nextRecord);
      },
    } satisfies EmailDeliveryPostgresRepository["Type"],
  };
};

type PersistedTrackingRow = typeof emailDeliveryTrackingTable.$inferSelect;
type PersistedSuppressionRow =
  typeof emailRecipientSuppressionsTable.$inferSelect;

const createNormalizedEmailDeliveryRepository = async () => {
  const trackedDeliveries = new Map<string, PersistedTrackingRow>();
  const suppressions = new Map<string, PersistedSuppressionRow>();
  const queryable: EmailDeliveryPostgresQueryable = {
    createTrackedDelivery: async (record) => {
      const persisted: PersistedTrackingRow = {
        messageId: record.messageId,
        provider: record.provider,
        tenantScope: record.tenantScope,
        tenantScopeId: record.tenantScopeId,
        recipient: record.recipient,
        status: record.status ?? emailDeliveryStatus.queued,
        template: record.template ?? null,
        senderDisplayName: record.senderDisplayName,
        fromEmail: record.fromEmail,
        replyToEmail: record.replyToEmail,
        sentAt: record.sentAt,
        lastEventAt: record.lastEventAt ?? null,
        bounceType: record.bounceType ?? null,
        createdAt: record.createdAt ?? new Date(),
        updatedAt: record.updatedAt ?? new Date(),
      };

      trackedDeliveries.set(record.messageId, persisted);

      return persisted;
    },
    updateTrackedDelivery: async ({ currentRecord, nextRecord }) => {
      const existing = trackedDeliveries.get(nextRecord.messageId);
      const currentUpdatedAt =
        currentRecord.updatedAt instanceof Date
          ? currentRecord.updatedAt.toISOString()
          : undefined;

      if (existing === undefined) {
        return undefined;
      }

      if (existing.updatedAt.toISOString() !== currentUpdatedAt) {
        return existing;
      }

      const persisted: PersistedTrackingRow = {
        messageId: nextRecord.messageId,
        provider: nextRecord.provider,
        tenantScope: nextRecord.tenantScope,
        tenantScopeId: nextRecord.tenantScopeId,
        recipient: nextRecord.recipient,
        status: nextRecord.status ?? existing.status,
        template: nextRecord.template ?? null,
        senderDisplayName: nextRecord.senderDisplayName,
        fromEmail: nextRecord.fromEmail,
        replyToEmail: nextRecord.replyToEmail,
        sentAt: nextRecord.sentAt,
        lastEventAt: nextRecord.lastEventAt ?? null,
        bounceType: nextRecord.bounceType ?? null,
        createdAt: nextRecord.createdAt ?? existing.createdAt,
        updatedAt: nextRecord.updatedAt ?? new Date(),
      };

      trackedDeliveries.set(nextRecord.messageId, persisted);

      return persisted;
    },
    findTrackedDelivery: async ({ messageId }) =>
      trackedDeliveries.get(messageId),
    findRecipientSuppression: async (recipient) => suppressions.get(recipient),
    upsertRecipientSuppression: async ({ currentRecord, nextRecord }) => {
      const existing = suppressions.get(nextRecord.recipient);
      const currentUpdatedAt =
        currentRecord?.updatedAt instanceof Date
          ? currentRecord.updatedAt.toISOString()
          : undefined;

      if (
        existing !== undefined &&
        existing.updatedAt.toISOString() !== currentUpdatedAt
      ) {
        return existing;
      }

      const persisted: PersistedSuppressionRow = {
        suppressionId: nextRecord.suppressionId,
        recipient: nextRecord.recipient,
        reason: nextRecord.reason,
        sourceMessageId: nextRecord.sourceMessageId,
        bounceType: nextRecord.bounceType ?? null,
        suppressedAt: nextRecord.suppressedAt ?? new Date(),
        createdAt: nextRecord.createdAt ?? existing?.createdAt ?? new Date(),
        updatedAt: nextRecord.updatedAt ?? new Date(),
      };

      suppressions.set(nextRecord.recipient, persisted);

      return persisted;
    },
  };

  return {
    suppressions,
    service: await Effect.runPromise(
      makeEmailDeliveryPostgresRepository(queryable),
    ),
  };
};

describe("modules domains", () => {
  it("builds reusable workflow job records without assuming a billing payload shape", async () => {
    const SearchWorkflowJobRecordSchema = createWorkflowJobRecordSchema(
      SearchTenantIndexEnsureWorkflowPayloadSchema,
    );

    const record = await Effect.runPromise(
      Schema.decodeUnknown(SearchWorkflowJobRecordSchema)({
        jobId: buildSearchTenantIndexEnsureWorkflowJobId({
          trigger: workflowJobTrigger.operatorRequested,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          key: "corr_search_1",
        }),
        runtime: platformAdapterServiceName.convex,
        sourceModuleId: platformModuleId.search,
        kind: workflowJobKind.searchIndexEnsure,
        trigger: workflowJobTrigger.operatorRequested,
        status: workflowJobStatus.scheduled,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        attempts: 0,
        scheduledAt: "2026-05-02T09:00:00.000Z",
        payload: {
          sourceModuleId: platformModuleId.search,
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          requestContext: organizationRequestContext,
          actorId: "usr_search_operator_1",
          correlationId: "corr_search_1",
          settings: {
            filterableAttributes: ["status", "moduleId"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title", "content"],
            rankingRules: ["words", "typo", "sort"],
          },
        },
        createdAt: "2026-05-02T09:00:00.000Z",
        updatedAt: "2026-05-02T09:00:00.000Z",
      }),
    );

    await expect(
      Effect.runPromise(buildWorkflowJobSummary({ record })),
    ).resolves.toEqual({
      jobId: buildSearchTenantIndexEnsureWorkflowJobId({
        trigger: workflowJobTrigger.operatorRequested,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        key: "corr_search_1",
      }),
      sourceModuleId: platformModuleId.search,
      kind: workflowJobKind.searchIndexEnsure,
      trigger: workflowJobTrigger.operatorRequested,
      status: workflowJobStatus.scheduled,
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      attempts: 0,
      scheduledAt: "2026-05-02T09:00:00.000Z",
    });
  });

  it("resolves tenant branding and builds branded identity handoff", async () => {
    const tenantBranding = await Effect.runPromise(makeTenantBrandingModule());

    const branding = await Effect.runPromise(
      tenantBranding.resolveBranding({
        requestContext: {
          ...organizationRequestContext,
          host: "acme.example.com",
        },
        entitled: true,
        values: {
          [tenantBrandingConfigKey.companyName]: "Acme",
          [tenantBrandingConfigKey.themePrimary]: "#111827",
          [tenantBrandingConfigKey.themeSecondary]: "#374151",
          [tenantBrandingConfigKey.themeAccent]: "#10B981",
          [tenantBrandingRuntimeValueKey.customDomainStatus]:
            customDomainLifecycleState.active,
        },
      }),
    );
    const handoff = await Effect.runPromise(
      tenantBranding.buildIdentityHandoff({
        requestContext: {
          ...organizationRequestContext,
          host: "acme.example.com",
        },
        loginBaseUrl: "https://identity.example.com/login",
        branding: branding.publicProjection,
      }),
    );

    expect(branding.publicProjection.companyName).toBe("Acme");
    expect(branding.adminProjection.themeTokens.primary).toBe("#111827");
    expect(handoff.mode).toBe(identityBrandingHandoffMode.brandedRedirect);
    expect(handoff.loginUrl).toContain("tenant_hint=org_1");
  });

  it("keeps materialized branding values visible when entitlement metadata is false", async () => {
    const tenantBranding = await Effect.runPromise(makeTenantBrandingModule());

    const branding = await Effect.runPromise(
      tenantBranding.resolveBranding({
        requestContext: organizationRequestContext,
        entitled: false,
        values: {
          [tenantBrandingConfigKey.companyName]: "Acme",
          [tenantBrandingConfigKey.themePrimary]: "#111827",
        },
      }),
    );

    expect(branding.publicProjection.companyName).toBe("Acme");
    expect(branding.publicProjection.themeTokens.primary).toBe("#111827");
    expect(branding.publicProjection.entitled).toBe(false);
    expect(branding.adminProjection.companyName).toBe("Acme");
    expect(branding.adminProjection.entitled).toBe(false);
  });

  it("requests tenant custom-domain verification through the tenant-branding module", async () => {
    const seen: Array<{
      readonly scopeId: string;
      readonly requestedHost: string;
      readonly lifecycleState: string;
    }> = [];
    const tenantBranding = await Effect.runPromise(
      makeTenantBrandingModule({
        domainVerificationRepository: {
          createCustomDomainVerification: (input) => {
            seen.push({
              scopeId: input.scopeId,
              requestedHost: input.requestedHost,
              lifecycleState: input.lifecycleState,
            });

            return Effect.succeed(input);
          },
          updateCustomDomainVerification: (input) => Effect.succeed(input),
          findCustomDomainVerification: () => Effect.succeed(undefined),
          findCurrentCustomDomainVerification: () => Effect.succeed(undefined),
        },
      }),
    );

    const verification = await Effect.runPromise(
      tenantBranding.requestCustomDomainVerification({
        scope: platformScope.organization,
        scopeId: "org_1",
        requestedHost: "Brand.Acme.Example",
      }),
    );

    expect(verification.verificationId).toMatch(
      /^tenant-branding:custom-domain:organization:org_1:/,
    );
    expect(verification).toMatchObject({
      scope: platformScope.organization,
      scopeId: "org_1",
      requestedHost: "brand.acme.example",
      lifecycleState: customDomainLifecycleState.unverified,
    });
    expect(seen).toEqual([
      {
        scopeId: "org_1",
        requestedHost: "brand.acme.example",
        lifecycleState: customDomainLifecycleState.unverified,
      },
    ]);
  });

  it("normalizes custom-domain lookup hosts through the tenant-branding module", async () => {
    const seenRequestedHosts: string[] = [];
    const tenantBranding = await Effect.runPromise(
      makeTenantBrandingModule({
        domainVerificationRepository: {
          createCustomDomainVerification: () =>
            Effect.die(new Error("Unexpected custom-domain create call.")),
          updateCustomDomainVerification: () =>
            Effect.die(new Error("Unexpected custom-domain update call.")),
          findCustomDomainVerification: (input) => {
            seenRequestedHosts.push(input.requestedHost);

            return Effect.succeed(undefined);
          },
          findCurrentCustomDomainVerification: () =>
            Effect.die(
              new Error("Unexpected current custom-domain lookup call."),
            ),
        },
      }),
    );

    const verification = await Effect.runPromise(
      tenantBranding.findCustomDomainVerification({
        scope: platformScope.organization,
        scopeId: "org_1",
        requestedHost: "Brand.Acme.Example",
      }),
    );

    expect(verification).toBeUndefined();
    expect(seenRequestedHosts).toEqual(["brand.acme.example"]);
  });

  it("finds the current non-retired custom-domain verification through the tenant-branding module", async () => {
    const seenScopeIds: string[] = [];
    const tenantBranding = await Effect.runPromise(
      makeTenantBrandingModule({
        domainVerificationRepository: {
          createCustomDomainVerification: () =>
            Effect.die(new Error("Unexpected custom-domain create call.")),
          updateCustomDomainVerification: () =>
            Effect.die(new Error("Unexpected custom-domain update call.")),
          findCustomDomainVerification: () =>
            Effect.die(
              new Error("Unexpected host-specific custom-domain lookup call."),
            ),
          findCurrentCustomDomainVerification: (input) => {
            seenScopeIds.push(input.scopeId);

            return Effect.succeed({
              verificationId:
                "tenant-branding:custom-domain:organization:org_1:verification_current",
              scope: platformScope.organization,
              scopeId: input.scopeId,
              requestedHost: "brand.acme.example",
              lifecycleState: customDomainLifecycleState.verifying,
              changedAt: "2026-05-04T10:03:00.000Z",
            });
          },
        },
      }),
    );

    const verification = await Effect.runPromise(
      tenantBranding.findCurrentCustomDomainVerification({
        scope: platformScope.organization,
        scopeId: "org_1",
      }),
    );

    expect(verification).toMatchObject({
      verificationId:
        "tenant-branding:custom-domain:organization:org_1:verification_current",
      requestedHost: "brand.acme.example",
      lifecycleState: customDomainLifecycleState.verifying,
    });
    expect(seenScopeIds).toEqual(["org_1"]);
  });

  it("uses branded sender metadata only when branded emails are enabled", async () => {
    const tenantBranding = await Effect.runPromise(makeTenantBrandingModule());
    const emailDeliveryRepository = createEmailDeliveryRepository();
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-04-27T10:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const emailDelivery = await Effect.runPromise(
      makeEmailDeliveryModule().pipe(
        Effect.provideService(PostalAdapter, {
          serviceName: platformAdapterServiceName.postal,
          apiUrl: "http://localhost:5000",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.postal,
          } as const),
          sendEmail,
        }),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          emailDeliveryRepository.service,
        ),
      ),
    );
    const brandedBranding = await Effect.runPromise(
      tenantBranding.resolveBranding({
        requestContext: organizationRequestContext,
        entitled: true,
        values: {
          [tenantBrandingConfigKey.companyName]: "Acme",
          [tenantBrandingConfigKey.supportEmail]: "support@acme.example",
          [tenantBrandingConfigKey.replyToEmail]: "reply@acme.example",
        },
      }),
    );

    await Effect.runPromise(
      emailDelivery.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        branding: brandedBranding,
        brandedEmailsEnabled: true,
      }),
    );

    await Effect.runPromise(
      emailDelivery.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        branding: brandedBranding,
        brandedEmailsEnabled: false,
      }),
    );

    expect(sendEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fromName: "Acme",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
      }),
    );
    expect(sendEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fromName: "Comvestec Platform",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@platform.example",
      }),
    );

    const fallbackBranding = await Effect.runPromise(
      tenantBranding.resolveBranding({
        requestContext: organizationRequestContext,
        entitled: true,
        values: {
          [tenantBrandingConfigKey.replyToEmail]: "reply@acme.example",
        },
      }),
    );

    await Effect.runPromise(
      emailDelivery.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        branding: fallbackBranding,
        brandedEmailsEnabled: true,
      }),
    );

    expect(sendEmail).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        messageId: expect.stringMatching(/^email-delivery:organization:org_1:/),
        fromName: "Comvestec Platform",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
      }),
    );
  });

  it("suppresses future sends after a bounced provider event", async () => {
    const tenantBranding = await Effect.runPromise(makeTenantBrandingModule());
    const emailDeliveryRepository = createEmailDeliveryRepository();
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-05-04T10:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const emailDelivery = await Effect.runPromise(
      makeEmailDeliveryModule().pipe(
        Effect.provideService(PostalAdapter, {
          serviceName: platformAdapterServiceName.postal,
          apiUrl: "http://localhost:5000",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.postal,
          } as const),
          sendEmail,
        }),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          emailDeliveryRepository.service,
        ),
      ),
    );
    const branding = await Effect.runPromise(
      tenantBranding.resolveBranding({
        requestContext: organizationRequestContext,
        entitled: true,
        values: {
          [tenantBrandingConfigKey.companyName]: "Acme",
          [tenantBrandingConfigKey.replyToEmail]: "reply@acme.example",
        },
      }),
    );

    const receipt = await Effect.runPromise(
      emailDelivery.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        template: "billing.invoice-ready",
        subject: "Welcome",
        html: "<p>Hello</p>",
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        branding,
        brandedEmailsEnabled: true,
      }),
    );

    const updatedDelivery = await Effect.runPromise(
      emailDelivery.recordProviderDeliveryEvent({
        messageId: receipt.messageId,
        eventType: emailDeliveryProviderEventType.bounced,
        bounceType: emailDeliveryBounceType.hard,
        occurredAt: "2026-05-04T10:05:00.000Z",
      }),
    );

    expect(updatedDelivery).toMatchObject({
      status: "bounced",
      bounceType: emailDeliveryBounceType.hard,
    });
    expect(
      emailDeliveryRepository.suppressions.get("customer@example.com"),
    ).toMatchObject({
      reason: emailSuppressionReason.bounced,
    });

    const suppressedResult = await Effect.runPromise(
      Effect.either(
        emailDelivery.sendTransactionalEmail({
          requestContext: organizationRequestContext,
          recipient: "customer@example.com",
          subject: "Welcome back",
          html: "<p>Hello again</p>",
          platformSender: {
            displayName: "Comvestec Platform",
            fromEmail: "support@platform.example",
            replyToEmail: "reply@platform.example",
          },
          branding,
          brandedEmailsEnabled: true,
        }),
      ),
    );

    expect(suppressedResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "EmailRecipientSuppressedError",
        recipient: "customer@example.com",
      },
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("ignores lower-priority delivery events after a bounce and upgrades suppressions on complaints", async () => {
    const tenantBranding = await Effect.runPromise(makeTenantBrandingModule());
    const emailDeliveryRepository = createEmailDeliveryRepository();
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-05-04T10:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const emailDelivery = await Effect.runPromise(
      makeEmailDeliveryModule().pipe(
        Effect.provideService(PostalAdapter, {
          serviceName: platformAdapterServiceName.postal,
          apiUrl: "http://localhost:5000",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.postal,
          } as const),
          sendEmail,
        }),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          emailDeliveryRepository.service,
        ),
      ),
    );
    const branding = await Effect.runPromise(
      tenantBranding.resolveBranding({
        requestContext: organizationRequestContext,
        entitled: true,
        values: {
          [tenantBrandingConfigKey.companyName]: "Acme",
          [tenantBrandingConfigKey.replyToEmail]: "reply@acme.example",
        },
      }),
    );

    const receipt = await Effect.runPromise(
      emailDelivery.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        template: "billing.invoice-ready",
        subject: "Welcome",
        html: "<p>Hello</p>",
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        branding,
        brandedEmailsEnabled: true,
      }),
    );

    const bouncedDelivery = await Effect.runPromise(
      emailDelivery.recordProviderDeliveryEvent({
        messageId: receipt.messageId,
        eventType: emailDeliveryProviderEventType.bounced,
        bounceType: emailDeliveryBounceType.hard,
        occurredAt: "2026-05-04T10:05:00.000Z",
      }),
    );

    expect(bouncedDelivery).toMatchObject({
      status: emailDeliveryStatus.bounced,
      bounceType: emailDeliveryBounceType.hard,
      lastEventAt: "2026-05-04T10:05:00.000Z",
    });

    const ignoredDelivered = await Effect.runPromise(
      emailDelivery.recordProviderDeliveryEvent({
        messageId: receipt.messageId,
        eventType: emailDeliveryProviderEventType.delivered,
        occurredAt: "2026-05-04T10:06:00.000Z",
      }),
    );

    expect(ignoredDelivered).toMatchObject({
      status: emailDeliveryStatus.bounced,
      bounceType: emailDeliveryBounceType.hard,
      lastEventAt: "2026-05-04T10:05:00.000Z",
    });

    const complainedDelivery = await Effect.runPromise(
      emailDelivery.recordProviderDeliveryEvent({
        messageId: receipt.messageId,
        eventType: emailDeliveryProviderEventType.complained,
        occurredAt: "2026-05-04T10:07:00.000Z",
      }),
    );

    expect(complainedDelivery).toMatchObject({
      status: emailDeliveryStatus.complained,
      lastEventAt: "2026-05-04T10:07:00.000Z",
    });
    expect(complainedDelivery.bounceType).toBeUndefined();
    expect(
      emailDeliveryRepository.suppressions.get("customer@example.com"),
    ).toMatchObject({
      reason: emailSuppressionReason.complained,
      sourceMessageId: receipt.messageId,
    });
    expect(
      emailDeliveryRepository.suppressions.get("customer@example.com")
        ?.bounceType,
    ).toBeUndefined();
  });

  it("accepts the first provider event despite clock skew and ignores older offset-formatted retries", async () => {
    const tenantBranding = await Effect.runPromise(makeTenantBrandingModule());
    const emailDeliveryRepository = createEmailDeliveryRepository();
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-05-04T10:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const emailDelivery = await Effect.runPromise(
      makeEmailDeliveryModule().pipe(
        Effect.provideService(PostalAdapter, {
          serviceName: platformAdapterServiceName.postal,
          apiUrl: "http://localhost:5000",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.postal,
          } as const),
          sendEmail,
        }),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          emailDeliveryRepository.service,
        ),
      ),
    );
    const branding = await Effect.runPromise(
      tenantBranding.resolveBranding({
        requestContext: organizationRequestContext,
        entitled: true,
        values: {
          [tenantBrandingConfigKey.companyName]: "Acme",
          [tenantBrandingConfigKey.replyToEmail]: "reply@acme.example",
        },
      }),
    );

    const receipt = await Effect.runPromise(
      emailDelivery.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        branding,
        brandedEmailsEnabled: true,
      }),
    );

    const firstProviderEvent = await Effect.runPromise(
      emailDelivery.recordProviderDeliveryEvent({
        messageId: receipt.messageId,
        eventType: emailDeliveryProviderEventType.bounced,
        bounceType: emailDeliveryBounceType.hard,
        occurredAt: "2026-05-04T09:59:00.000Z",
      }),
    );

    expect(firstProviderEvent).toMatchObject({
      status: emailDeliveryStatus.bounced,
      bounceType: emailDeliveryBounceType.hard,
      lastEventAt: "2026-05-04T09:59:00.000Z",
    });

    const olderRetryEvent = await Effect.runPromise(
      emailDelivery.recordProviderDeliveryEvent({
        messageId: receipt.messageId,
        eventType: emailDeliveryProviderEventType.bounced,
        bounceType: emailDeliveryBounceType.soft,
        occurredAt: "2026-05-04T12:58:00.000+03:00",
      }),
    );

    expect(olderRetryEvent).toMatchObject({
      status: emailDeliveryStatus.bounced,
      bounceType: emailDeliveryBounceType.hard,
      lastEventAt: "2026-05-04T09:59:00.000Z",
    });
  });

  it("accepts offset-formatted complaint events through the repository round trip", async () => {
    const tenantBranding = await Effect.runPromise(makeTenantBrandingModule());
    const emailDeliveryRepository =
      await createNormalizedEmailDeliveryRepository();
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-05-04T10:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const emailDelivery = await Effect.runPromise(
      makeEmailDeliveryModule().pipe(
        Effect.provideService(PostalAdapter, {
          serviceName: platformAdapterServiceName.postal,
          apiUrl: "http://localhost:5000",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.postal,
          } as const),
          sendEmail,
        }),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          emailDeliveryRepository.service,
        ),
      ),
    );
    const branding = await Effect.runPromise(
      tenantBranding.resolveBranding({
        requestContext: organizationRequestContext,
        entitled: true,
        values: {
          [tenantBrandingConfigKey.companyName]: "Acme",
          [tenantBrandingConfigKey.replyToEmail]: "reply@acme.example",
        },
      }),
    );

    const receipt = await Effect.runPromise(
      emailDelivery.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        branding,
        brandedEmailsEnabled: true,
      }),
    );

    const complainedDelivery = await Effect.runPromise(
      emailDelivery.recordProviderDeliveryEvent({
        messageId: receipt.messageId,
        eventType: emailDeliveryProviderEventType.complained,
        occurredAt: "2026-05-04T12:58:00.000+03:00",
      }),
    );

    expect(complainedDelivery).toMatchObject({
      status: emailDeliveryStatus.complained,
      lastEventAt: "2026-05-04T09:58:00.000Z",
    });
    expect(
      emailDeliveryRepository.suppressions.get("customer@example.com")?.reason,
    ).toBe(emailSuppressionReason.complained);
    expect(
      emailDeliveryRepository.suppressions
        .get("customer@example.com")
        ?.suppressedAt.toISOString(),
    ).toBe("2026-05-04T09:58:00.000Z");
    expect(
      emailDeliveryRepository.suppressions
        .get("customer@example.com")
        ?.updatedAt.toISOString(),
    ).toBe("2026-05-04T09:58:00.000Z");
  });

  it("keeps the newer recipient suppression when different message events race for the same recipient", async () => {
    const tenantBranding = await Effect.runPromise(makeTenantBrandingModule());
    const emailDeliveryRepository = createEmailDeliveryRepository();
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-05-04T10:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const emailDelivery = await Effect.runPromise(
      makeEmailDeliveryModule().pipe(
        Effect.provideService(PostalAdapter, {
          serviceName: platformAdapterServiceName.postal,
          apiUrl: "http://localhost:5000",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.postal,
          } as const),
          sendEmail,
        }),
        Effect.provideService(
          EmailDeliveryPostgresRepository,
          emailDeliveryRepository.service,
        ),
      ),
    );
    const branding = await Effect.runPromise(
      tenantBranding.resolveBranding({
        requestContext: organizationRequestContext,
        entitled: true,
        values: {
          [tenantBrandingConfigKey.companyName]: "Acme",
          [tenantBrandingConfigKey.replyToEmail]: "reply@acme.example",
        },
      }),
    );

    const firstReceipt = await Effect.runPromise(
      emailDelivery.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "First",
        html: "<p>Hello</p>",
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        branding,
        brandedEmailsEnabled: true,
      }),
    );
    const secondReceipt = await Effect.runPromise(
      emailDelivery.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "Second",
        html: "<p>Hello again</p>",
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        branding,
        brandedEmailsEnabled: true,
      }),
    );

    await Effect.runPromise(
      emailDelivery.recordProviderDeliveryEvent({
        messageId: secondReceipt.messageId,
        eventType: emailDeliveryProviderEventType.complained,
        occurredAt: "2026-05-04T10:07:00.000Z",
      }),
    );
    await Effect.runPromise(
      emailDelivery.recordProviderDeliveryEvent({
        messageId: firstReceipt.messageId,
        eventType: emailDeliveryProviderEventType.bounced,
        bounceType: emailDeliveryBounceType.hard,
        occurredAt: "2026-05-04T10:05:00.000Z",
      }),
    );

    expect(
      emailDeliveryRepository.suppressions.get("customer@example.com"),
    ).toMatchObject({
      reason: emailSuppressionReason.complained,
      sourceMessageId: secondReceipt.messageId,
      suppressedAt: "2026-05-04T10:07:00.000Z",
    });
    expect(
      emailDeliveryRepository.suppressions.get("customer@example.com")
        ?.bounceType,
    ).toBeUndefined();
  });

  it("queues email notifications through the Novu boundary", async () => {
    const triggerNotification = vi.fn((input) =>
      Effect.succeed({
        id: "novu_notification_1",
        channel: input.channel,
        status: "queued" as const,
        recipient: input.recipient,
        template: input.template,
        createdAt: "2026-04-27T10:05:00.000Z",
        provider: platformAdapterServiceName.novu,
      }),
    );
    const notificationCenter = await Effect.runPromise(
      makeNotificationCenterModule().pipe(
        Effect.provideService(NovuAdapter, {
          serviceName: platformAdapterServiceName.novu,
          apiUrl: "http://localhost:3000",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.novu,
          } as const),
          triggerNotification,
          triggerEvent: () =>
            Effect.die(
              new Error("Unexpected notification-center triggerEvent call."),
            ),
          getNotification: () =>
            Effect.die(
              new Error("Unexpected notification-center getNotification call."),
            ),
          listMessages: () =>
            Effect.die(
              new Error("Unexpected notification-center listMessages call."),
            ),
        }),
        Effect.provideService(NotificationCenterPostgresRepository, {
          createEmailReceipt: (record) => Effect.succeed(record),
          findDigestRun: () => Effect.succeed(undefined),
          findEmailReceipt: () => Effect.succeed(undefined),
          findEmailPreference: () => Effect.succeed(undefined),
          listDigestCandidatesByDigestRun: () => Effect.succeed([]),
          upsertDigestCandidate: (record) => Effect.succeed(record),
          upsertDigestRun: (record) => Effect.succeed(record),
          upsertEmailPreference: (record) => Effect.succeed(record),
        }),
      ),
    );

    await expect(
      Effect.runPromise(
        notificationCenter.queueEmailNotification({
          recipient: "customer@example.com",
          template: "billing.invoice-ready",
          subject: "Your invoice is ready",
        }),
      ),
    ).resolves.toMatchObject({
      id: "novu_notification_1",
      channel: "email",
      template: "billing.invoice-ready",
      provider: platformAdapterServiceName.novu,
    });
    expect(triggerNotification).toHaveBeenCalledWith({
      channel: "email",
      recipient: "customer@example.com",
      template: "billing.invoice-ready",
      subject: "Your invoice is ready",
    });
  });

  it("builds tenant-scoped search index names and delegates lifecycle calls", async () => {
    const persistedRecords = new Map<string, SearchTenantIndexRecord>();
    const ensureTenantIndex = vi.fn((input) =>
      Effect.succeed({
        indexName: input.indexName,
        scope: input.scope,
        scopeId: input.scopeId,
        documentCount: 0,
        lifecycleState: searchIndexLifecycleState.ready,
      }),
    );
    const getTenantIndex = vi.fn((input) =>
      Effect.succeed({
        indexName: input.indexName,
        scope: input.scope,
        scopeId: input.scopeId,
        documentCount: 12,
        lifecycleState: searchIndexLifecycleState.ready,
      }),
    );
    const replaceTenantDocuments = vi.fn((input) =>
      Effect.succeed({
        indexName: input.indexName,
        scope: input.scope,
        scopeId: input.scopeId,
        documentCount: input.documents.length,
        lifecycleState: searchIndexLifecycleState.ready,
        lastSyncedAt: "2026-04-27T13:30:00.000Z",
      }),
    );
    const queryManagedFiles = vi.fn((input) =>
      Effect.succeed({
        query: input.query,
        hits: [
          {
            fileId: "file_1",
            fileName: "invoice.pdf",
            contentType: "application/pdf",
            sizeBytes: 1024,
          },
        ],
        estimatedTotalHits: 1,
      }),
    );
    const querySupportCases = vi.fn((input) =>
      Effect.succeed({
        query: input.query,
        hits: [
          {
            caseId: "case_1",
            supportAgent: "usr_support_1",
            tenantScope: platformScope.organization,
            tenantScopeId: "org_1",
            summary: "Invoice search mismatch",
            status: supportOperationsCaseStatus.open,
            priority: supportOperationsCasePriority.high,
            startedAt: "2026-04-27T12:00:00.000Z",
            lastUpdatedAt: "2026-04-27T12:30:00.000Z",
          },
        ],
        estimatedTotalHits: 1,
      }),
    );
    const deleteTenantIndex = vi.fn((input) =>
      Effect.succeed({
        indexName: input.indexName,
        scope: input.scope,
        scopeId: input.scopeId,
        deleted: true,
        deletedAt: "2026-04-27T14:00:00.000Z",
      }),
    );
    const getSearchTenantIndexRecord = vi.fn((input) =>
      Effect.succeed(persistedRecords.get(input.indexName)),
    );
    const upsertSearchTenantIndexRecord = vi.fn((record) => {
      persistedRecords.set(record.indexName, record);
      return Effect.succeed(record);
    });
    const search = await Effect.runPromise(
      makeSearchModule().pipe(
        Effect.provideService(SearchTenantIndexPostgresRepository, {
          getSearchTenantIndexRecord,
          upsertSearchTenantIndexRecord,
          listSearchTenantIndexRecords: vi.fn((input) =>
            Effect.succeed(
              [...persistedRecords.values()].filter(
                (record) =>
                  record.scope === input.scope &&
                  record.scopeId === input.scopeId,
              ),
            ),
          ),
        }),
        Effect.provideService(MeilisearchAdapter, {
          serviceName: platformAdapterServiceName.meilisearch,
          url: "http://localhost:7700",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.meilisearch,
          } as const),
          ensureTenantIndex,
          getTenantIndex,
          deleteTenantIndex,
          replaceTenantDocuments,
          replaceManagedFileDocuments: vi.fn(() =>
            Effect.die(
              new Error(
                "Unexpected managed-file-only document replacement call.",
              ),
            ),
          ),
          queryManagedFiles,
          querySupportCases,
        }),
      ),
    );

    await expect(
      Effect.runPromise(
        search.ensureTenantIndex({
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status", "moduleId"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title", "content"],
            rankingRules: ["words", "typo", "sort"],
          },
          documents: [
            {
              documentId: `${searchDocumentFamily.managedFileSummary}__file_1`,
              documentFamily: searchDocumentFamily.managedFileSummary,
              fileId: "file_1",
              fileName: "invoice.pdf",
              contentType: "application/pdf",
              sizeBytes: 1024,
            },
            {
              documentId: `${searchDocumentFamily.supportCaseSummary}__case_1`,
              documentFamily: searchDocumentFamily.supportCaseSummary,
              caseId: "case_1",
              supportAgent: "usr_support_1",
              tenantScope: platformScope.organization,
              tenantScopeId: "org_1",
              summary: "Invoice search mismatch",
              status: supportOperationsCaseStatus.open,
              priority: supportOperationsCasePriority.high,
              startedAt: "2026-04-27T12:00:00.000Z",
              lastUpdatedAt: "2026-04-27T12:30:00.000Z",
            },
          ],
        }),
      ),
    ).resolves.toMatchObject({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      lifecycleState: searchIndexLifecycleState.ready,
      documentCount: 2,
    });

    await expect(
      Effect.runPromise(
        search.queryManagedFiles({
          indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
          scope: platformScope.organization,
          scopeId: "org_1",
          query: "invoice",
        }),
      ),
    ).resolves.toEqual({
      query: "invoice",
      hits: [
        {
          fileId: "file_1",
          fileName: "invoice.pdf",
          contentType: "application/pdf",
          sizeBytes: 1024,
        },
      ],
      estimatedTotalHits: 1,
    });

    await expect(
      Effect.runPromise(
        search.querySupportCases({
          indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
          scope: platformScope.organization,
          scopeId: "org_1",
          query: "invoice",
          status: [supportOperationsCaseStatus.open],
          priority: [supportOperationsCasePriority.high],
          sort: {
            field: "lastUpdatedAt",
            direction: "desc",
          },
        }),
      ),
    ).resolves.toEqual({
      query: "invoice",
      hits: [
        {
          caseId: "case_1",
          supportAgent: "usr_support_1",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          summary: "Invoice search mismatch",
          status: supportOperationsCaseStatus.open,
          priority: supportOperationsCasePriority.high,
          startedAt: "2026-04-27T12:00:00.000Z",
          lastUpdatedAt: "2026-04-27T12:30:00.000Z",
        },
      ],
      estimatedTotalHits: 1,
    });

    await expect(
      Effect.runPromise(
        search.getTenantIndex({
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toMatchObject({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      documentCount: 12,
    });

    await expect(
      Effect.runPromise(
        search.deleteTenantIndex({
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    ).resolves.toMatchObject({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      deleted: true,
    });

    expect(ensureTenantIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        scopeId: "org_1",
      }),
    );
    expect(replaceTenantDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        documents: [
          expect.objectContaining({
            documentFamily: searchDocumentFamily.managedFileSummary,
            fileId: "file_1",
          }),
          expect.objectContaining({
            documentFamily: searchDocumentFamily.supportCaseSummary,
            caseId: "case_1",
          }),
        ],
      }),
    );
    expect(getTenantIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    );
    expect(queryManagedFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        query: "invoice",
      }),
    );
    expect(querySupportCases).toHaveBeenCalledWith(
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
        query: "invoice",
        status: [supportOperationsCaseStatus.open],
        priority: [supportOperationsCasePriority.high],
        sort: {
          field: "lastUpdatedAt",
          direction: "desc",
        },
      }),
    );
    expect(deleteTenantIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      }),
    );
    expect(getSearchTenantIndexRecord).toHaveBeenCalledTimes(3);
    expect(upsertSearchTenantIndexRecord).toHaveBeenCalledTimes(3);
    expect(
      persistedRecords.get(
        `${platformModuleId.search}:${platformScope.organization}:org_1`,
      ),
    ).toMatchObject({
      indexName: `${platformModuleId.search}:${platformScope.organization}:org_1`,
      lifecycleState: searchIndexLifecycleState.deleted,
      documentCount: 0,
      deletedAt: "2026-04-27T14:00:00.000Z",
    });
  });

  it("persists failed search lifecycle state when the Meilisearch ensure task fails", async () => {
    const persistedRecords = new Map<string, SearchTenantIndexRecord>();
    const indexName = `${platformModuleId.search}:${platformScope.organization}:org_1`;
    const search = await Effect.runPromise(
      makeSearchModule().pipe(
        Effect.provideService(SearchTenantIndexPostgresRepository, {
          getSearchTenantIndexRecord: vi.fn((input) =>
            Effect.succeed(persistedRecords.get(input.indexName)),
          ),
          upsertSearchTenantIndexRecord: vi.fn((record) => {
            persistedRecords.set(record.indexName, record);
            return Effect.succeed(record);
          }),
          listSearchTenantIndexRecords: vi.fn(() => Effect.succeed([])),
        }),
        Effect.provideService(MeilisearchAdapter, {
          serviceName: platformAdapterServiceName.meilisearch,
          url: "http://localhost:7700",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.meilisearch,
          } as const),
          ensureTenantIndex: () =>
            Effect.fail({
              _tag: "MeilisearchAdapterRequestError",
              operation: "ensureTenantIndex",
              cause: new Error("index creation rejected by Meilisearch"),
              body: JSON.stringify({
                error: {
                  message: "index creation rejected by Meilisearch",
                },
              }),
            } as const),
          getTenantIndex: vi.fn(() => Effect.succeed(undefined)),
          deleteTenantIndex: vi.fn(() =>
            Effect.die(new Error("Unexpected search delete call.")),
          ),
          replaceTenantDocuments: vi.fn(() =>
            Effect.die(
              new Error("Unexpected tenant document replacement call."),
            ),
          ),
          replaceManagedFileDocuments: vi.fn(() =>
            Effect.die(
              new Error("Unexpected managed-file document replacement call."),
            ),
          ),
          queryManagedFiles: vi.fn(() =>
            Effect.die(new Error("Unexpected search query call.")),
          ),
          querySupportCases: vi.fn(() =>
            Effect.die(new Error("Unexpected support-case search query call.")),
          ),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.ensureTenantIndex({
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title"],
            rankingRules: ["words"],
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "MeilisearchAdapterRequestError",
        operation: "ensureTenantIndex",
      },
    });

    expect(persistedRecords.get(indexName)).toMatchObject({
      indexName,
      lifecycleState: searchIndexLifecycleState.failed,
      lastError: "index creation rejected by Meilisearch",
      settings: {
        filterableAttributes: ["status"],
      },
    });
  });

  it("persists syncing search lifecycle state when the Meilisearch ensure task is still processing", async () => {
    const persistedRecords = new Map<string, SearchTenantIndexRecord>();
    const indexName = `${platformModuleId.search}:${platformScope.organization}:org_1`;
    const search = await Effect.runPromise(
      makeSearchModule().pipe(
        Effect.provideService(SearchTenantIndexPostgresRepository, {
          getSearchTenantIndexRecord: vi.fn((input) =>
            Effect.succeed(persistedRecords.get(input.indexName)),
          ),
          upsertSearchTenantIndexRecord: vi.fn((record) => {
            persistedRecords.set(record.indexName, record);
            return Effect.succeed(record);
          }),
          listSearchTenantIndexRecords: vi.fn(() => Effect.succeed([])),
        }),
        Effect.provideService(MeilisearchAdapter, {
          serviceName: platformAdapterServiceName.meilisearch,
          url: "http://localhost:7700",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.meilisearch,
          } as const),
          ensureTenantIndex: () =>
            Effect.fail({
              _tag: "MeilisearchAdapterRequestError",
              operation: "ensureTenantIndex",
              cause: new Error(
                "Meilisearch task 12 did not complete within 200 polling attempts.",
              ),
              body: JSON.stringify({ uid: 12, status: "processing" }),
            } as const),
          getTenantIndex: vi.fn(() => Effect.succeed(undefined)),
          deleteTenantIndex: vi.fn(() =>
            Effect.die(new Error("Unexpected search delete call.")),
          ),
          replaceTenantDocuments: vi.fn(() =>
            Effect.die(
              new Error("Unexpected tenant document replacement call."),
            ),
          ),
          replaceManagedFileDocuments: vi.fn(() =>
            Effect.die(
              new Error("Unexpected managed-file document replacement call."),
            ),
          ),
          queryManagedFiles: vi.fn(() =>
            Effect.die(new Error("Unexpected search query call.")),
          ),
          querySupportCases: vi.fn(() =>
            Effect.die(new Error("Unexpected support-case search query call.")),
          ),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.ensureTenantIndex({
          scope: platformScope.organization,
          scopeId: "org_1",
          settings: {
            filterableAttributes: ["status"],
            sortableAttributes: ["updatedAt"],
            searchableAttributes: ["title"],
            rankingRules: ["words"],
          },
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "MeilisearchAdapterRequestError",
        operation: "ensureTenantIndex",
      },
    });

    expect(persistedRecords.get(indexName)).toMatchObject({
      indexName,
      lifecycleState: searchIndexLifecycleState.syncing,
      lastError:
        "Meilisearch task 12 did not complete within 200 polling attempts.",
    });
  });

  it("preserves deleted search lifecycle state when a delete retry fails", async () => {
    const indexName = `${platformModuleId.search}:${platformScope.organization}:org_1`;
    const persistedRecords = new Map<string, SearchTenantIndexRecord>([
      [
        indexName,
        {
          indexName,
          scope: platformScope.organization,
          scopeId: "org_1",
          documentCount: 0,
          lifecycleState: searchIndexLifecycleState.deleted,
          deletedAt: "2026-04-27T18:00:00.000Z",
          createdAt: "2026-04-27T17:00:00.000Z",
          updatedAt: "2026-04-27T18:00:00.000Z",
        },
      ],
    ]);
    const search = await Effect.runPromise(
      makeSearchModule().pipe(
        Effect.provideService(SearchTenantIndexPostgresRepository, {
          getSearchTenantIndexRecord: vi.fn((input) =>
            Effect.succeed(persistedRecords.get(input.indexName)),
          ),
          upsertSearchTenantIndexRecord: vi.fn((record) => {
            persistedRecords.set(record.indexName, record);
            return Effect.succeed(record);
          }),
          listSearchTenantIndexRecords: vi.fn(() => Effect.succeed([])),
        }),
        Effect.provideService(MeilisearchAdapter, {
          serviceName: platformAdapterServiceName.meilisearch,
          url: "http://localhost:7700",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.meilisearch,
          } as const),
          ensureTenantIndex: vi.fn(() =>
            Effect.die(new Error("Unexpected search ensure call.")),
          ),
          getTenantIndex: vi.fn(() => Effect.succeed(undefined)),
          deleteTenantIndex: () =>
            Effect.fail({
              _tag: "MeilisearchAdapterRequestError",
              operation: "deleteTenantIndex",
              cause: new Error("delete request temporarily failed"),
            } as const),
          replaceTenantDocuments: vi.fn(() =>
            Effect.die(
              new Error("Unexpected tenant document replacement call."),
            ),
          ),
          replaceManagedFileDocuments: vi.fn(() =>
            Effect.die(
              new Error("Unexpected managed-file document replacement call."),
            ),
          ),
          queryManagedFiles: vi.fn(() =>
            Effect.die(new Error("Unexpected search query call.")),
          ),
          querySupportCases: vi.fn(() =>
            Effect.die(new Error("Unexpected support-case search query call.")),
          ),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.deleteTenantIndex({
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "MeilisearchAdapterRequestError",
        operation: "deleteTenantIndex",
      },
    });

    expect(persistedRecords.get(indexName)).toMatchObject({
      indexName,
      lifecycleState: searchIndexLifecycleState.deleted,
      deletedAt: "2026-04-27T18:00:00.000Z",
      lastError: "delete request temporarily failed",
    });
  });

  it("persists deleting search lifecycle state when a delete task is still processing", async () => {
    const indexName = `${platformModuleId.search}:${platformScope.organization}:org_1`;
    const persistedRecords = new Map<string, SearchTenantIndexRecord>([
      [
        indexName,
        {
          indexName,
          scope: platformScope.organization,
          scopeId: "org_1",
          documentCount: 4,
          lifecycleState: searchIndexLifecycleState.ready,
          createdAt: "2026-04-27T17:00:00.000Z",
          updatedAt: "2026-04-27T17:30:00.000Z",
        },
      ],
    ]);
    const search = await Effect.runPromise(
      makeSearchModule().pipe(
        Effect.provideService(SearchTenantIndexPostgresRepository, {
          getSearchTenantIndexRecord: vi.fn((input) =>
            Effect.succeed(persistedRecords.get(input.indexName)),
          ),
          upsertSearchTenantIndexRecord: vi.fn((record) => {
            persistedRecords.set(record.indexName, record);
            return Effect.succeed(record);
          }),
          listSearchTenantIndexRecords: vi.fn(() => Effect.succeed([])),
        }),
        Effect.provideService(MeilisearchAdapter, {
          serviceName: platformAdapterServiceName.meilisearch,
          url: "http://localhost:7700",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.meilisearch,
          } as const),
          ensureTenantIndex: vi.fn(() =>
            Effect.die(new Error("Unexpected search ensure call.")),
          ),
          getTenantIndex: vi.fn(() => Effect.succeed(undefined)),
          deleteTenantIndex: () =>
            Effect.fail({
              _tag: "MeilisearchAdapterRequestError",
              operation: "deleteTenantIndex",
              cause: new Error(
                "Meilisearch task 22 did not complete within 200 polling attempts.",
              ),
              body: JSON.stringify({ uid: 22, status: "processing" }),
            } as const),
          replaceTenantDocuments: vi.fn(() =>
            Effect.die(
              new Error("Unexpected tenant document replacement call."),
            ),
          ),
          replaceManagedFileDocuments: vi.fn(() =>
            Effect.die(
              new Error("Unexpected managed-file document replacement call."),
            ),
          ),
          queryManagedFiles: vi.fn(() =>
            Effect.die(new Error("Unexpected search query call.")),
          ),
          querySupportCases: vi.fn(() =>
            Effect.die(new Error("Unexpected support-case search query call.")),
          ),
        }),
      ),
    );

    const result = await Effect.runPromise(
      Effect.either(
        search.deleteTenantIndex({
          scope: platformScope.organization,
          scopeId: "org_1",
        }),
      ),
    );

    expect(result).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "MeilisearchAdapterRequestError",
        operation: "deleteTenantIndex",
      },
    });

    expect(persistedRecords.get(indexName)).toMatchObject({
      indexName,
      documentCount: 4,
      lifecycleState: searchIndexLifecycleState.deleting,
      lastError:
        "Meilisearch task 22 did not complete within 200 polling attempts.",
    });
  });

  it("builds telemetry envelopes and exposes SLOs", async () => {
    const observability = await Effect.runPromise(makeObservabilityModule());

    const envelope = await Effect.runPromise(
      observability.buildTelemetryEnvelope({
        requestContext: organizationRequestContext,
        moduleId: platformModuleId.runtimeConfig,
        kind: telemetryKind.trace,
        permissionScope: permissionScope.configWrite,
        deploymentVersion: "2026.04.06",
        configVersion: "manifest-v1",
      }),
    );

    expect(envelope).toMatchObject({
      moduleId: platformModuleId.runtimeConfig,
      kind: telemetryKind.trace,
      permissionScope: permissionScope.configWrite,
    });
    await expect(Effect.runPromise(observability.listSlos)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "platform.availability.monthly" }),
      ]),
    );
  });

  it("enforces quotas and allocates internal costs", async () => {
    const billingMetering = await Effect.runPromise(
      makeBillingMeteringModule(),
    );

    const quotaDecision = await Effect.runPromise(
      billingMetering.evaluateQuota({
        requestContext: organizationRequestContext,
        quota: {
          featureKey: tenantBrandingFeatureFlag.customDomain,
          limit: 10,
          period: usageQuotaPeriod.month,
          enforcementMode: billingEnforcementMode.rateLimit,
        },
        consumed: 9,
        event: {
          moduleId: platformModuleId.billingAndMetering,
          featureKey: tenantBrandingFeatureFlag.customDomain,
          scope: platformScope.organization,
          scopeId: "org_1",
          quantity: 2,
          unit: "domain",
          capturedAt: new Date().toISOString(),
        },
      }),
    );
    const costs = await Effect.runPromise(
      billingMetering.allocateInternalCosts([
        {
          resource: "convex-storage-gb",
          scope: platformScope.organization,
          scopeId: "org_1",
          quantity: 12,
          unitCost: 0.25,
        },
      ]),
    );

    expect(quotaDecision.allowed).toBe(false);
    expect(costs[0]?.totalCost).toBe(3);
  });

  it("selects active monthly and yearly prices from shared billing plans", async () => {
    const billingMetering = await Effect.runPromise(
      makeBillingMeteringModule(),
    );

    const yearlyPrice = await Effect.runPromise(
      billingMetering.resolvePlanPrice({
        plan: {
          planId: "plan_growth",
          planKey: "growth",
          displayName: "Growth",
          active: true,
          prices: [
            {
              priceId: "price_growth_month",
              interval: billingPlanInterval.month,
              currency: "USD",
              amountMinor: 2900,
              active: true,
              providerPriceId: "polar_price_growth_month",
            },
            {
              priceId: "price_growth_year",
              interval: billingPlanInterval.year,
              currency: "USD",
              amountMinor: 29000,
              active: true,
              providerPriceId: "polar_price_growth_year",
            },
          ],
          entitlements: [
            {
              moduleId: platformModuleId.tenantManagement,
              featureKey: tenantManagementFeatureFlag.enabled,
              included: true,
              meteringMode: billingMeteringMode.none,
              enforcementMode: billingEnforcementMode.none,
            },
          ],
        },
        interval: billingPlanInterval.year,
      }),
    );
    const monthlyPrice = await Effect.runPromise(
      billingMetering.resolvePlanPrice({
        plan: {
          planId: "plan_growth",
          planKey: "growth",
          displayName: "Growth",
          active: true,
          prices: [
            {
              priceId: "price_growth_month",
              interval: billingPlanInterval.month,
              currency: "USD",
              amountMinor: 2900,
              active: true,
              providerPriceId: "polar_price_growth_month",
            },
            {
              priceId: "price_growth_year",
              interval: billingPlanInterval.year,
              currency: "USD",
              amountMinor: 29000,
              active: true,
              providerPriceId: "polar_price_growth_year",
            },
          ],
          entitlements: [
            {
              moduleId: platformModuleId.tenantManagement,
              featureKey: tenantManagementFeatureFlag.enabled,
              included: true,
              meteringMode: billingMeteringMode.none,
              enforcementMode: billingEnforcementMode.none,
            },
          ],
        },
        priceId: "price_growth_month",
      }),
    );

    expect(yearlyPrice.interval).toBe(billingPlanInterval.year);
    expect(monthlyPrice.priceId).toBe("price_growth_month");
  });

  it("projects normalized billing webhooks into durable subscription state", async () => {
    const billingMetering = await Effect.runPromise(
      makeBillingMeteringModule(),
    );
    const occurredAt = new Date().toISOString();
    const currentPeriodEnd = new Date(Date.now() + 86_400_000).toISOString();

    const projection = await Effect.runPromise(
      billingMetering.buildWebhookPersistenceProjection({
        action: billingWebhookReconciliationAction.flagPastDue,
        event: {
          provider: "polar",
          deliveryId: "wh_1",
          eventId: "evt_1",
          eventType: billingWebhookEventType.paymentFailed,
          occurredAt,
          subscriptionId: "sub_1",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          planId: "plan_starter",
          priceId: "price_starter_month",
          customerId: "cus_1",
        },
        subscription: {
          subscriptionId: "sub_1",
          planId: "plan_starter",
          priceId: "price_starter_month",
          status: billingSubscriptionStatus.pastDue,
          interval: billingPlanInterval.month,
          currentPeriodEnd,
          entitlements: [
            {
              moduleId: platformModuleId.tenantManagement,
              featureKey: tenantManagementFeatureFlag.enabled,
              included: true,
              meteringMode: billingMeteringMode.none,
              enforcementMode: billingEnforcementMode.none,
            },
            {
              moduleId: platformModuleId.billingAndMetering,
              featureKey: billingAndMeteringFeatureFlag.apiRequests,
              included: true,
              meteringMode: billingMeteringMode.rateLimit,
              meterKey: billingAndMeteringFeatureFlag.apiRequests,
              unit: "request",
              quotaLimit: 60,
              quotaPeriod: usageQuotaPeriod.minute,
              enforcementMode: billingEnforcementMode.rateLimit,
            },
          ],
        },
        entitlementsActive: false,
      }),
    );

    expect(projection.webhookReceipt.processingState).toBe(
      billingWebhookReceiptProcessingState.processed,
    );
    expect(projection.subscription.status).toBe(
      billingSubscriptionStatus.pastDue,
    );
    expect(projection.paymentEvent.status).toBe(
      billingPaymentEventStatus.failed,
    );
    expect(projection.entitlements[0]?.featureKey).toBe(
      tenantManagementFeatureFlag.enabled,
    );
    expect(projection.entitlements[0]?.active).toBe(false);
    expect(projection.entitlements[1]?.quotaSnapshot).toMatchObject({
      quotaLimit: 60,
      meteringMode: billingMeteringMode.rateLimit,
    });
  });

  it("builds onboarding plans and enforces tenant isolation", async () => {
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );

    const plan = await Effect.runPromise(
      tenantManagement.buildOnboardingPlan({
        requestContext: organizationRequestContext,
        enabledModules: [
          platformModuleId.tenantManagement,
          platformModuleId.tenantBranding,
          platformModuleId.billingAndMetering,
          platformModuleId.identitySession,
        ],
      }),
    );
    const isolation = await Effect.runPromise(
      tenantManagement.assertTenantIsolation({
        requestContext: organizationRequestContext,
        resourceTenant: {
          scope: platformScope.organization,
          scopeId: "org_2",
          enterpriseId: "ent_1",
          organizationId: "org_2",
        },
      }),
    );

    expect(plan.steps.map((step) => step.stepId)).toEqual(
      expect.arrayContaining(["branding", "billing"]),
    );
    expect(isolation.allowed).toBe(false);
  });

  it("creates organization-scoped provisioning tenant contexts", async () => {
    const tenant = await Effect.runPromise(createProvisioningTenantContext());

    expect(tenant).toEqual({
      scope: platformScope.organization,
      scopeId: expect.stringMatching(/^org_/),
      organizationId: expect.any(String),
    });
    expect(tenant.scopeId).toBe(tenant.organizationId);
  });

  it("creates standalone individual provisioning tenant contexts", async () => {
    const tenant = await Effect.runPromise(
      createProvisioningTenantContext({
        scope: platformScope.individual,
      }),
    );

    expect(tenant).toEqual({
      scope: platformScope.individual,
      scopeId: expect.stringMatching(/^usr_/),
      individualId: expect.any(String),
    });
    expect(tenant.scopeId).toBe(tenant.individualId);
  });

  it("allows cross-tenant access with valid break-glass context", async () => {
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );

    const isolation = await Effect.runPromise(
      tenantManagement.assertTenantIsolation({
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_1",
          sessionId: "sess_support_1",
          correlationId: "corr-break-glass",
          reason: "Regulated support investigation",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            enterpriseId: "ent_1",
            organizationId: "org_1",
          },
          breakGlass: {
            approvedBy: "usr_admin_1",
            reason: "Regulated support investigation",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          },
        },
        resourceTenant: {
          scope: platformScope.organization,
          scopeId: "org_2",
          enterpriseId: "ent_1",
          organizationId: "org_2",
        },
      }),
    );

    expect(isolation.allowed).toBe(true);
  });

  it("denies cross-tenant access when break-glass context is expired", async () => {
    const tenantManagement = await Effect.runPromise(
      makeTenantManagementModule(),
    );

    const isolation = await Effect.runPromise(
      tenantManagement.assertTenantIsolation({
        requestContext: {
          actorType: actorType.supportOperator,
          actorId: "usr_support_1",
          sessionId: "sess_support_1",
          correlationId: "corr-break-glass-expired",
          reason: "Regulated support investigation",
          tenant: {
            scope: platformScope.organization,
            scopeId: "org_1",
            enterpriseId: "ent_1",
            organizationId: "org_1",
          },
          breakGlass: {
            approvedBy: "usr_admin_1",
            reason: "Regulated support investigation",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
          },
        },
        resourceTenant: {
          scope: platformScope.organization,
          scopeId: "org_2",
          enterpriseId: "ent_1",
          organizationId: "org_2",
        },
      }),
    );

    expect(isolation.allowed).toBe(false);
  });

  it("exposes health indicators from observability module", async () => {
    const observability = await Effect.runPromise(makeObservabilityModule());

    const indicators = await Effect.runPromise(
      observability.listHealthIndicators,
    );

    expect(indicators.length).toBeGreaterThanOrEqual(1);
    expect(indicators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: platformModuleId.authorization,
          healthy: true,
        }),
      ]),
    );
  });
});
