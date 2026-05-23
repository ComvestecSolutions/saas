import {
  createObservedPlatformRequestBoundary,
  createPlatformRequestBoundary,
  createPlatformRequestGlitchtipSecurityReportHeadersResolver,
  platformRequestCorrelationIdHeaderName,
} from "@comvestec/platform";

describe("platform request boundary", () => {
  it("falls back to a generated correlation id when a resolver throws", async () => {
    const boundary = createPlatformRequestBoundary({
      resolveCorrelationId: async () => {
        throw new Error("resolver boom");
      },
    });

    const response = await boundary.wrap(() =>
      Response.json({ acknowledged: true }),
    )(new Request("http://localhost/request-boundary"));

    const body = (await response.json()) as {
      readonly acknowledged: boolean;
    };

    expect(response.status).toBe(200);
    expect(
      response.headers.get(platformRequestCorrelationIdHeaderName),
    ).toEqual(expect.any(String));
    expect(body).toEqual({
      acknowledged: true,
    });
  });

  it("applies request transforms through the observed boundary wrapper", async () => {
    const boundary = createObservedPlatformRequestBoundary({
      environment: {},
      serviceName: "request-boundary-test",
      transformRequest: (request) => {
        const headers = new Headers(request.headers);

        headers.set("x-observed-transform", "applied");

        return new Request(request, { headers });
      },
    });

    const response = await boundary.wrap((request) =>
      Response.json({
        transformed: request.headers.get("x-observed-transform"),
      }),
    )(new Request("http://localhost/request-boundary/observed"));

    await expect(response.json()).resolves.toEqual({
      transformed: "applied",
    });
  });

  it("adds correlation headers to request-like runtime request objects", async () => {
    const boundary = createPlatformRequestBoundary();
    const requestLike = {
      url: "http://localhost/request-boundary/request-like",
      method: "GET",
      headers: new Headers({
        accept: "application/json",
      }),
      body: null,
      bodyUsed: false,
      cache: "default",
      credentials: "same-origin",
      integrity: "",
      keepalive: false,
      mode: "cors",
      redirect: "follow",
      referrer: "about:client",
      referrerPolicy: "",
      signal: new AbortController().signal,
    } as unknown as Request;

    const response = await boundary.wrap((request) =>
      Response.json({
        correlationId: request.headers.get(
          platformRequestCorrelationIdHeaderName,
        ),
      }),
    )(requestLike);

    await expect(response.json()).resolves.toEqual({
      correlationId: expect.any(String),
    });
  });

  it("routes transform failures through the fallback response and reporters", async () => {
    const emittedTelemetry: {
      readonly correlationId: string;
      readonly method: string;
      readonly path: string;
      readonly status: number;
      readonly durationMs: number;
      readonly outcome: "response" | "uncaught-error";
    }[] = [];
    const reportedErrors: {
      readonly correlationId: string;
      readonly method: string;
      readonly path: string;
      readonly status: number;
      readonly durationMs: number;
      readonly errorName: string;
      readonly errorMessage: string;
    }[] = [];
    const boundary = createPlatformRequestBoundary({
      transformRequest: async () => {
        throw new Error("transform boom");
      },
      emitRequestTelemetry: async (telemetry) => {
        emittedTelemetry.push(telemetry);
      },
      reportUnhandledRequestError: async (error) => {
        reportedErrors.push(error);
      },
    });

    const response = await boundary.wrap(() =>
      Response.json({ acknowledged: true }),
    )(
      new Request("http://localhost/request-boundary/transform-failure", {
        method: "PUT",
      }),
    );
    const body = (await response.json()) as {
      readonly error: string;
    };

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: "Request failed.",
    });
    expect(emittedTelemetry).toEqual([
      expect.objectContaining({
        method: "PUT",
        path: "/request-boundary/transform-failure",
        status: 500,
        outcome: "uncaught-error",
      }),
    ]);
    expect(reportedErrors).toEqual([
      expect.objectContaining({
        method: "PUT",
        path: "/request-boundary/transform-failure",
        status: 500,
        errorName: "Error",
        errorMessage: "transform boom",
      }),
    ]);
  });

  it("adds report-only GlitchTip security headers to document responses when the DSN is derivable", async () => {
    const resolveResponseHeaders =
      createPlatformRequestGlitchtipSecurityReportHeadersResolver({
        environment: {
          ERROR_TRACKING_DSN: "https://public-key@glitchtip.local/1",
        },
      });

    expect(resolveResponseHeaders).toBeDefined();

    if (resolveResponseHeaders === undefined) {
      throw new Error("Expected GlitchTip security report headers resolver.");
    }

    const boundary = createPlatformRequestBoundary({
      resolveResponseHeaders,
    });

    const response = await boundary.wrap(
      () =>
        new Response("<html><body>ok</body></html>", {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
          },
        }),
    )(
      new Request("http://localhost/request-boundary/document", {
        headers: {
          Accept: "text/html",
        },
      }),
    );

    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBe(
      "object-src 'none'; base-uri 'self'; report-uri https://glitchtip.local/api/1/security/?sentry_key=public-key",
    );
    expect(
      response.headers.get(platformRequestCorrelationIdHeaderName),
    ).toEqual(expect.any(String));
  });

  it("does not add report-only GlitchTip security headers to non-document API responses", async () => {
    const resolveResponseHeaders =
      createPlatformRequestGlitchtipSecurityReportHeadersResolver({
        environment: {
          ERROR_TRACKING_DSN: "https://public-key@glitchtip.local/1",
        },
      });

    expect(resolveResponseHeaders).toBeDefined();

    if (resolveResponseHeaders === undefined) {
      throw new Error("Expected GlitchTip security report headers resolver.");
    }

    const boundary = createPlatformRequestBoundary({
      resolveResponseHeaders,
    });

    const response = await boundary.wrap(() =>
      Response.json({ acknowledged: true }),
    )(
      new Request("http://localhost/request-boundary/api", {
        headers: {
          Accept: "text/html",
        },
      }),
    );

    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBe(
      null,
    );
  });

  it("emits request traces and reports uncaught failures from runtime-style environment fields", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: {
      readonly url: string;
      readonly method: string;
      readonly body?: string;
    }[] = [];

    globalThis.fetch = async (input, init) => {
      const body =
        typeof init?.body === "string" ? init.body : init?.body?.toString();

      fetchCalls.push({
        url: typeof input === "string" ? input : input.toString(),
        method: init?.method ?? "GET",
        ...(body === undefined ? {} : { body }),
      });

      return new Response(null, { status: 202 });
    };

    try {
      const boundary = createObservedPlatformRequestBoundary({
        environment: {
          otelEndpoint: "http://observability.local:4318",
          grafanaBaseUrl: "http://grafana.local:3001",
          errorTrackingDsn: "https://public-key@glitchtip.local/1",
        },
        serviceName: "request-boundary-test",
      });
      const response = await boundary.wrap(() => {
        throw new Error("request-boundary boom");
      })(
        new Request("http://localhost/request-boundary/observed", {
          method: "POST",
        }),
      );
      const body = (await response.json()) as {
        readonly error: string;
      };

      for (
        let attempt = 0;
        attempt < 10 && fetchCalls.length < 2;
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      expect(response.status).toBe(500);
      expect(body).toEqual({
        error: "Request failed.",
      });
      expect(fetchCalls).toHaveLength(2);
      expect(fetchCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: "http://observability.local:4318/v1/traces",
            method: "POST",
            body: expect.stringContaining("request-boundary/observed"),
          }),
          expect.objectContaining({
            url: "https://glitchtip.local/api/1/store/",
            method: "POST",
            body: expect.stringContaining("request-boundary boom"),
          }),
        ]),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("accepts raw environment observability fields for traces and uncaught failures", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: {
      readonly url: string;
      readonly method: string;
      readonly body?: string;
    }[] = [];

    globalThis.fetch = async (input, init) => {
      const body =
        typeof init?.body === "string" ? init.body : init?.body?.toString();

      fetchCalls.push({
        url: typeof input === "string" ? input : input.toString(),
        method: init?.method ?? "GET",
        ...(body === undefined ? {} : { body }),
      });

      return new Response(null, { status: 202 });
    };

    try {
      const boundary = createObservedPlatformRequestBoundary({
        environment: {
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://observability.raw:4318",
          GRAFANA_BASE_URL: "http://grafana.raw:3001",
          ERROR_TRACKING_DSN: "https://public-key@glitchtip.raw/1",
        },
        serviceName: "request-boundary-test",
      });
      const response = await boundary.wrap(() => {
        throw new Error("request-boundary raw boom");
      })(
        new Request("http://localhost/request-boundary/raw", {
          method: "PATCH",
        }),
      );

      await response.text();

      for (
        let attempt = 0;
        attempt < 10 && fetchCalls.length < 2;
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      expect(fetchCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: "http://observability.raw:4318/v1/traces",
            method: "POST",
            body: expect.stringContaining("request-boundary/raw"),
          }),
          expect.objectContaining({
            url: "https://glitchtip.raw/api/1/store/",
            method: "POST",
            body: expect.stringContaining("request-boundary raw boom"),
          }),
        ]),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("logs malformed telemetry configuration when related env keys are present", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const boundary = createObservedPlatformRequestBoundary({
        environment: {
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://observability.invalid:4318",
          GRAFANA_BASE_URL: "",
        },
        serviceName: "request-boundary-test",
      });
      const response = await boundary.wrap(() =>
        Response.json({ acknowledged: true }),
      )(
        new Request(
          "http://localhost/request-boundary/malformed-observability",
        ),
      );

      await expect(response.json()).resolves.toEqual({
        acknowledged: true,
      });
      expect(errorSpy).toHaveBeenCalledWith(
        "[request-boundary-test] Failed to initialize request telemetry.",
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("logs error-tracking capture failures instead of silently swallowing them", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const boundary = createObservedPlatformRequestBoundary({
        environment: {
          ERROR_TRACKING_DSN:
            "generate-after-running-ops-runtime-bootstrap-or-supplying-managed-glitchtip-dsn",
        },
        serviceName: "request-boundary-test",
      });
      const response = await boundary.wrap(() => {
        throw new Error("request-boundary error-tracking boom");
      })(new Request("http://localhost/request-boundary/error-tracking"));
      const body = (await response.json()) as {
        readonly error: string;
      };

      expect(response.status).toBe(500);
      expect(body).toEqual({
        error: "Request failed.",
      });
      expect(errorSpy).toHaveBeenCalledWith(
        "[request-boundary-test] Failed to capture unhandled request error.",
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
