import { describe, expect, it } from "vitest";
import {
  isLocalBackendE2eErrorTrackingReady,
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eErrorTrackingEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eErrorTrackingEnvironment =
  tryResolveLocalBackendE2eErrorTrackingEnvironment();
const describeLocalBackendE2e =
  localBackendE2eErrorTrackingEnvironment === undefined ||
  !isLocalBackendE2eErrorTrackingReady()
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e GlitchTip error tracking", () => {
  const environment = localBackendE2eErrorTrackingEnvironment!;

  const runErrorTrackingProbe = () =>
    runBackendE2eBunProbe<{
      readonly reporterCreated: boolean;
      readonly runtimeFailureCount: number;
      readonly runtimeFailures: readonly string[];
    }>(
      `import { createPlatformRequestErrorTrackingReporter } from '@comvestec/platform';

const runtimeFailures = [];
const originalConsoleError = console.error.bind(console);

console.error = (...args) => {
  runtimeFailures.push(
    args
      .map((value) =>
        typeof value === 'string' ? value : JSON.stringify(value),
      )
      .join(' '),
  );
};

try {
  const reporter = createPlatformRequestErrorTrackingReporter({
    environment: process.env,
    serviceName: 'backend-e2e-error-tracking-smoke',
  });

  if (reporter === undefined) {
    throw new Error(
      'Expected the backend request-boundary GlitchTip reporter to initialize.',
    );
  }

  await reporter({
    correlationId: 'corr_backend_e2e_glitchtip_smoke',
    method: 'GET',
    path: '/backend-e2e/error-tracking-smoke',
    status: 500,
    durationMs: 37,
    errorName: 'LocalBackendE2eErrorTrackingSmoke',
    errorMessage: 'Validate live GlitchTip issue capture.',
    errorStack:
      'LocalBackendE2eErrorTrackingSmoke: Validate live GlitchTip issue capture.',
  });

  console.log(
    JSON.stringify({
      reporterCreated: true,
      runtimeFailureCount: runtimeFailures.length,
      runtimeFailures,
    }),
  );
} finally {
  console.error = originalConsoleError;
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 45_000,
      },
    );

  it("captures a real backend-owned smoke issue through the GlitchTip reporter", () => {
    const probe = runErrorTrackingProbe();

    expect(probe.reporterCreated).toBe(true);
    expect(probe.runtimeFailureCount).toBe(0);
    expect(probe.runtimeFailures).toEqual([]);
  });
});
