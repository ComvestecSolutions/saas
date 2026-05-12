import { Effect } from "effect";
import {
  emailDeliveryTemplateId,
  notificationCenterDigestRunStatus,
  notificationCenterChannel,
  notificationCenterReceiptStatus,
  platformScope,
} from "@comvestec/contracts";
import {
  buildNotificationCenterPostgresQueryable,
  makeNotificationCenterPostgresRepository,
  notificationCenterDigestCandidatesTable,
  notificationCenterDigestRunsTable,
  notificationCenterEmailPreferencesTable,
  notificationCenterEmailReceiptsTable,
  type NotificationCenterPostgresQueryable,
  type PostgresDatabase,
} from "@comvestec/modules";

type PersistedEmailReceiptRow =
  typeof notificationCenterEmailReceiptsTable.$inferSelect;
type PersistedEmailPreferenceRow =
  typeof notificationCenterEmailPreferencesTable.$inferSelect;
type PersistedDigestRunRow =
  typeof notificationCenterDigestRunsTable.$inferSelect;
type PersistedDigestCandidateRow =
  typeof notificationCenterDigestCandidatesTable.$inferSelect;

const createNotificationCenterQueryable = () => {
  const emailReceipts = new Map<string, PersistedEmailReceiptRow>();
  const emailPreferences = new Map<string, PersistedEmailPreferenceRow>();
  const digestRuns = new Map<string, PersistedDigestRunRow>();
  const digestCandidates = new Map<string, PersistedDigestCandidateRow>();

  const buildPreferenceKey = (input: {
    readonly tenantScope: string;
    readonly tenantScopeId: string;
    readonly recipient: string;
    readonly template: string;
  }) =>
    [
      input.tenantScope,
      input.tenantScopeId,
      input.recipient,
      input.template,
    ].join(":");

  const queryable: NotificationCenterPostgresQueryable = {
    createEmailReceipt: async (record) => {
      const persisted: PersistedEmailReceiptRow = {
        notificationId: record.notificationId,
        tenantScope: record.tenantScope,
        tenantScopeId: record.tenantScopeId,
        channel: record.channel,
        recipient: record.recipient,
        template: record.template,
        status: record.status ?? notificationCenterReceiptStatus.queued,
        emailDeliveryMessageId: record.emailDeliveryMessageId ?? null,
        queueReceiptId: record.queueReceiptId ?? null,
        queueFailureSummary: record.queueFailureSummary ?? null,
        suppressionReason: record.suppressionReason ?? null,
        createdAt: record.createdAt ?? new Date(),
        updatedAt: record.updatedAt ?? new Date(),
      };

      emailReceipts.set(record.notificationId, persisted);

      return persisted;
    },
    findDigestRun: async ({ digestRunId }) => digestRuns.get(digestRunId),
    listDigestCandidatesByDigestRun: async ({ digestRunId }) =>
      Array.from(digestCandidates.values()).filter(
        (candidate) => candidate.digestRunId === digestRunId,
      ),
    findEmailReceipt: async ({ notificationId }) =>
      emailReceipts.get(notificationId),
    findEmailPreference: async (reference) =>
      emailPreferences.get(
        buildPreferenceKey({
          tenantScope: reference.tenantScope,
          tenantScopeId: reference.tenantScopeId,
          recipient: reference.recipient,
          template: reference.template,
        }),
      ),
    upsertDigestCandidate: async (record) => {
      const persisted: PersistedDigestCandidateRow = {
        candidateId: record.candidateId,
        sourceNotificationId: record.sourceNotificationId,
        digestRunId: record.digestRunId,
        tenantScope: record.tenantScope,
        tenantScopeId: record.tenantScopeId,
        channel: record.channel,
        recipient: record.recipient,
        sourceTemplate: record.sourceTemplate,
        digestTemplate: record.digestTemplate,
        windowEndsAt: record.windowEndsAt ?? new Date(),
        invoiceNumber: record.invoiceNumber,
        invoiceUrl: record.invoiceUrl,
        dueAt: record.dueAt ?? new Date(),
        totalDue: record.totalDue,
        digestedAt: record.digestedAt ?? null,
        canceledAt: record.canceledAt ?? null,
        createdAt: record.createdAt ?? new Date(),
        updatedAt: record.updatedAt ?? new Date(),
      };

      digestCandidates.set(record.candidateId, persisted);

      return persisted;
    },
    upsertDigestRun: async (record) => {
      const persisted: PersistedDigestRunRow = {
        digestRunId: record.digestRunId,
        tenantScope: record.tenantScope,
        tenantScopeId: record.tenantScopeId,
        recipient: record.recipient,
        channel: record.channel,
        template: record.template,
        scheduledAt: record.scheduledAt ?? new Date(),
        startedAt: record.startedAt ?? null,
        completedAt: record.completedAt ?? null,
        status: record.status ?? notificationCenterDigestRunStatus.scheduled,
        itemCount: record.itemCount ?? 0,
        emailDeliveryMessageId: record.emailDeliveryMessageId ?? null,
        queueReceiptId: record.queueReceiptId ?? null,
        failureSummary: record.failureSummary ?? null,
        createdAt: record.createdAt ?? new Date(),
        updatedAt: record.updatedAt ?? new Date(),
      };

      digestRuns.set(record.digestRunId, persisted);

      return persisted;
    },
    upsertEmailPreference: async (record) => {
      const persisted: PersistedEmailPreferenceRow = {
        tenantScope: record.tenantScope,
        tenantScopeId: record.tenantScopeId,
        channel: record.channel,
        recipient: record.recipient,
        template: record.template,
        enabled: record.enabled ?? true,
        updatedBy: record.updatedBy,
        createdAt: record.createdAt ?? new Date(),
        updatedAt: record.updatedAt ?? new Date(),
      };

      emailPreferences.set(
        buildPreferenceKey({
          tenantScope: record.tenantScope,
          tenantScopeId: record.tenantScopeId,
          recipient: record.recipient,
          template: record.template,
        }),
        persisted,
      );

      return persisted;
    },
  };

  return {
    emailReceipts,
    emailPreferences,
    digestRuns,
    digestCandidates,
    queryable,
  };
};

describe("modules notification center persistence", () => {
  it("persists email receipts and normalizes recipients", async () => {
    const persistence = createNotificationCenterQueryable();
    const repository = await Effect.runPromise(
      makeNotificationCenterPostgresRepository(persistence.queryable),
    );

    const created = await Effect.runPromise(
      repository.createEmailReceipt({
        notificationId: "notification-center:organization:org_1:receipt_1",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        channel: notificationCenterChannel.email,
        recipient: "Customer@Example.com",
        template: emailDeliveryTemplateId.billingInvoiceReady,
        status: notificationCenterReceiptStatus.queueFailed,
        emailDeliveryMessageId: "email-delivery:organization:org_1:msg_1",
        queueFailureSummary:
          "Notification queue receipt did not match the expected schema.",
        createdAt: "2026-05-06T09:00:00.000Z",
        updatedAt: "2026-05-06T09:00:00.000Z",
      }),
    );

    expect(created).toEqual({
      notificationId: "notification-center:organization:org_1:receipt_1",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      channel: notificationCenterChannel.email,
      recipient: "customer@example.com",
      template: emailDeliveryTemplateId.billingInvoiceReady,
      status: notificationCenterReceiptStatus.queueFailed,
      emailDeliveryMessageId: "email-delivery:organization:org_1:msg_1",
      queueFailureSummary:
        "Notification queue receipt did not match the expected schema.",
      createdAt: "2026-05-06T09:00:00.000Z",
      updatedAt: "2026-05-06T09:00:00.000Z",
    });

    await expect(
      Effect.runPromise(
        repository.findEmailReceipt({
          notificationId: "notification-center:organization:org_1:receipt_1",
        }),
      ),
    ).resolves.toEqual(created);
    expect(
      persistence.emailReceipts.get(created.notificationId)?.recipient,
    ).toBe("customer@example.com");
  });

  it("persists exact email preferences and normalizes recipients", async () => {
    const persistence = createNotificationCenterQueryable();
    const repository = await Effect.runPromise(
      makeNotificationCenterPostgresRepository(persistence.queryable),
    );

    const created = await Effect.runPromise(
      repository.upsertEmailPreference({
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        channel: notificationCenterChannel.email,
        recipient: "Customer@Example.com",
        template: emailDeliveryTemplateId.billingInvoiceReady,
        enabled: false,
        updatedBy: "usr_support_1",
        createdAt: "2026-05-07T02:00:00.000Z",
        updatedAt: "2026-05-07T02:00:00.000Z",
      }),
    );

    expect(created).toEqual({
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      channel: notificationCenterChannel.email,
      recipient: "customer@example.com",
      template: emailDeliveryTemplateId.billingInvoiceReady,
      enabled: false,
      updatedBy: "usr_support_1",
      createdAt: "2026-05-07T02:00:00.000Z",
      updatedAt: "2026-05-07T02:00:00.000Z",
    });

    await expect(
      Effect.runPromise(
        repository.findEmailPreference({
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          recipient: "customer@example.com",
          template: emailDeliveryTemplateId.billingInvoiceReady,
        }),
      ),
    ).resolves.toEqual(created);
    expect(
      persistence.emailPreferences.get(
        [
          platformScope.organization,
          "org_1",
          "customer@example.com",
          emailDeliveryTemplateId.billingInvoiceReady,
        ].join(":"),
      )?.recipient,
    ).toBe("customer@example.com");
  });

  it("persists digest runs and normalizes recipients", async () => {
    const persistence = createNotificationCenterQueryable();
    const repository = await Effect.runPromise(
      makeNotificationCenterPostgresRepository(persistence.queryable),
    );

    const created = await Effect.runPromise(
      repository.upsertDigestRun({
        digestRunId:
          "notification-center:digest-run:organization:org_1:email:customer@example.com:billing.invoice-ready-digest:2026-05-08T10:15:00.000Z",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: "Customer@Example.com",
        channel: notificationCenterChannel.email,
        template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        scheduledAt: "2026-05-08T10:15:00.000Z",
        status: notificationCenterDigestRunStatus.queueFailed,
        itemCount: 2,
        emailDeliveryMessageId:
          "email-delivery:organization:org_1:digest_msg_1",
        failureSummary:
          "Notification queue receipt did not match the expected schema.",
        createdAt: "2026-05-08T10:07:00.000Z",
        updatedAt: "2026-05-08T10:15:02.000Z",
      }),
    );

    expect(created).toEqual({
      digestRunId:
        "notification-center:digest-run:organization:org_1:email:customer@example.com:billing.invoice-ready-digest:2026-05-08T10:15:00.000Z",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      recipient: "customer@example.com",
      channel: notificationCenterChannel.email,
      template: emailDeliveryTemplateId.billingInvoiceReadyDigest,
      scheduledAt: "2026-05-08T10:15:00.000Z",
      status: notificationCenterDigestRunStatus.queueFailed,
      itemCount: 2,
      emailDeliveryMessageId: "email-delivery:organization:org_1:digest_msg_1",
      failureSummary:
        "Notification queue receipt did not match the expected schema.",
      createdAt: "2026-05-08T10:07:00.000Z",
      updatedAt: "2026-05-08T10:15:02.000Z",
    });

    await expect(
      Effect.runPromise(
        repository.findDigestRun({
          digestRunId: created.digestRunId,
        }),
      ),
    ).resolves.toEqual(created);
    expect(persistence.digestRuns.get(created.digestRunId)?.recipient).toBe(
      "customer@example.com",
    );
  });

  it("persists digest candidates and lists them by digest run", async () => {
    const persistence = createNotificationCenterQueryable();
    const repository = await Effect.runPromise(
      makeNotificationCenterPostgresRepository(persistence.queryable),
    );

    const created = await Effect.runPromise(
      repository.upsertDigestCandidate({
        candidateId:
          "notification-center:organization:org_1:invoice_1:digest-candidate",
        sourceNotificationId:
          "notification-center:organization:org_1:invoice_1",
        digestRunId:
          "notification-center:digest-run:organization:org_1:email:customer@example.com:billing.invoice-ready-digest:2026-05-08T10:15:00.000Z",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        channel: notificationCenterChannel.email,
        recipient: "Customer@Example.com",
        sourceTemplate: emailDeliveryTemplateId.billingInvoiceReady,
        digestTemplate: emailDeliveryTemplateId.billingInvoiceReadyDigest,
        windowEndsAt: "2026-05-08T10:15:00.000Z",
        invoiceNumber: "inv_2026_04",
        invoiceUrl: "https://product.example.com/billing/invoices/inv_2026_04",
        dueAt: "2026-04-30T00:00:00.000Z",
        totalDue: "$120.00",
        createdAt: "2026-05-08T10:07:00.000Z",
        updatedAt: "2026-05-08T10:07:00.000Z",
      }),
    );

    expect(created).toEqual({
      candidateId:
        "notification-center:organization:org_1:invoice_1:digest-candidate",
      sourceNotificationId: "notification-center:organization:org_1:invoice_1",
      digestRunId:
        "notification-center:digest-run:organization:org_1:email:customer@example.com:billing.invoice-ready-digest:2026-05-08T10:15:00.000Z",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      channel: notificationCenterChannel.email,
      recipient: "customer@example.com",
      sourceTemplate: emailDeliveryTemplateId.billingInvoiceReady,
      digestTemplate: emailDeliveryTemplateId.billingInvoiceReadyDigest,
      windowEndsAt: "2026-05-08T10:15:00.000Z",
      invoiceNumber: "inv_2026_04",
      invoiceUrl: "https://product.example.com/billing/invoices/inv_2026_04",
      dueAt: "2026-04-30T00:00:00.000Z",
      totalDue: "$120.00",
      createdAt: "2026-05-08T10:07:00.000Z",
      updatedAt: "2026-05-08T10:07:00.000Z",
    });

    await expect(
      Effect.runPromise(
        repository.listDigestCandidatesByDigestRun({
          digestRunId: created.digestRunId,
        }),
      ),
    ).resolves.toEqual([created]);
    expect(
      persistence.digestCandidates.get(created.candidateId)?.recipient,
    ).toBe("customer@example.com");
  });

  it("exposes a concrete Drizzle queryable for notification-center email receipts", async () => {
    const insertExecute = vi.fn(async () => undefined);
    const insertValues = vi.fn(() => ({
      execute: insertExecute,
    }));
    const selectWhere = vi.fn(async () => [
      {
        notificationId:
          "notification-center:organization:org_1:receipt_queryable",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        channel: notificationCenterChannel.email,
        recipient: "customer@example.com",
        template: emailDeliveryTemplateId.billingInvoiceReady,
        status: notificationCenterReceiptStatus.queued,
        emailDeliveryMessageId:
          "email-delivery:organization:org_1:msg_queryable",
        queueReceiptId: "novu_notification_1",
        queueFailureSummary: null,
        createdAt: new Date("2026-05-06T09:00:00.000Z"),
        updatedAt: new Date("2026-05-06T09:00:00.000Z"),
      },
    ]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const database = {
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn(() => ({ from: selectFrom })),
    } as unknown as PostgresDatabase;

    const queryable = buildNotificationCenterPostgresQueryable(database);

    await expect(
      queryable.createEmailReceipt({
        notificationId:
          "notification-center:organization:org_1:receipt_queryable",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        channel: notificationCenterChannel.email,
        recipient: "customer@example.com",
        template: emailDeliveryTemplateId.billingInvoiceReady,
        status: notificationCenterReceiptStatus.queued,
        emailDeliveryMessageId:
          "email-delivery:organization:org_1:msg_queryable",
        queueReceiptId: "novu_notification_1",
        createdAt: new Date("2026-05-06T09:00:00.000Z"),
        updatedAt: new Date("2026-05-06T09:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      notificationId:
        "notification-center:organization:org_1:receipt_queryable",
      queueReceiptId: "novu_notification_1",
    });

    await expect(
      queryable.findEmailReceipt({
        notificationId:
          "notification-center:organization:org_1:receipt_queryable",
      }),
    ).resolves.toMatchObject({
      emailDeliveryMessageId: "email-delivery:organization:org_1:msg_queryable",
      status: notificationCenterReceiptStatus.queued,
    });
    expect(database.insert).toHaveBeenCalledWith(
      notificationCenterEmailReceiptsTable,
    );
    expect(database.select).toHaveBeenCalledTimes(2);
  });
});
