/**
 * Vendor-health aggregator platform service (admin-app
 * implementation plan §9 item 9 — read-only,
 * platform/support-operator-only).
 *
 * Composes the {@link AuditLogModule} with an injected
 * {@link VendorHealthcheckPort} (Context.Tag — tests inject
 * directly; the env-bound default Layer wraps EVERY platform
 * adapter that exposes a `healthcheck` Effect identified by
 * `platformAdapterServiceName.*`). NO raw `serviceName` literal
 * is allowed past this boundary — every per-source entry decodes
 * its `serviceName` through the canonical
 * `PlatformAdapterServiceNameSchema`.
 *
 * Owner-locked invariants enforced here (NOT in the HTTP transport,
 * NOT in the port implementation):
 *
 *   - **Read-only surface**: the aggregator exposes ONLY
 *     `getAggregate`. There is no mutation surface.
 *   - **Operator-only authz**: snapshot read requires
 *     `actorType.platformOperator` OR `actorType.supportOperator`;
 *     anonymous actors are rejected with
 *     {@link VendorHealthAggregatorUnauthorized}; missing
 *     `actorId` surfaces as
 *     {@link VendorHealthAggregatorMissingActorIdentity}.
 *   - **Aggregate v2 partial-failure semantics**: each per-source
 *     `Effect` is wrapped in `Effect.either`; per-source failures
 *     degrade that row to `status: 'unavailable'` and populate a
 *     matching `partialFailures` entry. The aggregator only fails
 *     with {@link VendorHealthAggregatorAllSourcesFailedError}
 *     when EVERY branch is `Left`.
 *   - **Audit emission**: every successful aggregate (even a
 *     partial one) appends ONE event keyed by
 *     `platformModuleId.vendorHealthAggregator` +
 *     `vendorHealthAggregatorAuditAction.snapshotComputed` +
 *     `reasonCatalogId.vendorHealthAggregatorRead`. Audit emission
 *     is suppressed when ALL sources fail (the aggregate itself
 *     fails, so there is no successful snapshot to audit).
 *   - **Bounded in-memory snapshot cache**: a single key
 *     (`global`) fronts the aggregate read path, bounded by
 *     `cacheMaxSize` with insertion-order eviction so the cache
 *     stays bounded even under hostile config (`cacheMaxSize=1`
 *     still functions). Freshness is reconciled via
 *     `isAggregateFresh(generatedAt, now, snapshotCacheTtlSeconds)`;
 *     stale entries trigger a live recompute against every
 *     upstream healthcheck.
 *   - **Latency capture**: each per-adapter Effect is timed via
 *     `Date.now()` before / after by the default port Layer so
 *     `entries[i].latencyMs` reflects real wall-clock latency.
 *
 * Runtime config: `runVendorHealthAggregatorFromEnvironment`
 * decodes `POSTGRES_URL` (for audit log persistence) +
 * 2 new `VENDOR_HEALTH_AGGREGATOR_*` keys +
 * every adapter credential env it enumerates (`KEYCLOAK_*`,
 * `POLAR_API_BASE_URL` + `POLAR_ACCESS_TOKEN`, `OPENMETER_API_*`, `UNLEASH_*`, `NOVU_API_*`,
 * `POSTAL_API_*`, `ERROR_TRACKING_DSN`, `OPENPANEL_*`,
 * `OTEL_EXPORTER_OTLP_ENDPOINT`, `GRAFANA_BASE_URL`,
 * `MEILISEARCH_*`, `CONVEX_SELF_HOSTED_*`, `VALKEY_URL`,
 * `KETO_READ_URL` / `KETO_WRITE_URL`) at the boundary with NO
 * local fallbacks. Operators MUST set every key.
 */
import { Context, Effect, Either, Layer, ParseResult, Schema } from "effect";
import { and, desc, eq } from "drizzle-orm";
import {
  actorType,
  platformAdapterServiceName,
  platformModuleId,
  reasonCatalogId,
  RequestContextSchema,
  vendorHealthAggregatorAuditAction,
  type PlatformAdapterServiceName,
  type RequestContext,
  type VendorHealthAggregateEntry,
  type VendorHealthAggregatePartialFailure,
  type VendorHealthAggregateProjection,
} from "@comvestec/contracts";
import {
  auditLogEventsTable,
  AuditLogModule,
  AuditLogPostgresRepository,
  isAggregateFresh,
  makeAuditLogModule,
  makeAuditLogPostgresRepository,
  type AuditLogModuleError,
  type AuditLogModuleService,
  type AuditLogPostgresQueryable,
} from "@comvestec/modules";
import {
  makeConvexAdapter,
  makeGlitchtipAdapter,
  makeKeycloakAdapter,
  makeMeilisearchAdapter,
  makeNovuAdapter,
  makeObservabilityAdapter,
  makeOpenmeterAdapter,
  makeOpenPanelAdapter,
  makeOryKetoAdapter,
  makePolarAdapter,
  makePostalAdapter,
  makePostgresAdapter,
  makeUnleashAdapter,
  makeValkeyAdapter,
  type PostgresAdapterConnectionError,
} from "../../adapters";
import { buildWriteDatabase } from "../postgres-write-database";

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

type Operation = "getAggregate";

export class VendorHealthAggregatorUnauthorized {
  readonly _tag = "VendorHealthAggregatorUnauthorized" as const;
  constructor(
    readonly args: {
      readonly operation: Operation;
      readonly requestingActorId?: string;
      readonly requestingActorType: string;
    },
  ) {}
}

export class VendorHealthAggregatorMissingActorIdentity {
  readonly _tag = "VendorHealthAggregatorMissingActorIdentity" as const;
  constructor(readonly args: { readonly operation: Operation }) {}
}

export class VendorHealthAggregatorAllSourcesFailedError {
  readonly _tag = "VendorHealthAggregatorAllSourcesFailedError" as const;
  constructor(
    readonly args: {
      readonly failures: ReadonlyArray<VendorHealthAggregatePartialFailure>;
    },
  ) {}
}

export type VendorHealthAggregatorServiceError =
  | ParseResult.ParseError
  | AuditLogModuleError
  | VendorHealthAggregatorUnauthorized
  | VendorHealthAggregatorMissingActorIdentity
  | VendorHealthAggregatorAllSourcesFailedError;

// ---------------------------------------------------------------------------
// Vendor healthcheck port (Context.Tag)
// ---------------------------------------------------------------------------

/**
 * Single per-adapter healthcheck attempt produced by
 * {@link VendorHealthcheckPort}. The port owns success-path entry
 * construction (`status: 'healthy'`, latency, optional version)
 * because only the port knows the underlying adapter's
 * `healthcheck` Effect; the aggregator service owns failure-path
 * normalization (degrade to `unavailable` + populate
 * `partialFailures`) so the aggregate v2 contract stays in one
 * place.
 */
export type VendorHealthcheckPortEntry = {
  readonly serviceName: PlatformAdapterServiceName;
  readonly result: Effect.Effect<VendorHealthAggregateEntry, unknown>;
};

export type VendorHealthcheckPortService = {
  readonly checkAll: (
    now: () => Date,
  ) => ReadonlyArray<VendorHealthcheckPortEntry>;
};

export class VendorHealthcheckPort extends Context.Tag("VendorHealthcheckPort")<
  VendorHealthcheckPort,
  VendorHealthcheckPortService
>() {}

// ---------------------------------------------------------------------------
// Service input
// ---------------------------------------------------------------------------

export const GetVendorHealthAggregateInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
});

export type GetVendorHealthAggregateInput = Schema.Schema.Type<
  typeof GetVendorHealthAggregateInputSchema
>;

const decodeAggregateInput = Schema.decodeUnknown(
  GetVendorHealthAggregateInputSchema,
);

// ---------------------------------------------------------------------------
// Authz helpers
// ---------------------------------------------------------------------------

const allowedAggregateReaderActorTypes: ReadonlySet<string> = new Set([
  actorType.platformOperator,
  actorType.supportOperator,
]);

const requireOperatorActor = (
  requestContext: RequestContext,
  operation: Operation,
) =>
  Effect.gen(function* () {
    if (requestContext.actorId === undefined) {
      return yield* Effect.fail(
        new VendorHealthAggregatorMissingActorIdentity({ operation }),
      );
    }
    if (!allowedAggregateReaderActorTypes.has(requestContext.actorType)) {
      return yield* Effect.fail(
        new VendorHealthAggregatorUnauthorized({
          operation,
          requestingActorId: requestContext.actorId,
          requestingActorType: requestContext.actorType,
        }),
      );
    }
    return requestContext.actorId;
  });

// ---------------------------------------------------------------------------
// Bounded single-key snapshot cache (insertion-order eviction)
// ---------------------------------------------------------------------------

type AggregateCache = {
  readonly get: (key: string) => VendorHealthAggregateProjection | undefined;
  readonly set: (
    key: string,
    snapshot: VendorHealthAggregateProjection,
  ) => void;
  readonly delete: (key: string) => void;
  readonly size: () => number;
};

const createAggregateCache = (maxSize: number): AggregateCache => {
  const store = new Map<string, VendorHealthAggregateProjection>();
  return {
    get: (key) => store.get(key),
    set: (key, snapshot) => {
      if (store.has(key)) {
        store.delete(key);
      } else if (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) {
          store.delete(oldest);
        }
      }
      store.set(key, snapshot);
    },
    delete: (key) => {
      store.delete(key);
    },
    size: () => store.size,
  };
};

const aggregateCacheKey = "global" as const;

// ---------------------------------------------------------------------------
// Service tag + impl
// ---------------------------------------------------------------------------

export type VendorHealthAggregateView = {
  readonly aggregate: VendorHealthAggregateProjection;
  readonly isFresh: boolean;
};

export type VendorHealthAggregatorServiceImpl = {
  readonly getAggregate: (
    input: GetVendorHealthAggregateInput,
  ) => Effect.Effect<
    VendorHealthAggregateView,
    VendorHealthAggregatorServiceError
  >;
};

export class VendorHealthAggregatorService extends Context.Tag(
  "VendorHealthAggregatorService",
)<VendorHealthAggregatorService, VendorHealthAggregatorServiceImpl>() {}

export type VendorHealthAggregatorRuntimeBounds = {
  readonly snapshotCacheTtlSeconds: number;
  readonly cacheMaxSize: number;
};

export type VendorHealthAggregatorServiceDependencies = {
  readonly auditLog: AuditLogModuleService;
  readonly vendorHealthcheckPort: VendorHealthcheckPortService;
  readonly bounds: VendorHealthAggregatorRuntimeBounds;
  readonly now?: () => Date;
  readonly generateCorrelationId?: () => string;
};

const defaultCorrelationId = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID !== undefined) {
    return cryptoApi.randomUUID();
  }
  throw new Error(
    "globalThis.crypto.randomUUID is required to generate vendor-health-aggregator correlation ids",
  );
};

const readFailureStatus = (cause: unknown): number | undefined =>
  typeof cause === "object" &&
  cause !== null &&
  "status" in cause &&
  typeof cause.status === "number"
    ? cause.status
    : undefined;

const readFailureBody = (cause: unknown): string | undefined =>
  typeof cause === "object" &&
  cause !== null &&
  "body" in cause &&
  typeof cause.body === "string"
    ? cause.body
    : undefined;

const parseFailureBodyMessage = (body: string): string | undefined => {
  try {
    const parsed = JSON.parse(body) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }

    if ("error" in parsed && typeof parsed.error === "string") {
      return parsed.error;
    }

    if ("message" in parsed && typeof parsed.message === "string") {
      return parsed.message;
    }
  } catch {
    return body.length > 0 ? body : undefined;
  }

  return undefined;
};

const buildPolarFailureReason = (cause: {
  readonly status?: number;
  readonly body?: string;
}): string | undefined => {
  const bodyMessage =
    cause.body === undefined ? undefined : parseFailureBodyMessage(cause.body);

  if (cause.status === 401 && bodyMessage === "invalid_token") {
    return "Polar access token rejected (invalid_token). Refresh POLAR_ACCESS_TOKEN or align it with POLAR_API_BASE_URL.";
  }

  if (cause.status !== undefined && bodyMessage !== undefined) {
    return `Polar request failed (HTTP ${cause.status}): ${bodyMessage}`;
  }

  if (cause.status !== undefined) {
    return `Polar request failed (HTTP ${cause.status}).`;
  }

  if (bodyMessage !== undefined) {
    return `Polar request failed: ${bodyMessage}`;
  }

  return undefined;
};

const buildTaggedFailureReason = (cause: {
  readonly _tag: string;
  readonly status?: number;
  readonly body?: string;
}): string => {
  if (cause._tag === "PolarAdapterRequestError") {
    const polarReason = buildPolarFailureReason(cause);

    if (polarReason !== undefined) {
      return polarReason;
    }
  }

  const parts = [
    cause._tag,
    cause.status === undefined ? undefined : `HTTP ${cause.status}`,
    cause.body === undefined ? undefined : parseFailureBodyMessage(cause.body),
  ].filter((value): value is string => value !== undefined && value.length > 0);

  return parts.length > 0 ? parts.join(" · ") : cause._tag;
};

const buildPartialFailureReason = (cause: unknown): string => {
  if (cause === null || cause === undefined) {
    return "unknown vendor-health source failure";
  }
  if (typeof cause === "string") {
    return cause.length === 0 ? "unknown vendor-health source failure" : cause;
  }
  if (
    typeof cause === "object" &&
    "_tag" in cause &&
    typeof (cause as { readonly _tag?: unknown })._tag === "string"
  ) {
    const status = readFailureStatus(cause);
    const body = readFailureBody(cause);

    return buildTaggedFailureReason({
      _tag: (cause as { readonly _tag: string })._tag,
      ...(status === undefined ? {} : { status }),
      ...(body === undefined ? {} : { body }),
    });
  }
  if (cause instanceof Error) {
    return cause.message.length === 0 ? cause.name : cause.message;
  }
  return "unknown vendor-health source failure";
};

const buildUnavailableEntry = (
  serviceName: PlatformAdapterServiceName,
  cause: unknown,
  lastCheckedAt: string,
): VendorHealthAggregateEntry => ({
  serviceName,
  status: "unavailable",
  latencyMs: 0,
  lastCheckedAt,
  message: buildPartialFailureReason(cause),
});

export const makeVendorHealthAggregatorService = (
  deps: VendorHealthAggregatorServiceDependencies,
): VendorHealthAggregatorServiceImpl => {
  const { auditLog, vendorHealthcheckPort, bounds } = deps;
  const nowFn = deps.now ?? (() => new Date());
  const correlationIdFn = deps.generateCorrelationId ?? defaultCorrelationId;
  const cache = createAggregateCache(Math.max(1, bounds.cacheMaxSize));

  const getAggregate: VendorHealthAggregatorServiceImpl["getAggregate"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const decoded = yield* decodeAggregateInput(input);
      yield* requireOperatorActor(decoded.requestContext, "getAggregate");

      const cached = cache.get(aggregateCacheKey);
      if (cached !== undefined) {
        const fresh = isAggregateFresh(
          cached.generatedAt,
          nowFn().getTime(),
          bounds.snapshotCacheTtlSeconds,
        );
        if (fresh) {
          return { aggregate: cached, isFresh: true };
        }
        // Stale → drop and recompute.
        cache.delete(aggregateCacheKey);
      }

      const portEntries = vendorHealthcheckPort.checkAll(nowFn);
      const evaluated = yield* Effect.all(
        portEntries.map((entry) =>
          Effect.either(entry.result).pipe(
            Effect.map((result) => ({
              serviceName: entry.serviceName,
              result,
            })),
          ),
        ),
        { concurrency: "unbounded" },
      );

      const entries: VendorHealthAggregateEntry[] = [];
      const partialFailures: VendorHealthAggregatePartialFailure[] = [];
      const generatedAtIso = nowFn().toISOString();

      for (const { serviceName, result } of evaluated) {
        if (Either.isRight(result)) {
          entries.push(result.right);
        } else {
          partialFailures.push({
            serviceName,
            reason: buildPartialFailureReason(result.left),
          });
          entries.push(
            buildUnavailableEntry(serviceName, result.left, generatedAtIso),
          );
        }
      }

      if (evaluated.length > 0 && partialFailures.length === evaluated.length) {
        return yield* Effect.fail(
          new VendorHealthAggregatorAllSourcesFailedError({
            failures: partialFailures,
          }),
        );
      }

      const aggregate: VendorHealthAggregateProjection = {
        entries,
        partialFailures,
        generatedAt: generatedAtIso,
        correlationId:
          decoded.requestContext.correlationId ?? correlationIdFn(),
      };

      cache.set(aggregateCacheKey, aggregate);

      yield* auditLog.append({
        requestContext: decoded.requestContext,
        moduleId: platformModuleId.vendorHealthAggregator,
        action: vendorHealthAggregatorAuditAction.snapshotComputed,
        target: aggregate.correlationId,
        reason: reasonCatalogId.vendorHealthAggregatorRead,
      });

      return {
        aggregate,
        isFresh: isAggregateFresh(
          aggregate.generatedAt,
          nowFn().getTime(),
          bounds.snapshotCacheTtlSeconds,
        ),
      };
    });

  return { getAggregate };
};

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export type VendorHealthAggregatorServiceLayerDependencies = {
  readonly bounds: VendorHealthAggregatorRuntimeBounds;
};

export const makeVendorHealthAggregatorServiceLayer = (
  deps: VendorHealthAggregatorServiceLayerDependencies,
) =>
  Layer.effect(
    VendorHealthAggregatorService,
    Effect.gen(function* () {
      const auditLog = yield* AuditLogModule;
      const vendorHealthcheckPort = yield* VendorHealthcheckPort;
      return makeVendorHealthAggregatorService({
        auditLog,
        vendorHealthcheckPort,
        bounds: deps.bounds,
      });
    }),
  );

// ---------------------------------------------------------------------------
// Default healthcheck port — wraps every platform adapter that
// exposes a healthcheck Effect via `platformAdapterServiceName.*`.
// Latency is captured by Date.now() before/after each underlying
// adapter call.
// ---------------------------------------------------------------------------

type AdapterWithHealthcheck = {
  readonly serviceName: PlatformAdapterServiceName;
  readonly healthcheck: Effect.Effect<unknown, unknown>;
};

const buildHealthcheckEntry = (
  adapter: AdapterWithHealthcheck,
  now: () => Date,
): VendorHealthcheckPortEntry => ({
  serviceName: adapter.serviceName,
  result: Effect.suspend(() => {
    const startedAt = Date.now();
    const startedIso = now().toISOString();
    return adapter.healthcheck.pipe(
      Effect.map(
        (): VendorHealthAggregateEntry => ({
          serviceName: adapter.serviceName,
          status: "healthy",
          latencyMs: Math.max(0, Date.now() - startedAt),
          lastCheckedAt: startedIso,
        }),
      ),
    );
  }),
});

export type DefaultVendorHealthcheckPortDependencies = {
  readonly adapters: ReadonlyArray<AdapterWithHealthcheck>;
};

export const makeDefaultVendorHealthcheckPort = (
  deps: DefaultVendorHealthcheckPortDependencies,
): VendorHealthcheckPortService => ({
  checkAll: (now) =>
    deps.adapters.map((adapter) => buildHealthcheckEntry(adapter, now)),
});

// ---------------------------------------------------------------------------
// Env-bound runtime loader — decodes EVERY adapter credential
// + the 2 aggregator-specific runtime bounds with NO fallbacks.
// ---------------------------------------------------------------------------

const VendorHealthAggregatorProcessEnvironmentSchema = Schema.Struct({
  POSTGRES_URL: Schema.NonEmptyString,
  VENDOR_HEALTH_AGGREGATOR_SNAPSHOT_CACHE_TTL_SECONDS:
    Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  VENDOR_HEALTH_AGGREGATOR_CACHE_MAX_SIZE: Schema.NumberFromString.pipe(
    Schema.int(),
    Schema.positive(),
  ),
  // Convex
  CONVEX_SELF_HOSTED_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_SITE_URL: Schema.NonEmptyString,
  CONVEX_SELF_HOSTED_ADMIN_KEY: Schema.NonEmptyString,
  // Keycloak
  KEYCLOAK_BASE_URL: Schema.NonEmptyString,
  KEYCLOAK_REALM: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_ID: Schema.NonEmptyString,
  KEYCLOAK_CLIENT_SECRET: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME: Schema.NonEmptyString,
  KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD: Schema.NonEmptyString,
  // Ory Keto
  KETO_READ_URL: Schema.NonEmptyString,
  KETO_WRITE_URL: Schema.NonEmptyString,
  // Valkey
  VALKEY_URL: Schema.NonEmptyString,
  // Unleash
  UNLEASH_URL: Schema.NonEmptyString,
  UNLEASH_API_KEY: Schema.NonEmptyString,
  // Polar
  POLAR_API_BASE_URL: Schema.NonEmptyString,
  POLAR_ACCESS_TOKEN: Schema.NonEmptyString,
  // OpenMeter
  OPENMETER_API_BASE_URL: Schema.NonEmptyString,
  OPENMETER_API_KEY: Schema.NonEmptyString,
  // Novu
  NOVU_API_URL: Schema.NonEmptyString,
  NOVU_API_KEY: Schema.NonEmptyString,
  // Postal
  POSTAL_API_URL: Schema.NonEmptyString,
  POSTAL_API_KEY: Schema.NonEmptyString,
  // Glitchtip (observability error-tracking DSN)
  ERROR_TRACKING_DSN: Schema.NonEmptyString,
  // OpenPanel
  OPENPANEL_API_URL: Schema.NonEmptyString,
  OPENPANEL_CLIENT_ID: Schema.NonEmptyString,
  OPENPANEL_CLIENT_SECRET: Schema.NonEmptyString,
  // Observability (Grafana / OTEL)
  OTEL_EXPORTER_OTLP_ENDPOINT: Schema.NonEmptyString,
  GRAFANA_BASE_URL: Schema.NonEmptyString,
  // Meilisearch
  MEILISEARCH_URL: Schema.NonEmptyString,
  MEILISEARCH_API_KEY: Schema.NonEmptyString,
});

const decodeVendorHealthAggregatorProcessEnvironment = Schema.decodeUnknown(
  VendorHealthAggregatorProcessEnvironmentSchema,
);

export type VendorHealthAggregatorRuntimeOptions = {
  readonly postgresUrl: string;
  readonly bounds: VendorHealthAggregatorRuntimeBounds;
  readonly adapters: {
    readonly convex: {
      readonly deploymentUrl: string;
      readonly siteUrl: string;
      readonly adminKey: string;
      readonly keycloakBaseUrl: string;
      readonly keycloakRealm: string;
      readonly keycloakClientId: string;
      readonly keycloakClientSecret: string;
      readonly keycloakConvexServiceActorUsername: string;
      readonly keycloakConvexServiceActorPassword: string;
    };
    readonly keycloak: {
      readonly baseUrl: string;
      readonly realm: string;
      readonly clientId: string;
      readonly clientSecret: string;
    };
    readonly oryKeto: { readonly readUrl: string; readonly writeUrl: string };
    readonly valkey: { readonly url: string };
    readonly unleash: { readonly url: string; readonly apiKey: string };
    readonly polar: { readonly apiUrl: string; readonly apiKey: string };
    readonly openmeter: { readonly url: string; readonly apiKey: string };
    readonly novu: { readonly apiUrl: string; readonly apiKey: string };
    readonly postal: { readonly apiUrl: string; readonly apiKey: string };
    readonly glitchtip: { readonly dsn: string };
    readonly openpanel: {
      readonly apiUrl: string;
      readonly clientId: string;
      readonly clientSecret: string;
    };
    readonly observability: {
      readonly otlpHttpEndpoint: string;
      readonly grafanaBaseUrl: string;
    };
    readonly meilisearch: { readonly url: string; readonly apiKey: string };
  };
};

export const resolveVendorHealthAggregatorRuntimeOptionsFromEnvironment = (
  environment: unknown,
) =>
  decodeVendorHealthAggregatorProcessEnvironment(environment).pipe(
    Effect.map(
      (resolved): VendorHealthAggregatorRuntimeOptions => ({
        postgresUrl: resolved.POSTGRES_URL,
        bounds: {
          snapshotCacheTtlSeconds:
            resolved.VENDOR_HEALTH_AGGREGATOR_SNAPSHOT_CACHE_TTL_SECONDS,
          cacheMaxSize: resolved.VENDOR_HEALTH_AGGREGATOR_CACHE_MAX_SIZE,
        },
        adapters: {
          convex: {
            deploymentUrl: resolved.CONVEX_SELF_HOSTED_URL,
            siteUrl: resolved.CONVEX_SELF_HOSTED_SITE_URL,
            adminKey: resolved.CONVEX_SELF_HOSTED_ADMIN_KEY,
            keycloakBaseUrl: resolved.KEYCLOAK_BASE_URL,
            keycloakRealm: resolved.KEYCLOAK_REALM,
            keycloakClientId: resolved.KEYCLOAK_CLIENT_ID,
            keycloakClientSecret: resolved.KEYCLOAK_CLIENT_SECRET,
            keycloakConvexServiceActorUsername:
              resolved.KEYCLOAK_CONVEX_SERVICE_ACTOR_USERNAME,
            keycloakConvexServiceActorPassword:
              resolved.KEYCLOAK_CONVEX_SERVICE_ACTOR_PASSWORD,
          },
          keycloak: {
            baseUrl: resolved.KEYCLOAK_BASE_URL,
            realm: resolved.KEYCLOAK_REALM,
            clientId: resolved.KEYCLOAK_CLIENT_ID,
            clientSecret: resolved.KEYCLOAK_CLIENT_SECRET,
          },
          oryKeto: {
            readUrl: resolved.KETO_READ_URL,
            writeUrl: resolved.KETO_WRITE_URL,
          },
          valkey: { url: resolved.VALKEY_URL },
          unleash: {
            url: resolved.UNLEASH_URL,
            apiKey: resolved.UNLEASH_API_KEY,
          },
          polar: {
            apiUrl: resolved.POLAR_API_BASE_URL,
            apiKey: resolved.POLAR_ACCESS_TOKEN,
          },
          openmeter: {
            url: resolved.OPENMETER_API_BASE_URL,
            apiKey: resolved.OPENMETER_API_KEY,
          },
          novu: {
            apiUrl: resolved.NOVU_API_URL,
            apiKey: resolved.NOVU_API_KEY,
          },
          postal: {
            apiUrl: resolved.POSTAL_API_URL,
            apiKey: resolved.POSTAL_API_KEY,
          },
          glitchtip: { dsn: resolved.ERROR_TRACKING_DSN },
          openpanel: {
            apiUrl: resolved.OPENPANEL_API_URL,
            clientId: resolved.OPENPANEL_CLIENT_ID,
            clientSecret: resolved.OPENPANEL_CLIENT_SECRET,
          },
          observability: {
            otlpHttpEndpoint: resolved.OTEL_EXPORTER_OTLP_ENDPOINT,
            grafanaBaseUrl: resolved.GRAFANA_BASE_URL,
          },
          meilisearch: {
            url: resolved.MEILISEARCH_URL,
            apiKey: resolved.MEILISEARCH_API_KEY,
          },
        },
      }),
    ),
  );

const makeVendorHealthAggregatorRuntime = (
  options: VendorHealthAggregatorRuntimeOptions,
) =>
  Effect.gen(function* () {
    // ── Audit-log Postgres wiring (mirrors operations-home-service +
    //    polar-revenue-projection-service env-bound runtimes).
    const postgres = yield* makePostgresAdapter({
      connectionString: options.postgresUrl,
    });
    const writeDatabase = buildWriteDatabase(postgres.database);
    const auditLogQueryable: AuditLogPostgresQueryable = {
      listEventsByModule: (moduleId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.moduleId, moduleId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTarget: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.moduleId, input.moduleId),
              eq(auditLogEventsTable.target, input.target),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByActor: (actorId) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(eq(auditLogEventsTable.actorId, actorId))
          .orderBy(desc(auditLogEventsTable.recordedAt)),
      listEventsByTenant: (input) =>
        postgres.database
          .select()
          .from(auditLogEventsTable)
          .where(
            and(
              eq(auditLogEventsTable.tenantScope, input.tenantScope),
              eq(auditLogEventsTable.tenantScopeId, input.tenantScopeId),
            ),
          )
          .orderBy(desc(auditLogEventsTable.recordedAt)),
    };
    const auditLogRepository = yield* makeAuditLogPostgresRepository({
      ...writeDatabase,
      ...auditLogQueryable,
    });
    const auditLog = yield* makeAuditLogModule(auditLogRepository);

    // ── Adapter construction — every adapter advertised in the
    //    aggregate is constructed eagerly so the env decode catches
    //    any missing credential at startup rather than at first
    //    healthcheck call.
    const keycloak = yield* makeKeycloakAdapter(options.adapters.keycloak);
    const convex = yield* makeConvexAdapter(options.adapters.convex);
    const oryKeto = yield* makeOryKetoAdapter(options.adapters.oryKeto);
    const valkey = yield* makeValkeyAdapter(options.adapters.valkey);
    const unleash = yield* makeUnleashAdapter(options.adapters.unleash);
    const polar = yield* makePolarAdapter(options.adapters.polar);
    const openmeter = yield* makeOpenmeterAdapter(options.adapters.openmeter);
    const novu = yield* makeNovuAdapter(options.adapters.novu);
    const postal = yield* makePostalAdapter(options.adapters.postal);
    const glitchtip = yield* makeGlitchtipAdapter(options.adapters.glitchtip);
    const openpanel = yield* makeOpenPanelAdapter(options.adapters.openpanel);
    const observability = yield* makeObservabilityAdapter(
      options.adapters.observability,
    );
    const meilisearch = yield* makeMeilisearchAdapter(
      options.adapters.meilisearch,
    );

    const adapters: ReadonlyArray<AdapterWithHealthcheck> = [
      {
        serviceName: platformAdapterServiceName.postgres,
        healthcheck: postgres.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.convex,
        healthcheck: convex.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.keycloak,
        healthcheck: keycloak.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.oryKeto,
        healthcheck: oryKeto.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.valkey,
        healthcheck: valkey.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.unleash,
        healthcheck: unleash.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.polar,
        healthcheck: polar.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.openmeter,
        healthcheck: openmeter.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.novu,
        healthcheck: novu.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.postal,
        healthcheck: postal.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.glitchtip,
        healthcheck: glitchtip.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.openpanel,
        healthcheck: openpanel.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.observability,
        healthcheck: observability.healthcheck,
      },
      {
        serviceName: platformAdapterServiceName.meilisearch,
        healthcheck: meilisearch.healthcheck,
      },
    ];
    // TODO(future-adapter): when a new adapter ships without a
    // healthcheck Effect, surface it here as `{ status: 'unknown',
    // message: 'no-healthcheck-implemented' }` rather than dropping
    // the row so operators see an honest placeholder.

    const port = makeDefaultVendorHealthcheckPort({ adapters });

    const baseLayer = Layer.mergeAll(
      Layer.succeed(AuditLogPostgresRepository, auditLogRepository),
      Layer.succeed(AuditLogModule, auditLog),
      Layer.succeed(VendorHealthcheckPort, port),
    );
    const serviceLayer = makeVendorHealthAggregatorServiceLayer({
      bounds: options.bounds,
    }).pipe(Layer.provide(baseLayer));

    return {
      serviceLayer,
      close: Effect.all(
        [
          Effect.ignore(postgres.close),
          Effect.ignore(valkey.close),
          Effect.ignore(unleash.close),
        ],
        { discard: true },
      ),
    };
  });

export type VendorHealthAggregatorRuntimeError =
  | ParseResult.ParseError
  | PostgresAdapterConnectionError;

export const runVendorHealthAggregatorFromEnvironment = <A, E>(
  environment: unknown,
  use: (service: VendorHealthAggregatorServiceImpl) => Effect.Effect<A, E>,
): Effect.Effect<A, E | VendorHealthAggregatorRuntimeError> =>
  resolveVendorHealthAggregatorRuntimeOptionsFromEnvironment(environment).pipe(
    Effect.flatMap((options) =>
      makeVendorHealthAggregatorRuntime(options).pipe(
        Effect.flatMap((runtime) =>
          Effect.flatMap(VendorHealthAggregatorService, use).pipe(
            Effect.provide(runtime.serviceLayer),
            Effect.ensuring(runtime.close),
          ),
        ),
      ),
    ),
  ) as Effect.Effect<A, E | VendorHealthAggregatorRuntimeError>;
