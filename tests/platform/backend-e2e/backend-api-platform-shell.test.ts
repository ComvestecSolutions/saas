import { describe, expect, it } from "vitest";
import { runBackendE2eBunProbe } from "./_shared/local-backend-e2e";

describe("backend e2e backend api platform shell", () => {
  const runBackendApiPlatformShellProbe = () => {
    return runBackendE2eBunProbe<{
      readonly liveStatus: number;
      readonly liveBody: {
        readonly service: string;
        readonly healthy: boolean;
      };
      readonly readyStatus: number;
      readonly readyBody: {
        readonly service: string;
        readonly healthy: boolean;
        readonly checks: readonly unknown[];
        readonly errorTag?: string;
      };
      readonly openApiStatus: number;
      readonly openApiContentType: string | null;
      readonly openApiVersion: string;
      readonly hasListPublicPlansPath: boolean;
      readonly hasReadyPath: boolean;
      readonly docsStatus: number;
      readonly docsContentType: string | null;
      readonly docsContainsOpenApiPath: boolean;
      readonly methodNotAllowedStatus: number;
      readonly methodNotAllowedAllow: string | null;
      readonly methodNotAllowedBody: {
        readonly error: string;
      };
      readonly missingRouteStatus: number;
      readonly missingRouteBody: {
        readonly error: string;
      };
      readonly listPublicPlansPath: string;
      readonly readyPath: string;
      readonly openApiPath: string;
    }>(`import { createBackendApiRequestHandler, backendApiHealthPath, backendApiDocsPath, backendApiOpenApiPath } from '@comvestec/platform/http';
import { subscriberJourneyApiPath } from '@comvestec/platform';

const runStep = async (label, operation, timeoutMs = 15000) => {
  let timeoutHandle;

  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(label + ' timed out after ' + timeoutMs + 'ms.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
};

const server = Bun.serve({
  port: 0,
  fetch: createBackendApiRequestHandler(process.env),
});

try {
  const baseUrl = 'http://127.0.0.1:' + server.port;
  const liveResponse = await runStep(
    'backend api liveness',
    fetch(new URL(backendApiHealthPath.live, baseUrl)),
  );
  const readyResponse = await runStep(
    'backend api readiness',
    fetch(new URL(backendApiHealthPath.ready, baseUrl)),
  );
  const openApiResponse = await runStep(
    'backend api openapi',
    fetch(new URL(backendApiOpenApiPath, baseUrl)),
  );
  const docsResponse = await runStep(
    'backend api docs',
    fetch(new URL(backendApiDocsPath, baseUrl)),
  );
  const openApiDocument = await openApiResponse.json();
  const docsHtml = await docsResponse.text();
  const methodNotAllowedResponse = await runStep(
    'subscriber journey method not allowed',
    fetch(new URL(subscriberJourneyApiPath.listPublicPlans, baseUrl), {
      method: 'POST',
    }),
  );
  const missingRouteResponse = await runStep(
    'subscriber journey missing route',
    fetch(new URL('/api/subscriber-journey/not-a-route', baseUrl)),
  );
  console.log(JSON.stringify({
    liveStatus: liveResponse.status,
    liveBody: await liveResponse.json(),
    readyStatus: readyResponse.status,
    readyBody: await readyResponse.json(),
    openApiStatus: openApiResponse.status,
    openApiContentType: openApiResponse.headers.get('content-type'),
    openApiVersion: openApiDocument.openapi,
    hasListPublicPlansPath: Object.hasOwn(openApiDocument.paths, subscriberJourneyApiPath.listPublicPlans),
    hasReadyPath: Object.hasOwn(openApiDocument.paths, backendApiHealthPath.ready),
    docsStatus: docsResponse.status,
    docsContentType: docsResponse.headers.get('content-type'),
    docsContainsOpenApiPath: docsHtml.includes(backendApiOpenApiPath),
    methodNotAllowedStatus: methodNotAllowedResponse.status,
    methodNotAllowedAllow: methodNotAllowedResponse.headers.get('allow'),
    methodNotAllowedBody: await methodNotAllowedResponse.json(),
    missingRouteStatus: missingRouteResponse.status,
    missingRouteBody: await missingRouteResponse.json(),
    listPublicPlansPath: subscriberJourneyApiPath.listPublicPlans,
    readyPath: backendApiHealthPath.ready,
    openApiPath: backendApiOpenApiPath,
  }));
} finally {
  server.stop(true);
}

process.exit(0);`);
  };

  it("serves platform shell routes through the real backend http runtime", () => {
    const probe = runBackendApiPlatformShellProbe();

    expect(probe.liveStatus).toBe(200);
    expect(probe.liveBody).toEqual({
      service: "backend-api",
      healthy: true,
    });
    expect([200, 503]).toContain(probe.readyStatus);
    expect(probe.readyBody.service).toBe("backend-api");
    expect(probe.readyBody.healthy).toBe(probe.readyStatus === 200);
    if (probe.readyStatus === 200) {
      expect(probe.readyBody.checks.length).toBeGreaterThan(0);
    } else {
      expect(
        probe.readyBody.checks.length > 0 ||
          probe.readyBody.errorTag === "BackendApiReadinessInitializationError",
      ).toBe(true);
    }
    expect(probe.openApiStatus).toBe(200);
    expect(probe.openApiContentType).toContain("application/json");
    expect(probe.openApiVersion).toMatch(/^3\./);
    expect(probe.hasListPublicPlansPath).toBe(true);
    expect(probe.hasReadyPath).toBe(true);
    expect(probe.docsStatus).toBe(200);
    expect(probe.docsContentType).toContain("text/html");
    expect(probe.docsContainsOpenApiPath).toBe(true);
    expect(probe.methodNotAllowedStatus).toBe(405);
    expect(probe.methodNotAllowedAllow).toBe("GET");
    expect(probe.methodNotAllowedBody).toEqual({
      error: "Method not allowed.",
    });
    expect(probe.missingRouteStatus).toBe(404);
    expect(probe.missingRouteBody).toEqual({
      error: "Subscriber journey route not found.",
    });
  });
});
