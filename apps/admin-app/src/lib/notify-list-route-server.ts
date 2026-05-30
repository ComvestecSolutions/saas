import { Effect, Schema } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  IsoTimestampSchema,
  NotificationChannelSchema,
  NotificationDeliveryStatusSchema,
  type NotificationChannel,
  type NotificationCenterAdminListFilters,
  type NotificationDeliveryStatus,
} from "@comvestec/contracts";
import type {
  AdminNotifyListInput,
  AdminNotifyListRouteData,
} from "./notify-list-route-data";
import {
  adminRequestServerMiddleware,
  type AdminRequestContext,
} from "./admin-request-server-middleware";
import { decodeSchemaOrUndefined, decodeSyncBoundary } from "./effect-boundary";

/**
 * Server-function entrypoint for the spec-canonical `/desk/notify`
 * Notification Center v2 list surface (admin-app implementation
 * plan §8.16 + §11 — Phase 6 commit 6b). Decodes the loader
 * input at the framework boundary and runs the route-data
 * Effect on the server. No Request/Response shaping lives here.
 *
 * URL filters are narrowed through the canonical
 * `notificationChannel.*` + `notificationDeliveryStatus.*`
 * vocabularies so no raw literal leaks past the loader
 * boundary; bad values are dropped to undefined rather than
 * thrown so the page renders an unfiltered list.
 */
const AdminNotifyListRawInputSchema = Schema.Union(
  Schema.Undefined,
  Schema.Struct({
    channel: Schema.optional(Schema.Unknown),
    status: Schema.optional(Schema.Unknown),
    recipientHash: Schema.optional(Schema.Unknown),
    since: Schema.optional(Schema.Unknown),
    until: Schema.optional(Schema.Unknown),
    pageSize: Schema.optional(Schema.Unknown),
    pageToken: Schema.optional(Schema.Unknown),
  }),
);

type AdminNotifyListRawInput = Schema.Schema.Type<
  typeof AdminNotifyListRawInputSchema
>;

const decodeAdminNotifyListRawInput = decodeSyncBoundary(
  AdminNotifyListRawInputSchema,
);
const decodeChannel = decodeSchemaOrUndefined(NotificationChannelSchema);
const decodeStatus = decodeSchemaOrUndefined(NotificationDeliveryStatusSchema);
const decodeNonEmptyString = decodeSchemaOrUndefined(Schema.NonEmptyString);
const decodeIsoTimestamp = decodeSchemaOrUndefined(IsoTimestampSchema);
const decodePositiveInt = decodeSchemaOrUndefined(
  Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
);

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

const decodePageSize = (value: unknown): number => {
  const numericPageSize = decodePositiveInt(value);

  if (numericPageSize !== undefined) {
    return Math.min(numericPageSize, MAX_PAGE_SIZE);
  }

  const stringPageSize = decodeNonEmptyString(value);

  if (stringPageSize !== undefined) {
    const parsed = Number.parseInt(stringPageSize, 10);

    if (Number.isInteger(parsed) && parsed > 0) {
      return Math.min(parsed, MAX_PAGE_SIZE);
    }
  }

  return DEFAULT_PAGE_SIZE;
};

const normalizeAdminNotifyListInput = (
  raw: AdminNotifyListRawInput,
): AdminNotifyListInput => {
  const safe = raw ?? {};
  const filters: NotificationCenterAdminListFilters = {};
  const channel = decodeChannel(safe.channel);
  if (channel !== undefined) {
    Object.assign(filters, { channel });
  }
  const status = decodeStatus(safe.status);
  if (status !== undefined) {
    Object.assign(filters, { status });
  }
  const recipientHash = decodeNonEmptyString(safe.recipientHash);
  if (recipientHash !== undefined) {
    Object.assign(filters, { recipientHash });
  }
  const since = decodeIsoTimestamp(safe.since);
  if (since !== undefined) {
    Object.assign(filters, { since });
  }
  const until = decodeIsoTimestamp(safe.until);
  if (until !== undefined) {
    Object.assign(filters, { until });
  }
  const pageToken = decodeNonEmptyString(safe.pageToken);
  return {
    filters,
    pageSize: decodePageSize(safe.pageSize),
    ...(pageToken === undefined ? {} : { pageToken }),
  };
};

const loadAdminNotifyListData = async (
  request: Request,
  environment: unknown,
  input: AdminNotifyListInput,
): Promise<AdminNotifyListRouteData> => {
  const { loadAdminNotifyListRouteDataFromRequest } =
    await import("./notify-list-route-data");

  return Effect.runPromise(
    loadAdminNotifyListRouteDataFromRequest(request, environment, input),
  );
};

export const getAdminNotifyListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: unknown) =>
    normalizeAdminNotifyListInput(decodeAdminNotifyListRawInput(input)),
  )
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminNotifyListInput;
    }) => loadAdminNotifyListData(context.request, process.env, data),
  );
