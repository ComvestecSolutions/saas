import { Schema } from "effect";
import {
  platformAdapterServiceName,
  PlatformAdapterServiceNameSchema,
  type PlatformAdapterServiceName,
} from "@comvestec/contracts";

/**
 * Re-exports the canonical platform adapter service-name
 * vocabulary owned by `@comvestec/contracts/runtime/
 * platform-adapter-service-names`. The contracts package owns the
 * literal union so first-party services (e.g. the vendor-health
 * aggregator) can decode the same vocabulary at the wire boundary
 * without forcing a `packages/contracts` → `packages/platform`
 * dependency edge.
 *
 * `createPlatformAdapterHealthcheckSchema(...)` stays here because
 * the per-adapter healthcheck shape contract is a platform-side
 * concern (the contracts package never speaks HTTP).
 */
export {
  platformAdapterServiceName,
  PlatformAdapterServiceNameSchema,
  type PlatformAdapterServiceName,
};

export const createPlatformAdapterHealthcheckSchema = <
  const TService extends PlatformAdapterServiceName,
>(
  serviceName: TService,
) =>
  Schema.Struct({
    healthy: Schema.Literal(true),
    service: Schema.Literal(serviceName),
  });
