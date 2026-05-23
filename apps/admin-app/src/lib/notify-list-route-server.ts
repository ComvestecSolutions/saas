import { Effect } from "effect";
import { createServerFn } from "@tanstack/react-start";
import {
  notificationChannel,
  notificationDeliveryStatus,
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

/**
 * Server-function entrypoint for the spec-canonical `/r/notify`
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
export type AdminNotifyListRawInput = {
  readonly channel?: unknown;
  readonly status?: unknown;
  readonly recipientHash?: unknown;
  readonly since?: unknown;
  readonly until?: unknown;
  readonly pageSize?: unknown;
  readonly pageToken?: unknown;
};

const knownChannels = new Set<string>(Object.values(notificationChannel));
const knownStatuses = new Set<string>(
  Object.values(notificationDeliveryStatus),
);

const decodeChannel = (value: unknown): NotificationChannel | undefined =>
  typeof value === "string" && knownChannels.has(value)
    ? (value as NotificationChannel)
    : undefined;

const decodeStatus = (
  value: unknown,
): NotificationDeliveryStatus | undefined =>
  typeof value === "string" && knownStatuses.has(value)
    ? (value as NotificationDeliveryStatus)
    : undefined;

const decodeNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

const decodePageSize = (value: unknown): number => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return Math.min(value, MAX_PAGE_SIZE);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return Math.min(parsed, MAX_PAGE_SIZE);
    }
  }
  return DEFAULT_PAGE_SIZE;
};

const decodeRawInput = (
  raw: AdminNotifyListRawInput | undefined,
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
  const since = decodeNonEmptyString(safe.since);
  if (since !== undefined) {
    Object.assign(filters, { since });
  }
  const until = decodeNonEmptyString(safe.until);
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
  raw: AdminNotifyListRawInput | undefined,
): Promise<AdminNotifyListRouteData> => {
  const { loadAdminNotifyListRouteDataFromRequest } =
    await import("./notify-list-route-data");
  const decoded = decodeRawInput(raw);
  return Effect.runPromise(
    loadAdminNotifyListRouteDataFromRequest(request, environment, decoded),
  );
};

export const getAdminNotifyListData = createServerFn({ method: "GET" })
  .middleware([adminRequestServerMiddleware])
  .inputValidator((input: AdminNotifyListRawInput | undefined) => input)
  .handler(
    ({
      context,
      data,
    }: {
      readonly context: AdminRequestContext;
      readonly data: AdminNotifyListRawInput | undefined;
    }) => loadAdminNotifyListData(context.request, process.env, data),
  );
