import { Effect, Schema } from "effect";
import {
  platformScope,
  type RequestContext,
  tenantInvitationStatus,
  TenantInvitationViewListSchema,
  TenantInvitationViewSchema,
} from "@comvestec/contracts";
import { type PersistTenantInvitationRecord } from "@comvestec/modules";

const decodeTenantInvitationView = Schema.decodeUnknown(
  TenantInvitationViewSchema,
);

const decodeTenantInvitationViewList = Schema.decodeUnknown(
  TenantInvitationViewListSchema,
);

const encodeBytesAsHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const sortTenantInvitationRecords = (
  records: readonly PersistTenantInvitationRecord[],
) =>
  [...records].sort((left, right) => {
    const rightIssuedAt = Date.parse(right.issuedAt ?? right.expiresAt);
    const leftIssuedAt = Date.parse(left.issuedAt ?? left.expiresAt);

    if (leftIssuedAt !== rightIssuedAt) {
      return rightIssuedAt - leftIssuedAt;
    }

    return left.invitationId.localeCompare(right.invitationId);
  });

export const createTenantInvitationToken = () =>
  `tmiv_${encodeBytesAsHex(crypto.getRandomValues(new Uint8Array(32)))}`;

export const hashTenantInvitationToken = (token: string) =>
  Effect.tryPromise({
    try: async () => {
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
      );

      return encodeBytesAsHex(digest);
    },
    catch: (cause) => cause,
  }).pipe(Effect.orDie);

export const buildTenantInvitationView = (input: {
  readonly record: PersistTenantInvitationRecord;
  readonly now: Date;
}) => {
  const status =
    input.record.status === "revoked"
      ? tenantInvitationStatus.revoked
      : input.record.status === "redeemed" ||
          input.record.redeemedAt !== undefined
        ? tenantInvitationStatus.redeemed
        : new Date(input.record.expiresAt).getTime() <= input.now.getTime()
          ? tenantInvitationStatus.expired
          : tenantInvitationStatus.pending;

  return decodeTenantInvitationView({
    invitationId: input.record.invitationId,
    recipientEmail: input.record.recipientEmail,
    relation: input.record.relation,
    status,
    issuedBy: input.record.issuedBy,
    issuedAt:
      input.record.issuedAt ?? new Date(input.record.expiresAt).toISOString(),
    expiresAt: input.record.expiresAt,
    ...(input.record.redeemedAt === undefined
      ? {}
      : { redeemedAt: input.record.redeemedAt }),
    ...(input.record.redeemedBy === undefined
      ? {}
      : { redeemedBy: input.record.redeemedBy }),
    ...(input.record.revokedAt === undefined
      ? {}
      : { revokedAt: input.record.revokedAt }),
    ...(input.record.revokedBy === undefined
      ? {}
      : { revokedBy: input.record.revokedBy }),
  });
};

export const buildTenantInvitationViewList = (input: {
  readonly records: readonly PersistTenantInvitationRecord[];
  readonly now: Date;
}) =>
  Effect.forEach(
    sortTenantInvitationRecords(input.records),
    (record) => buildTenantInvitationView({ record, now: input.now }),
    { concurrency: 1 },
  ).pipe(Effect.flatMap((views) => decodeTenantInvitationViewList(views)));

export const buildInvitationTargetTenantContext = (input: {
  readonly scope: RequestContext["tenant"]["scope"];
  readonly scopeId: string;
}): RequestContext["tenant"] => ({
  scope: input.scope,
  scopeId: input.scopeId,
  ...(input.scope === platformScope.enterprise
    ? { enterpriseId: input.scopeId }
    : {}),
  ...(input.scope === platformScope.organization
    ? { organizationId: input.scopeId }
    : {}),
  ...(input.scope === platformScope.individual
    ? { individualId: input.scopeId }
    : {}),
});
