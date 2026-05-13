import {
  authorizationFeatureFlag,
  observabilityFeatureFlag,
} from "@comvestec/contracts";
import { describe, expect, it } from "vitest";
import {
  isLocalBackendE2eFeatureFlagsReady,
  runBackendE2eBunProbe,
  tryResolveLocalBackendE2eFeatureFlagsEnvironment,
} from "./_shared/local-backend-e2e";

const localBackendE2eFeatureFlagsEnvironment =
  tryResolveLocalBackendE2eFeatureFlagsEnvironment();
const describeLocalBackendE2e =
  localBackendE2eFeatureFlagsEnvironment === undefined ||
  !isLocalBackendE2eFeatureFlagsReady()
    ? describe.skip
    : describe;

describeLocalBackendE2e("backend e2e Unleash feature-flag runtime", () => {
  const environment = localBackendE2eFeatureFlagsEnvironment!;

  const runUnleashRuntimeProbe = () =>
    runBackendE2eBunProbe<{
      readonly manifestFlagCount: number;
      readonly missingDefinitions: readonly string[];
      readonly fallbackInvariantChecks: ReadonlyArray<{
        readonly key: string;
        readonly falseFallback: {
          readonly enabled: boolean;
          readonly definitionExists: boolean;
        };
        readonly trueFallback: {
          readonly enabled: boolean;
          readonly definitionExists: boolean;
        };
      }>;
    }>(
      `import { Effect } from 'effect';
import {
  authorizationFeatureFlag,
  observabilityFeatureFlag,
} from '@comvestec/contracts';
import { platformModuleManifests } from '@comvestec/config';
import { makeUnleashAdapter } from '@comvestec/platform';

const manifestFlags = platformModuleManifests
  .flatMap((manifest) => manifest.featureFlags.map((flag) => flag.key))
  .sort();
const fallbackProbeFlags = [
  authorizationFeatureFlag.enabled,
  observabilityFeatureFlag.errorTrackingEnabled,
];
const unleash = await Effect.runPromise(
  makeUnleashAdapter({
    url: process.env.UNLEASH_URL,
    apiKey: process.env.UNLEASH_API_KEY,
  }),
);

try {
  const missingDefinitions = [];

  for (const flagKey of manifestFlags) {
    const definition = await Effect.runPromise(
      unleash.getFeatureFlagDefinition({ flagKey }),
    );

    if (definition === undefined) {
      missingDefinitions.push(flagKey);
    }
  }

  const fallbackInvariantChecks = [];

  for (const flagKey of fallbackProbeFlags) {
    const falseFallback = await Effect.runPromise(
      unleash.evaluateFeatureFlag({
        flagKey,
        fallbackEnabled: false,
      }),
    );
    const trueFallback = await Effect.runPromise(
      unleash.evaluateFeatureFlag({
        flagKey,
        fallbackEnabled: true,
      }),
    );

    fallbackInvariantChecks.push({
      key: flagKey,
      falseFallback: {
        enabled: falseFallback.enabled,
        definitionExists: falseFallback.definitionExists,
      },
      trueFallback: {
        enabled: trueFallback.enabled,
        definitionExists: trueFallback.definitionExists,
      },
    });
  }

  console.log(
    JSON.stringify({
      manifestFlagCount: manifestFlags.length,
      missingDefinitions,
      fallbackInvariantChecks,
    }),
  );
} finally {
  await Effect.runPromise(Effect.ignore(unleash.close));
}`,
      {
        env: {
          ...process.env,
          ...environment,
        },
        timeoutMs: 45_000,
      },
    );

  it("reconciles manifest feature definitions into the live Unleash runtime", () => {
    const probe = runUnleashRuntimeProbe();

    expect(probe.manifestFlagCount).toBeGreaterThan(0);
    expect(probe.missingDefinitions).toEqual([]);
    expect(probe.fallbackInvariantChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: authorizationFeatureFlag.enabled,
        }),
        expect.objectContaining({
          key: observabilityFeatureFlag.errorTrackingEnabled,
        }),
      ]),
    );

    for (const check of probe.fallbackInvariantChecks) {
      expect(check.falseFallback.definitionExists).toBe(true);
      expect(check.trueFallback.definitionExists).toBe(true);
      expect(check.falseFallback.enabled).toBe(check.trueFallback.enabled);
    }
  });
});
