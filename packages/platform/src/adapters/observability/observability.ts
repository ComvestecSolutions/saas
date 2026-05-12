import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import { TelemetryKindSchema } from "@comvestec/contracts";
import {
  createPlatformAdapterHealthcheckSchema,
  platformAdapterServiceName,
} from "../service-names";

const ObservabilityAdapterOptionsSchema = Schema.Struct({
  otlpHttpEndpoint: Schema.NonEmptyString,
  grafanaBaseUrl: Schema.NonEmptyString,
});

export type ObservabilityAdapterOptions = Schema.Schema.Type<
  typeof ObservabilityAdapterOptionsSchema
>;

type ObservabilityAdapterRuntimeOptions = ObservabilityAdapterOptions & {
  readonly fetch?: typeof fetch;
};

const TelemetryEmissionSchema = Schema.Struct({
  kind: TelemetryKindSchema,
  service: Schema.NonEmptyString,
  payload: Schema.Any,
});

export type TelemetryEmission = Schema.Schema.Type<
  typeof TelemetryEmissionSchema
>;

const ObservabilityHealthcheckSchema = createPlatformAdapterHealthcheckSchema(
  platformAdapterServiceName.observability,
);

export type ObservabilityHealthcheck = Schema.Schema.Type<
  typeof ObservabilityHealthcheckSchema
>;

const decodeObservabilityHealthcheck = Schema.decodeUnknown(
  ObservabilityHealthcheckSchema,
);

export class ObservabilityAdapterRequestError extends Error {
  readonly _tag = "ObservabilityAdapterRequestError";

  constructor(
    readonly endpoint: string,
    readonly status: number,
  ) {
    super(
      `Observability emission failed with status ${status} for ${endpoint}.`,
    );
    this.name = "ObservabilityAdapterRequestError";
  }
}

export class ObservabilityAdapterTransportError extends Error {
  readonly _tag = "ObservabilityAdapterTransportError";

  constructor(
    readonly endpoint: string,
    readonly transportCause: unknown,
  ) {
    super(`Observability emission transport failed for ${endpoint}.`);
    this.name = "ObservabilityAdapterTransportError";
  }
}

export type ObservabilityAdapterError =
  | ParseResult.ParseError
  | ObservabilityAdapterRequestError
  | ObservabilityAdapterTransportError;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getRecordString = (input: unknown, key: string) => {
  if (!isRecord(input)) {
    return undefined;
  }

  const value = input[key];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
};

const getRecordNumber = (input: unknown, key: string) => {
  if (!isRecord(input)) {
    return undefined;
  }

  const value = input[key];

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

const safeJsonStringify = (input: unknown) => {
  try {
    return JSON.stringify(input);
  } catch {
    return JSON.stringify({ error: "payload-serialization-failed" });
  }
};

const truncateString = (value: string, maxLength = 4_096) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;

const createStringAttribute = (key: string, value: string) => ({
  key,
  value: {
    stringValue: value,
  },
});

const createIntAttribute = (key: string, value: number) => ({
  key,
  value: {
    intValue: `${Math.round(value)}`,
  },
});

const createResource = (service: string) => ({
  attributes: [createStringAttribute("service.name", service)],
});

const createTelemetryAttributes = (input: TelemetryEmission) => {
  const payloadJson = truncateString(safeJsonStringify(input.payload));
  const attributes: Array<
    | ReturnType<typeof createStringAttribute>
    | ReturnType<typeof createIntAttribute>
  > = [
    createStringAttribute("comvestec.telemetry.kind", input.kind),
    createStringAttribute("comvestec.telemetry.payload", payloadJson),
  ];
  const correlationId = getRecordString(input.payload, "correlationId");
  const method = getRecordString(input.payload, "method");
  const path = getRecordString(input.payload, "path");
  const outcome = getRecordString(input.payload, "outcome");
  const status = getRecordNumber(input.payload, "status");
  const durationMs = getRecordNumber(input.payload, "durationMs");

  if (correlationId !== undefined) {
    attributes.push(
      createStringAttribute(
        "comvestec.telemetry.correlation_id",
        correlationId,
      ),
    );
  }

  if (method !== undefined) {
    attributes.push(createStringAttribute("http.request.method", method));
  }

  if (path !== undefined) {
    attributes.push(createStringAttribute("url.path", path));
  }

  if (outcome !== undefined) {
    attributes.push(
      createStringAttribute("comvestec.telemetry.outcome", outcome),
    );
  }

  if (status !== undefined) {
    attributes.push(createIntAttribute("http.response.status_code", status));
  }

  if (durationMs !== undefined) {
    attributes.push(
      createIntAttribute("comvestec.telemetry.duration_ms", durationMs),
    );
  }

  return attributes;
};

const toHex = (input: Uint8Array) =>
  Array.from(input, (value) => value.toString(16).padStart(2, "0")).join("");

const createDeterministicHexId = async (input: string, length: number) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );

  return toHex(new Uint8Array(digest)).slice(0, length);
};

const buildOtlpHttpEndpoint = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, "")}${path}`;

const buildTraceEmissionRequest = async (
  options: ObservabilityAdapterOptions,
  input: TelemetryEmission,
) => {
  const correlationId =
    getRecordString(input.payload, "correlationId") ?? crypto.randomUUID();
  const method = getRecordString(input.payload, "method");
  const path = getRecordString(input.payload, "path");
  const spanName =
    method !== undefined && path !== undefined
      ? `${method} ${path}`
      : `${input.service}.${input.kind}`;
  const nowUnixNano = BigInt(Date.now()) * 1_000_000n;
  const durationMs = Math.max(
    1,
    Math.round(getRecordNumber(input.payload, "durationMs") ?? 1),
  );
  const startedAtUnixNano = nowUnixNano - BigInt(durationMs) * 1_000_000n;
  const status = getRecordNumber(input.payload, "status");
  const traceId = await createDeterministicHexId(
    `${input.service}:${correlationId}`,
    32,
  );
  const spanId = await createDeterministicHexId(
    `${spanName}:${correlationId}`,
    16,
  );

  return {
    endpoint: buildOtlpHttpEndpoint(options.otlpHttpEndpoint, "/v1/traces"),
    body: {
      resourceSpans: [
        {
          resource: createResource(input.service),
          scopeSpans: [
            {
              scope: {
                name: "comvestec.platform.observability",
              },
              spans: [
                {
                  traceId,
                  spanId,
                  name: spanName,
                  startTimeUnixNano: `${startedAtUnixNano}`,
                  endTimeUnixNano: `${nowUnixNano}`,
                  attributes: createTelemetryAttributes(input),
                  status: {
                    code: status !== undefined && status >= 500 ? 2 : 1,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
};

const buildLogEmissionRequest = (
  options: ObservabilityAdapterOptions,
  input: TelemetryEmission,
) => {
  const nowUnixNano = BigInt(Date.now()) * 1_000_000n;

  return {
    endpoint: buildOtlpHttpEndpoint(options.otlpHttpEndpoint, "/v1/logs"),
    body: {
      resourceLogs: [
        {
          resource: createResource(input.service),
          scopeLogs: [
            {
              scope: {
                name: "comvestec.platform.observability",
              },
              logRecords: [
                {
                  timeUnixNano: `${nowUnixNano}`,
                  severityText: input.kind.toUpperCase(),
                  body: {
                    stringValue: truncateString(
                      safeJsonStringify(input.payload),
                    ),
                  },
                  attributes: createTelemetryAttributes(input),
                },
              ],
            },
          ],
        },
      ],
    },
  };
};

const buildMetricEmissionRequest = (
  options: ObservabilityAdapterOptions,
  input: TelemetryEmission,
) => {
  const nowUnixNano = BigInt(Date.now()) * 1_000_000n;

  return {
    endpoint: buildOtlpHttpEndpoint(options.otlpHttpEndpoint, "/v1/metrics"),
    body: {
      resourceMetrics: [
        {
          resource: createResource(input.service),
          scopeMetrics: [
            {
              scope: {
                name: "comvestec.platform.observability",
              },
              metrics: [
                {
                  name: "comvestec.telemetry.emission_count",
                  description: "Generic telemetry emission count.",
                  unit: "1",
                  sum: {
                    aggregationTemporality: 2,
                    isMonotonic: true,
                    dataPoints: [
                      {
                        timeUnixNano: `${nowUnixNano}`,
                        asInt: "1",
                        attributes: createTelemetryAttributes(input),
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
};

const buildObservabilityEmissionRequest = async (
  options: ObservabilityAdapterOptions,
  input: TelemetryEmission,
) => {
  if (input.kind === "trace") {
    return buildTraceEmissionRequest(options, input);
  }

  if (input.kind === "metric") {
    return buildMetricEmissionRequest(options, input);
  }

  return buildLogEmissionRequest(options, input);
};

const createObservabilityHealthcheck = (input: {
  readonly options: ObservabilityAdapterOptions;
  readonly fetchImplementation: typeof fetch;
}): Effect.Effect<ObservabilityHealthcheck, ObservabilityAdapterError> => {
  const endpoint = buildOtlpHttpEndpoint(
    input.options.otlpHttpEndpoint,
    "/v1/traces",
  );

  return Effect.tryPromise({
    try: () =>
      input.fetchImplementation(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resourceSpans: [],
        }),
      }),
    catch: (cause) => new ObservabilityAdapterTransportError(endpoint, cause),
  }).pipe(
    Effect.flatMap(
      (
        response,
      ): Effect.Effect<ObservabilityHealthcheck, ObservabilityAdapterError> =>
        response.ok
          ? decodeObservabilityHealthcheck({
              healthy: true,
              service: platformAdapterServiceName.observability,
            })
          : Effect.fail(
              new ObservabilityAdapterRequestError(endpoint, response.status),
            ),
    ),
  );
};

export type ObservabilityAdapterService = {
  readonly serviceName: typeof platformAdapterServiceName.observability;
  readonly otlpHttpEndpoint: string;
  readonly grafanaBaseUrl: string;
  readonly healthcheck: Effect.Effect<
    ObservabilityHealthcheck,
    ObservabilityAdapterError
  >;
  readonly emit: (
    input: TelemetryEmission,
  ) => Effect.Effect<TelemetryEmission, ObservabilityAdapterError>;
};

export class ObservabilityAdapter extends Context.Tag("ObservabilityAdapter")<
  ObservabilityAdapter,
  ObservabilityAdapterService
>() {}

export const makeObservabilityAdapter = (
  input: ObservabilityAdapterRuntimeOptions,
) =>
  Schema.decodeUnknown(ObservabilityAdapterOptionsSchema)(input).pipe(
    Effect.map(
      (options): ObservabilityAdapterService => ({
        serviceName: platformAdapterServiceName.observability,
        otlpHttpEndpoint: options.otlpHttpEndpoint,
        grafanaBaseUrl: options.grafanaBaseUrl,
        healthcheck: createObservabilityHealthcheck({
          options,
          fetchImplementation: input.fetch ?? fetch,
        }),
        emit: (emissionInput: TelemetryEmission) =>
          Schema.decodeUnknown(TelemetryEmissionSchema)(emissionInput).pipe(
            Effect.flatMap((emission) =>
              Effect.tryPromise({
                try: async () => {
                  const request = await buildObservabilityEmissionRequest(
                    options,
                    emission,
                  );
                  const response = await (input.fetch ?? fetch)(
                    request.endpoint,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify(request.body),
                    },
                  );

                  if (!response.ok) {
                    throw new ObservabilityAdapterRequestError(
                      request.endpoint,
                      response.status,
                    );
                  }

                  return emission;
                },
                catch: (cause) => {
                  if (cause instanceof ObservabilityAdapterRequestError) {
                    return cause;
                  }

                  return new ObservabilityAdapterTransportError(
                    options.otlpHttpEndpoint,
                    cause,
                  );
                },
              }),
            ),
          ),
      }),
    ),
  );

export const makeObservabilityAdapterLayer = (
  options: ObservabilityAdapterOptions,
) => Layer.effect(ObservabilityAdapter, makeObservabilityAdapter(options));
