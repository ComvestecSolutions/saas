import { describe, expect, it } from "vitest";
import {
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eBusinessEventsEnvironment,
  tryResolveLocalBackendE2eEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eEnvironment = tryResolveLocalBackendE2eEnvironment();
const localBackendE2eBusinessEventsEnvironment =
  tryResolveLocalBackendE2eBusinessEventsEnvironment();
const describeLocalBackendE2e =
  localBackendE2eEnvironment === undefined ||
  localBackendE2eBusinessEventsEnvironment === undefined
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e business-event runtime", () => {
  const environment = localBackendE2eEnvironment!;

  const runBusinessEventsProbe = () =>
    runBackendE2eBunProbe<{
      readonly emitterCreated: boolean;
      readonly trackRequestCount: number;
      readonly trackRequestStatuses: readonly number[];
      readonly runtimeFailureCount: number;
      readonly runtimeFailureMessages: readonly string[];
    }>(
      `import { Effect } from 'effect';
import {
  createPlatformBusinessEventEmitterFromEnvironment,
  platformBusinessEventName,
} from '@comvestec/platform';
import { actorType, platformModuleId, platformScope } from '@comvestec/contracts';

const originalFetch = globalThis.fetch;
const originalConsoleError = globalThis.console.error;
const trackRequestStatuses: number[] = [];
const runtimeFailureMessages: string[] = [];

globalThis.fetch = async (input, init) => {
  const response = await originalFetch(input, init);
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (url.includes('/track')) {
    trackRequestStatuses.push(response.status);
  }

  return response;
};

globalThis.console.error = (...args) => {
  runtimeFailureMessages.push(args.map((value) => String(value)).join(' '));
};

try {
  const emitter = await Effect.runPromise(
    createPlatformBusinessEventEmitterFromEnvironment({
      environment: process.env,
      serviceName: 'backend-e2e-openpanel-smoke',
      fetch: globalThis.fetch,
    }),
  );

  await Effect.runPromise(
    emitter({
      requestContext: {
        actorType: actorType.platformOperator,
        actorId: 'usr_backend_e2e_openpanel_operator',
        sessionId: 'sess_backend_e2e_openpanel_operator',
        correlationId: 'corr_backend_e2e_openpanel_operator',
        reason: 'Validate live OpenPanel business-event emission.',
        tenant: {
          scope: platformScope.organization,
          scopeId: 'org_backend_e2e_openpanel',
          organizationId: 'org_backend_e2e_openpanel',
        },
      },
      moduleId: platformModuleId.importExport,
      eventName:
        platformBusinessEventName.importExportManagedFileSummaryRequested,
      properties: {
        exportKind: 'managed-files',
        previewCount: 1,
      },
    }),
  );

  console.log(JSON.stringify({
    emitterCreated: true,
    trackRequestCount: trackRequestStatuses.length,
    trackRequestStatuses,
    runtimeFailureCount: runtimeFailureMessages.length,
    runtimeFailureMessages,
  }));
} finally {
  globalThis.fetch = originalFetch;
  globalThis.console.error = originalConsoleError;
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 30_000,
      },
    );

  it("emits a real OpenPanel business event through the shared backend emitter", () => {
    const probe = runBusinessEventsProbe();

    expect(probe.emitterCreated).toBe(true);
    expect(probe.trackRequestCount).toBeGreaterThan(0);
    expect(
      probe.trackRequestStatuses.every(
        (status) => status >= 200 && status < 300,
      ),
    ).toBe(true);
    expect(probe.runtimeFailureCount).toBe(0);
    expect(probe.runtimeFailureMessages).toEqual([]);
  });
});
