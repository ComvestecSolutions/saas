import { Effect } from "effect";
import {
  emailDeliveryBounceType,
  emailDeliveryStatus,
  emailSuppressionReason,
  platformScope,
} from "@comvestec/contracts";
import {
  buildEmailDeliveryPostgresQueryable,
  emailDeliveryTrackingTable,
  emailRecipientSuppressionsTable,
  makeEmailDeliveryPostgresRepository,
  type EmailDeliveryPostgresQueryable,
  type PostgresDatabase,
} from "@comvestec/modules";

type PersistedTrackingRow = typeof emailDeliveryTrackingTable.$inferSelect;
type PersistedSuppressionRow =
  typeof emailRecipientSuppressionsTable.$inferSelect;

const createEmailDeliveryQueryable = () => {
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
    trackedDeliveries,
    suppressions,
    queryable,
  };
};

describe("modules email delivery persistence", () => {
  it("persists tracked deliveries and normalized recipient suppressions", async () => {
    const persistence = createEmailDeliveryQueryable();
    const repository = await Effect.runPromise(
      makeEmailDeliveryPostgresRepository(persistence.queryable),
    );

    const created = await Effect.runPromise(
      repository.createTrackedDelivery({
        messageId: "email-delivery:organization:org_1:msg_1",
        provider: "postal",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: "Customer@Example.com",
        status: emailDeliveryStatus.queued,
        template: "billing.invoice-ready",
        senderDisplayName: "Acme",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
        sentAt: "2026-05-04T10:00:00.000Z",
        lastEventAt: "2026-05-04T10:00:00.000Z",
        createdAt: "2026-05-04T10:00:00.000Z",
        updatedAt: "2026-05-04T10:00:00.000Z",
      }),
    );

    expect(created.recipient).toBe("customer@example.com");

    const updated = await Effect.runPromise(
      repository.updateTrackedDelivery({
        currentRecord: created,
        nextRecord: {
          ...created,
          status: emailDeliveryStatus.bounced,
          bounceType: emailDeliveryBounceType.hard,
          lastEventAt: "2026-05-04T10:05:00.000Z",
          updatedAt: "2026-05-04T10:05:00.000Z",
        },
      }),
    );

    expect(updated).toMatchObject({
      status: emailDeliveryStatus.bounced,
      bounceType: emailDeliveryBounceType.hard,
    });

    await Effect.runPromise(
      repository.upsertRecipientSuppression({
        nextRecord: {
          suppressionId: "email-recipient-suppression:customer@example.com",
          recipient: "Customer@Example.com",
          reason: emailSuppressionReason.bounced,
          sourceMessageId: created.messageId,
          bounceType: emailDeliveryBounceType.hard,
          suppressedAt: "2026-05-04T10:05:00.000Z",
          createdAt: "2026-05-04T10:05:00.000Z",
          updatedAt: "2026-05-04T10:05:00.000Z",
        },
      }),
    );

    const suppression = await Effect.runPromise(
      repository.findRecipientSuppression({
        recipient: "CUSTOMER@example.com",
      }),
    );

    expect(suppression).toEqual({
      suppressionId: "email-recipient-suppression:customer@example.com",
      recipient: "customer@example.com",
      reason: emailSuppressionReason.bounced,
      sourceMessageId: created.messageId,
      bounceType: emailDeliveryBounceType.hard,
      suppressedAt: "2026-05-04T10:05:00.000Z",
      createdAt: "2026-05-04T10:05:00.000Z",
      updatedAt: "2026-05-04T10:05:00.000Z",
    });
    expect(
      persistence.trackedDeliveries.get(created.messageId)?.recipient,
    ).toBe("customer@example.com");
  });

  it("keeps the newer tracked delivery when a stale snapshot tries to overwrite it", async () => {
    const persistence = createEmailDeliveryQueryable();
    const repository = await Effect.runPromise(
      makeEmailDeliveryPostgresRepository(persistence.queryable),
    );

    const created = await Effect.runPromise(
      repository.createTrackedDelivery({
        messageId: "email-delivery:organization:org_1:msg_2",
        provider: "postal",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: "customer@example.com",
        status: emailDeliveryStatus.queued,
        senderDisplayName: "Acme",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
        sentAt: "2026-05-04T10:00:00.000Z",
        lastEventAt: "2026-05-04T10:00:00.000Z",
        createdAt: "2026-05-04T10:00:00.000Z",
        updatedAt: "2026-05-04T10:00:00.000Z",
      }),
    );

    const newerUpdate = await Effect.runPromise(
      repository.updateTrackedDelivery({
        currentRecord: created,
        nextRecord: {
          ...created,
          status: emailDeliveryStatus.complained,
          lastEventAt: "2026-05-04T10:07:00.000Z",
          updatedAt: "2026-05-04T10:07:00.000Z",
        },
      }),
    );

    const staleUpdate = await Effect.runPromise(
      repository.updateTrackedDelivery({
        currentRecord: created,
        nextRecord: {
          ...created,
          status: emailDeliveryStatus.bounced,
          bounceType: emailDeliveryBounceType.hard,
          lastEventAt: "2026-05-04T10:05:00.000Z",
          updatedAt: "2026-05-04T10:05:00.000Z",
        },
      }),
    );

    expect(newerUpdate).toMatchObject({
      status: emailDeliveryStatus.complained,
      lastEventAt: "2026-05-04T10:07:00.000Z",
    });
    expect(staleUpdate).toMatchObject({
      status: emailDeliveryStatus.complained,
      lastEventAt: "2026-05-04T10:07:00.000Z",
    });
    expect(staleUpdate?.bounceType).toBeUndefined();
  });

  it("keeps the newer recipient suppression when an older event arrives later for the same recipient", async () => {
    const persistence = createEmailDeliveryQueryable();
    const repository = await Effect.runPromise(
      makeEmailDeliveryPostgresRepository(persistence.queryable),
    );

    const newerComplaint = await Effect.runPromise(
      repository.upsertRecipientSuppression({
        nextRecord: {
          suppressionId: "email-recipient-suppression:customer@example.com",
          recipient: "customer@example.com",
          reason: emailSuppressionReason.complained,
          sourceMessageId: "email-delivery:organization:org_1:msg_newer",
          suppressedAt: "2026-05-04T10:07:00.000Z",
          createdAt: "2026-05-04T10:07:00.000Z",
          updatedAt: "2026-05-04T10:07:00.000Z",
        },
      }),
    );

    const staleBounce = await Effect.runPromise(
      repository.upsertRecipientSuppression({
        nextRecord: {
          suppressionId: "email-recipient-suppression:customer@example.com",
          recipient: "customer@example.com",
          reason: emailSuppressionReason.bounced,
          sourceMessageId: "email-delivery:organization:org_1:msg_older",
          bounceType: emailDeliveryBounceType.hard,
          suppressedAt: "2026-05-04T10:05:00.000Z",
          createdAt: "2026-05-04T10:05:00.000Z",
          updatedAt: "2026-05-04T10:05:00.000Z",
        },
      }),
    );

    expect(newerComplaint).toMatchObject({
      reason: emailSuppressionReason.complained,
      suppressedAt: "2026-05-04T10:07:00.000Z",
    });
    expect(staleBounce).toMatchObject({
      reason: emailSuppressionReason.complained,
      sourceMessageId: "email-delivery:organization:org_1:msg_newer",
      suppressedAt: "2026-05-04T10:07:00.000Z",
    });
    expect(staleBounce.bounceType).toBeUndefined();
  });

  it("exposes a concrete Drizzle queryable for tracked-delivery CAS and monotonic suppression upserts", async () => {
    const insertExecute = vi.fn(async () => undefined);
    const onConflictDoUpdate = vi.fn(() => ({
      execute: insertExecute,
    }));
    const insertValues = vi.fn(() => ({
      execute: insertExecute,
      onConflictDoUpdate,
    }));
    const updateReturning = vi.fn(async () => [
      {
        messageId: "email-delivery:organization:org_1:msg_queryable",
        provider: "postal",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: "customer@example.com",
        status: emailDeliveryStatus.bounced,
        template: null,
        senderDisplayName: "Acme",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
        sentAt: new Date("2026-05-04T10:00:00.000Z"),
        lastEventAt: new Date("2026-05-04T10:05:00.000Z"),
        bounceType: emailDeliveryBounceType.hard,
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
        updatedAt: new Date("2026-05-04T10:05:00.000Z"),
      },
    ]);
    const selectWhere = vi
      .fn()
      .mockResolvedValueOnce([
        {
          messageId: "email-delivery:organization:org_1:msg_queryable",
          provider: "postal",
          tenantScope: platformScope.organization,
          tenantScopeId: "org_1",
          recipient: "customer@example.com",
          status: emailDeliveryStatus.queued,
          template: null,
          senderDisplayName: "Acme",
          fromEmail: "support@platform.example",
          replyToEmail: "reply@acme.example",
          sentAt: new Date("2026-05-04T10:00:00.000Z"),
          lastEventAt: new Date("2026-05-04T10:00:00.000Z"),
          bounceType: null,
          createdAt: new Date("2026-05-04T10:00:00.000Z"),
          updatedAt: new Date("2026-05-04T10:00:00.000Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          suppressionId: "email-recipient-suppression:customer@example.com",
          recipient: "customer@example.com",
          reason: emailSuppressionReason.complained,
          sourceMessageId: "email-delivery:organization:org_1:msg_queryable",
          bounceType: null,
          suppressedAt: new Date("2026-05-04T10:07:00.000Z"),
          createdAt: new Date("2026-05-04T10:07:00.000Z"),
          updatedAt: new Date("2026-05-04T10:07:00.000Z"),
        },
      ]);
    const buildInsert = () => ({
      values: insertValues,
    });
    const buildUpdate = () => ({
      set: () => ({
        where: () => ({
          returning: updateReturning,
        }),
      }),
    });
    const database: PostgresDatabase = {
      insert: (() => buildInsert()) as PostgresDatabase["insert"],
      update: (() => buildUpdate()) as PostgresDatabase["update"],
      select: () => ({
        from: () => ({
          where: selectWhere,
        }),
      }),
      transaction: async (callback) =>
        callback({
          insert: (() => buildInsert()) as PostgresDatabase["insert"],
          update: (() => buildUpdate()) as PostgresDatabase["update"],
        }),
    };
    const queryable = buildEmailDeliveryPostgresQueryable(database);

    const created = await queryable.createTrackedDelivery({
      messageId: "email-delivery:organization:org_1:msg_queryable",
      provider: "postal",
      tenantScope: platformScope.organization,
      tenantScopeId: "org_1",
      recipient: "customer@example.com",
      status: emailDeliveryStatus.queued,
      template: null,
      senderDisplayName: "Acme",
      fromEmail: "support@platform.example",
      replyToEmail: "reply@acme.example",
      sentAt: new Date("2026-05-04T10:00:00.000Z"),
      lastEventAt: new Date("2026-05-04T10:00:00.000Z"),
      bounceType: null,
      createdAt: new Date("2026-05-04T10:00:00.000Z"),
      updatedAt: new Date("2026-05-04T10:00:00.000Z"),
    });

    const updated = await queryable.updateTrackedDelivery({
      currentRecord: {
        ...created,
        template: created.template,
      },
      nextRecord: {
        ...created,
        status: emailDeliveryStatus.bounced,
        lastEventAt: new Date("2026-05-04T10:05:00.000Z"),
        bounceType: emailDeliveryBounceType.hard,
        updatedAt: new Date("2026-05-04T10:05:00.000Z"),
      },
    });

    const suppression = await queryable.upsertRecipientSuppression({
      nextRecord: {
        suppressionId: "email-recipient-suppression:customer@example.com",
        recipient: "customer@example.com",
        reason: emailSuppressionReason.complained,
        sourceMessageId: "email-delivery:organization:org_1:msg_queryable",
        bounceType: null,
        suppressedAt: new Date("2026-05-04T10:07:00.000Z"),
        createdAt: new Date("2026-05-04T10:07:00.000Z"),
        updatedAt: new Date("2026-05-04T10:07:00.000Z"),
      },
    });

    expect(created.messageId).toBe(
      "email-delivery:organization:org_1:msg_queryable",
    );
    expect(updated?.status).toBe(emailDeliveryStatus.bounced);
    expect(suppression.reason).toBe(emailSuppressionReason.complained);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(updateReturning).toHaveBeenCalledTimes(1);
  });

  it("returns the current tracked-delivery row on a Drizzle CAS miss instead of reporting a false absence", async () => {
    const updateReturning = vi.fn(async () => []);
    const selectWhere = vi.fn().mockResolvedValue([
      {
        messageId: "email-delivery:organization:org_1:msg_queryable_stale",
        provider: "postal",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: "customer@example.com",
        status: emailDeliveryStatus.complained,
        template: null,
        senderDisplayName: "Acme",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
        sentAt: new Date("2026-05-04T10:00:00.000Z"),
        lastEventAt: new Date("2026-05-04T10:07:00.000Z"),
        bounceType: null,
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
        updatedAt: new Date("2026-05-04T10:07:00.000Z"),
      },
    ]);
    const database: PostgresDatabase = {
      insert: (() => ({
        values: () => ({
          execute: async () => undefined,
          onConflictDoUpdate: () => ({ execute: async () => undefined }),
        }),
      })) as PostgresDatabase["insert"],
      update: (() => ({
        set: () => ({
          where: () => ({
            returning: updateReturning,
          }),
        }),
      })) as PostgresDatabase["update"],
      select: () => ({
        from: () => ({
          where: selectWhere,
        }),
      }),
      transaction: async (callback) =>
        callback({
          insert: (() => ({
            values: () => ({
              execute: async () => undefined,
              onConflictDoUpdate: () => ({ execute: async () => undefined }),
            }),
          })) as PostgresDatabase["insert"],
          update: (() => ({
            set: () => ({
              where: () => ({
                returning: updateReturning,
              }),
            }),
          })) as PostgresDatabase["update"],
        }),
    };
    const queryable = buildEmailDeliveryPostgresQueryable(database);

    const currentRow = await queryable.updateTrackedDelivery({
      currentRecord: {
        messageId: "email-delivery:organization:org_1:msg_queryable_stale",
        provider: "postal",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: "customer@example.com",
        status: emailDeliveryStatus.queued,
        template: null,
        senderDisplayName: "Acme",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
        sentAt: new Date("2026-05-04T10:00:00.000Z"),
        lastEventAt: new Date("2026-05-04T10:00:00.000Z"),
        bounceType: null,
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
        updatedAt: new Date("2026-05-04T10:00:00.000Z"),
      },
      nextRecord: {
        messageId: "email-delivery:organization:org_1:msg_queryable_stale",
        provider: "postal",
        tenantScope: platformScope.organization,
        tenantScopeId: "org_1",
        recipient: "customer@example.com",
        status: emailDeliveryStatus.bounced,
        template: null,
        senderDisplayName: "Acme",
        fromEmail: "support@platform.example",
        replyToEmail: "reply@acme.example",
        sentAt: new Date("2026-05-04T10:00:00.000Z"),
        lastEventAt: new Date("2026-05-04T10:05:00.000Z"),
        bounceType: emailDeliveryBounceType.hard,
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
        updatedAt: new Date("2026-05-04T10:05:00.000Z"),
      },
    });

    expect(currentRow).toMatchObject({
      status: emailDeliveryStatus.complained,
      lastEventAt: new Date("2026-05-04T10:07:00.000Z"),
    });
    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(selectWhere).toHaveBeenCalledTimes(1);
  });
});
