import * as config from "@comvestec/config";
import { Effect, ParseResult } from "effect";
import {
  emailDeliveryFeatureFlag,
  tenantBrandingConfigKey,
  tenantBrandingFeatureFlag,
} from "@comvestec/config";
import {
  platformModuleId,
  platformScope,
  runtimeResolutionSource,
  emailDeliveryBounceType,
  emailDeliveryProviderEventType,
  emailDeliveryStatus,
  emailSuppressionReason,
} from "@comvestec/contracts";
import {
  type BillingEntitlementRecord,
  BillingStatePostgresRepository,
  EmailDeliveryPostgresRepository,
  makeEmailDeliveryModule,
  makeEmailDeliveryProviderEventRecorder,
  makeRuntimeConfigModule,
  type RuntimeConfigOverrideRecord,
  RuntimeConfigModule,
} from "@comvestec/modules";
import {
  PostalAdapter,
  platformAdapterServiceName,
  type PostalAdapterService,
} from "@comvestec/platform";
import { organizationRequestContext } from "../modules/_fixtures";
import {
  EmailDeliveryModuleDisabledError,
  makeEmailDeliveryService,
  resolveEmailDeliveryRuntimeOptionsFromEnvironment,
  runEmailDeliveryFromEnvironment,
} from "../../packages/platform/src/services/communication/email-delivery";

const createBillingStateRepository = (
  entitlements: readonly BillingEntitlementRecord[],
): BillingStatePostgresRepository["Type"] => ({
  getTenantAccessState: ({
    scope,
    scopeId,
    enterpriseId,
    organizationId,
    individualId,
  }) =>
    Effect.succeed({
      entitlements: entitlements.filter((entitlement) => {
        const candidates = (() => {
          switch (scope) {
            case platformScope.individual:
              return [
                {
                  scope: platformScope.individual,
                  scopeId: individualId ?? scopeId,
                },
                ...(organizationId !== undefined
                  ? [
                      {
                        scope: platformScope.organization,
                        scopeId: organizationId,
                      },
                    ]
                  : []),
                ...(enterpriseId !== undefined
                  ? [{ scope: platformScope.enterprise, scopeId: enterpriseId }]
                  : []),
                {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              ];
            case platformScope.organization:
              return [
                {
                  scope: platformScope.organization,
                  scopeId: organizationId ?? scopeId,
                },
                ...(enterpriseId !== undefined
                  ? [{ scope: platformScope.enterprise, scopeId: enterpriseId }]
                  : []),
                {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              ];
            case platformScope.enterprise:
              return [
                {
                  scope: platformScope.enterprise,
                  scopeId: enterpriseId ?? scopeId,
                },
                {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              ];
            case platformScope.platform:
              return [
                {
                  scope: platformScope.platform,
                  scopeId: platformScope.platform,
                },
              ];
          }
        })();

        return candidates.some(
          (candidate) =>
            entitlement.scope === candidate.scope &&
            entitlement.scopeId === candidate.scopeId,
        );
      }),
      invoiceHistory: [],
    }),
});

const createRuntimeConfigService = async (
  overrides: readonly RuntimeConfigOverrideRecord[],
): Promise<RuntimeConfigModule["Type"]> => {
  const runtimeConfig = await Effect.runPromise(makeRuntimeConfigModule());

  return {
    ...runtimeConfig,
    listOverridesByModule: (moduleId) =>
      Effect.succeed(
        overrides.filter((override) => override.moduleId === moduleId),
      ),
  };
};

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

const createEmailDeliveryModuleForTest = async (input: {
  readonly sendEmail: ReturnType<typeof vi.fn>;
  readonly repository?: ReturnType<typeof createEmailDeliveryRepository>;
}) => {
  const repository = input.repository ?? createEmailDeliveryRepository();
  const emailDeliveryModule = await Effect.runPromise(
    makeEmailDeliveryModule().pipe(
      Effect.provideService(PostalAdapter, {
        serviceName: platformAdapterServiceName.postal,
        apiUrl: "http://localhost:5000",
        healthcheck: Effect.succeed({
          healthy: true,
          service: platformAdapterServiceName.postal,
        } as const),
        sendEmail: input.sendEmail as PostalAdapterService["sendEmail"],
      }),
      Effect.provideService(
        EmailDeliveryPostgresRepository,
        repository.service,
      ),
    ),
  );

  return {
    emailDeliveryModule,
    repository,
  };
};

describe("platform email delivery", () => {
  it("resolves transport runtime options from required environment", async () => {
    await expect(
      Effect.runPromise(
        resolveEmailDeliveryRuntimeOptionsFromEnvironment({
          POSTGRES_URL:
            "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
          POSTAL_API_URL: "http://127.0.0.1:5000",
          POSTAL_API_KEY: "postal-api-key",
          PLATFORM_EMAIL_SENDER_DISPLAY_NAME: "Comvestec Platform",
          PLATFORM_EMAIL_SENDER_FROM_EMAIL: "support@platform.example",
          PLATFORM_EMAIL_SENDER_REPLY_TO_EMAIL: "reply@platform.example",
        }),
      ),
    ).resolves.toEqual({
      postgresUrl: "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
      postalApiUrl: "http://127.0.0.1:5000",
      postalApiKey: "postal-api-key",
      platformSender: {
        displayName: "Comvestec Platform",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@platform.example",
      },
    });
  });

  it("fails runtime option resolution when sender env is missing", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        resolveEmailDeliveryRuntimeOptionsFromEnvironment({
          POSTGRES_URL:
            "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
          POSTAL_API_URL: "http://127.0.0.1:5000",
          POSTAL_API_KEY: "postal-api-key",
          PLATFORM_EMAIL_SENDER_DISPLAY_NAME: "Comvestec Platform",
          PLATFORM_EMAIL_SENDER_REPLY_TO_EMAIL: "reply@platform.example",
        }),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
    expect(error.message).toContain("PLATFORM_EMAIL_SENDER_FROM_EMAIL");
  });

  it("preserves parse errors when running from an invalid environment", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        runEmailDeliveryFromEnvironment(
          {
            POSTGRES_URL:
              "postgresql://comvestec:comvestec@127.0.0.1:5432/comvestec",
            POSTAL_API_URL: "http://127.0.0.1:5000",
            POSTAL_API_KEY: "postal-api-key",
            PLATFORM_EMAIL_SENDER_DISPLAY_NAME: "Comvestec Platform",
            PLATFORM_EMAIL_SENDER_REPLY_TO_EMAIL: "reply@platform.example",
          },
          () => Effect.die(new Error("Unexpected email delivery runtime use.")),
        ),
      ),
    );

    expect(error).toBeInstanceOf(ParseResult.ParseError);
    expect(error.message).toContain("PLATFORM_EMAIL_SENDER_FROM_EMAIL");
  });

  it("resolves branded sender metadata from stored runtime state", async () => {
    const changedAt = "2026-04-27T11:00:00.000Z";
    const runtimeConfig = await createRuntimeConfigService([
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "Acme",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.supportEmail,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "support@acme.example",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.replyToEmail,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "reply@acme.example",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.brandedEmails,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: true,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
    ]);
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-04-27T12:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const { emailDeliveryModule } = await createEmailDeliveryModuleForTest({
      sendEmail,
    });
    const emailDeliveryService = await Effect.runPromise(
      makeEmailDeliveryService({
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        emailDelivery: emailDeliveryModule,
      }).pipe(
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepository([
            {
              entitlementId: "ent_tenant_branding_enabled",
              moduleId: platformModuleId.tenantBranding,
              featureKey: tenantBrandingFeatureFlag.enabled,
              scope: platformScope.organization,
              scopeId: "org_1",
              active: true,
              grantedAt: "2026-04-27T10:00:00.000Z",
            },
            {
              entitlementId: "ent_tenant_branding_branded_emails",
              moduleId: platformModuleId.tenantBranding,
              featureKey: tenantBrandingFeatureFlag.brandedEmails,
              scope: platformScope.organization,
              scopeId: "org_1",
              active: true,
              grantedAt: "2026-04-27T10:00:00.000Z",
            },
          ]),
        ),
      ),
    );

    const receipt = await Effect.runPromise(
      emailDeliveryService.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        template: "billing.invoice-ready",
        subject: "Welcome",
        html: "<p>Hello</p>",
      }),
    );

    expect(receipt).toMatchObject({
      messageId: expect.stringMatching(/^email-delivery:organization:org_1:/),
      recipient: "customer@example.com",
      status: "queued",
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: expect.stringMatching(/^email-delivery:organization:org_1:/),
        fromName: "Acme",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
      }),
    );
  });

  it("falls back to the platform sender name when branded emails lack a company name override", async () => {
    const changedAt = "2026-04-27T11:00:00.000Z";
    const runtimeConfig = await createRuntimeConfigService([
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.replyToEmail,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "reply@acme.example",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.brandedEmails,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: true,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
    ]);
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-04-27T12:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const { emailDeliveryModule } = await createEmailDeliveryModuleForTest({
      sendEmail,
    });
    const emailDeliveryService = await Effect.runPromise(
      makeEmailDeliveryService({
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        emailDelivery: emailDeliveryModule,
      }).pipe(
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepository([
            {
              entitlementId: "ent_tenant_branding_enabled",
              moduleId: platformModuleId.tenantBranding,
              featureKey: tenantBrandingFeatureFlag.enabled,
              scope: platformScope.organization,
              scopeId: "org_1",
              active: true,
              grantedAt: "2026-04-27T10:00:00.000Z",
            },
            {
              entitlementId: "ent_tenant_branding_branded_emails",
              moduleId: platformModuleId.tenantBranding,
              featureKey: tenantBrandingFeatureFlag.brandedEmails,
              scope: platformScope.organization,
              scopeId: "org_1",
              active: true,
              grantedAt: "2026-04-27T10:00:00.000Z",
            },
          ]),
        ),
      ),
    );

    await Effect.runPromise(
      emailDeliveryService.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
      }),
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        fromName: "Comvestec Platform",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
      }),
    );
  });

  it("uses ancestor-scope entitlements when resolving branded emails", async () => {
    const changedAt = "2026-04-27T11:00:00.000Z";
    const runtimeConfig = await createRuntimeConfigService([
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.companyName,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "Acme Enterprise",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingConfigKey.replyToEmail,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: "reply@enterprise.example",
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
      {
        moduleId: platformModuleId.tenantBranding,
        key: tenantBrandingFeatureFlag.brandedEmails,
        scope: platformScope.organization,
        scopeId: "org_1",
        value: true,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
    ]);
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-04-27T12:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const { emailDeliveryModule } = await createEmailDeliveryModuleForTest({
      sendEmail,
    });
    const emailDeliveryService = await Effect.runPromise(
      makeEmailDeliveryService({
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        emailDelivery: emailDeliveryModule,
      }).pipe(
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepository([
            {
              entitlementId: "ent_tenant_branding_enabled_enterprise",
              moduleId: platformModuleId.tenantBranding,
              featureKey: tenantBrandingFeatureFlag.enabled,
              scope: platformScope.enterprise,
              scopeId: "ent_1",
              active: true,
              grantedAt: "2026-04-27T10:00:00.000Z",
            },
            {
              entitlementId: "ent_tenant_branding_branded_emails_enterprise",
              moduleId: platformModuleId.tenantBranding,
              featureKey: tenantBrandingFeatureFlag.brandedEmails,
              scope: platformScope.enterprise,
              scopeId: "ent_1",
              active: true,
              grantedAt: "2026-04-27T10:00:00.000Z",
            },
          ]),
        ),
      ),
    );

    await Effect.runPromise(
      emailDeliveryService.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
      }),
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        fromName: "Acme Enterprise",
        replyToEmail: "reply@enterprise.example",
      }),
    );
  });

  it("rejects sends when the email-delivery module is disabled", async () => {
    const changedAt = "2026-04-27T11:00:00.000Z";
    const runtimeConfig = await createRuntimeConfigService([
      {
        moduleId: platformModuleId.emailDelivery,
        key: emailDeliveryFeatureFlag.enabled,
        scope: platformScope.platform,
        scopeId: platformScope.platform,
        value: false,
        source: runtimeResolutionSource.runtimeOverride,
        changedBy: "usr_support_operator",
        changedAt,
      },
    ]);
    const sendEmail = vi.fn();
    const { emailDeliveryModule } = await createEmailDeliveryModuleForTest({
      sendEmail,
    });
    const emailDeliveryService = await Effect.runPromise(
      makeEmailDeliveryService({
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        emailDelivery: emailDeliveryModule,
      }).pipe(
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepository([]),
        ),
      ),
    );

    const disabledResult = await Effect.runPromise(
      Effect.either(
        emailDeliveryService.sendTransactionalEmail({
          requestContext: organizationRequestContext,
          recipient: "customer@example.com",
          subject: "Welcome",
          html: "<p>Hello</p>",
        }),
      ),
    );

    expect(disabledResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "EmailDeliveryModuleDisabledError",
        scope: platformScope.organization,
        scopeId: "org_1",
      } satisfies EmailDeliveryModuleDisabledError,
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("surfaces missing feature-flag declarations as a typed service error", async () => {
    const originalFindModuleManifest = config.findModuleManifest;
    const runtimeConfig = await createRuntimeConfigService([]);
    const sendEmail = vi.fn();
    const { emailDeliveryModule } = await createEmailDeliveryModuleForTest({
      sendEmail,
    });
    const emailDeliveryService = await Effect.runPromise(
      makeEmailDeliveryService({
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        emailDelivery: emailDeliveryModule,
      }).pipe(
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepository([]),
        ),
      ),
    );
    const manifestSpy = vi
      .spyOn(config, "findModuleManifest")
      .mockImplementation((moduleId) => {
        const manifest = originalFindModuleManifest(moduleId);

        if (
          moduleId !== platformModuleId.emailDelivery ||
          manifest === undefined
        ) {
          return manifest;
        }

        return {
          ...manifest,
          featureFlags: manifest.featureFlags.filter(
            (flag) => flag.key !== emailDeliveryFeatureFlag.enabled,
          ),
        };
      });

    try {
      const declarationResult = await Effect.runPromise(
        Effect.either(
          emailDeliveryService.sendTransactionalEmail({
            requestContext: organizationRequestContext,
            recipient: "customer@example.com",
            subject: "Welcome",
            html: "<p>Hello</p>",
          }),
        ),
      );

      expect(declarationResult).toMatchObject({
        _tag: "Left",
        left: {
          _tag: "EmailDeliveryDeclarationMissingError",
          moduleId: platformModuleId.emailDelivery,
          key: emailDeliveryFeatureFlag.enabled,
        },
      });
      expect(sendEmail).not.toHaveBeenCalled();
    } finally {
      manifestSpy.mockRestore();
    }
  });

  it("returns the queued receipt when tracked-delivery refresh fails after Postal accepts the email", async () => {
    const runtimeConfig = await createRuntimeConfigService([]);
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-05-04T10:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const repository = createEmailDeliveryRepository();
    const updateTrackedDelivery = vi.fn(() =>
      Effect.fail({
        _tag: "EmailDeliveryPostgresRepositoryQueryError" as const,
        operation: "updateTrackedDelivery" as const,
        cause: new Error("Tracked delivery update unavailable."),
      }),
    );
    const emailDeliveryModule = await Effect.runPromise(
      makeEmailDeliveryModule().pipe(
        Effect.provideService(PostalAdapter, {
          serviceName: platformAdapterServiceName.postal,
          apiUrl: "http://localhost:5000",
          healthcheck: Effect.succeed({
            healthy: true,
            service: platformAdapterServiceName.postal,
          } as const),
          sendEmail: sendEmail as PostalAdapterService["sendEmail"],
        }),
        Effect.provideService(EmailDeliveryPostgresRepository, {
          ...repository.service,
          updateTrackedDelivery:
            updateTrackedDelivery as EmailDeliveryPostgresRepository["Type"]["updateTrackedDelivery"],
        }),
      ),
    );
    const emailDeliveryService = await Effect.runPromise(
      makeEmailDeliveryService({
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        emailDelivery: emailDeliveryModule,
      }).pipe(
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepository([]),
        ),
      ),
    );

    const receipt = await Effect.runPromise(
      emailDeliveryService.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
      }),
    );

    expect(receipt).toMatchObject({
      messageId: expect.stringMatching(/^email-delivery:organization:org_1:/),
      recipient: "customer@example.com",
      status: "queued",
      provider: platformAdapterServiceName.postal,
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(updateTrackedDelivery).toHaveBeenCalledTimes(1);
  });

  it("records bounced provider events and suppresses future sends", async () => {
    const runtimeConfig = await createRuntimeConfigService([]);
    const sendEmail = vi.fn((input) =>
      Effect.succeed({
        messageId: input.messageId,
        recipient: input.recipient,
        status: "queued" as const,
        sentAt: "2026-05-04T10:00:00.000Z",
        provider: platformAdapterServiceName.postal,
      }),
    );
    const repository = createEmailDeliveryRepository();
    const { emailDeliveryModule } = await createEmailDeliveryModuleForTest({
      sendEmail,
      repository,
    });
    const emailDeliveryService = await Effect.runPromise(
      makeEmailDeliveryService({
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        emailDelivery: emailDeliveryModule,
      }).pipe(
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepository([]),
        ),
      ),
    );

    const receipt = await Effect.runPromise(
      emailDeliveryService.sendTransactionalEmail({
        requestContext: organizationRequestContext,
        recipient: "customer@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
      }),
    );

    const trackedDelivery = await Effect.runPromise(
      emailDeliveryService.recordProviderDeliveryEvent({
        messageId: receipt.messageId,
        eventType: emailDeliveryProviderEventType.bounced,
        bounceType: emailDeliveryBounceType.hard,
        occurredAt: "2026-05-04T10:05:00.000Z",
      }),
    );

    expect(trackedDelivery).toMatchObject({
      status: "bounced",
      bounceType: emailDeliveryBounceType.hard,
    });
    expect(repository.suppressions.get("customer@example.com")).toMatchObject({
      reason: emailSuppressionReason.bounced,
      sourceMessageId: receipt.messageId,
    });

    const suppressedResult = await Effect.runPromise(
      Effect.either(
        emailDeliveryService.sendTransactionalEmail({
          requestContext: organizationRequestContext,
          recipient: "customer@example.com",
          subject: "Welcome back",
          html: "<p>Hello again</p>",
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

  it("records provider events without requiring Postal send dependencies", async () => {
    const repository = createEmailDeliveryRepository();
    repository.trackedDeliveries.set(
      "email-delivery:organization:org_1:track_1",
      {
        messageId: "email-delivery:organization:org_1:track_1",
        provider: platformAdapterServiceName.postal,
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: "customer@example.com",
        status: emailDeliveryStatus.queued,
        senderDisplayName: "Comvestec Platform",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@platform.example",
        sentAt: "2026-05-04T10:00:00.000Z",
        lastEventAt: "2026-05-04T10:00:00.000Z",
        createdAt: "2026-05-04T10:00:00.000Z",
        updatedAt: "2026-05-04T10:00:00.000Z",
      },
    );

    const providerEventRecorder = makeEmailDeliveryProviderEventRecorder(
      repository.service,
    );

    const trackedDelivery = await Effect.runPromise(
      providerEventRecorder.recordProviderDeliveryEvent({
        messageId: "email-delivery:organization:org_1:track_1",
        eventType: emailDeliveryProviderEventType.bounced,
        bounceType: emailDeliveryBounceType.hard,
        occurredAt: "2026-05-04T10:05:00.000Z",
      }),
    );

    expect(trackedDelivery).toMatchObject({
      messageId: "email-delivery:organization:org_1:track_1",
      status: emailDeliveryStatus.bounced,
      bounceType: emailDeliveryBounceType.hard,
    });
    expect(repository.suppressions.get("customer@example.com")).toMatchObject({
      reason: emailSuppressionReason.bounced,
      sourceMessageId: "email-delivery:organization:org_1:track_1",
    });
  });

  it("returns a typed error for unknown provider message ids", async () => {
    const runtimeConfig = await createRuntimeConfigService([]);
    const sendEmail = vi.fn();
    const { emailDeliveryModule } = await createEmailDeliveryModuleForTest({
      sendEmail,
    });
    const emailDeliveryService = await Effect.runPromise(
      makeEmailDeliveryService({
        platformSender: {
          displayName: "Comvestec Platform",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@platform.example",
        },
        emailDelivery: emailDeliveryModule,
      }).pipe(
        Effect.provideService(RuntimeConfigModule, runtimeConfig),
        Effect.provideService(
          BillingStatePostgresRepository,
          createBillingStateRepository([]),
        ),
      ),
    );

    const missingResult = await Effect.runPromise(
      Effect.either(
        emailDeliveryService.recordProviderDeliveryEvent({
          messageId: "email-delivery:organization:org_1:missing",
          eventType: emailDeliveryProviderEventType.delivered,
          occurredAt: "2026-05-04T10:05:00.000Z",
        }),
      ),
    );

    expect(missingResult).toMatchObject({
      _tag: "Left",
      left: {
        _tag: "EmailDeliveryTrackingRecordMissingError",
        messageId: "email-delivery:organization:org_1:missing",
      },
    });
  });
});
