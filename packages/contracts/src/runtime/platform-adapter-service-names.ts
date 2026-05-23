import { Schema } from "effect";

/**
 * Canonical platform adapter service-name vocabulary, declared once
 * at the contracts boundary so first-party services that need a
 * typed `serviceName` (e.g. the vendor-health aggregator) can decode
 * the same literal union the platform adapters use without forcing
 * `packages/contracts` to depend on `packages/platform`.
 *
 * The platform-side `packages/platform/src/adapters/service-names.ts`
 * re-exports this surface so adapter authors keep the existing
 * import path. Any new adapter MUST be added here AND, if it
 * exposes a healthcheck, picked up by
 * `createPlatformAdapterHealthcheckSchema(...)` in the platform
 * adapters barrel.
 */
const PlatformAdapterServiceNameConstantSchema = Schema.Struct({
  convex: Schema.Literal("convex"),
  glitchtip: Schema.Literal("glitchtip"),
  keycloak: Schema.Literal("keycloak"),
  meilisearch: Schema.Literal("meilisearch"),
  novu: Schema.Literal("novu"),
  openpanel: Schema.Literal("openpanel"),
  observability: Schema.Literal("observability"),
  openmeter: Schema.Literal("openmeter"),
  oryKeto: Schema.Literal("ory-keto"),
  polar: Schema.Literal("polar"),
  postal: Schema.Literal("postal"),
  postgres: Schema.Literal("postgres"),
  unleash: Schema.Literal("unleash"),
  valkey: Schema.Literal("valkey"),
});

export const platformAdapterServiceName = Schema.validateSync(
  PlatformAdapterServiceNameConstantSchema,
)({
  convex: "convex",
  glitchtip: "glitchtip",
  keycloak: "keycloak",
  meilisearch: "meilisearch",
  novu: "novu",
  openpanel: "openpanel",
  observability: "observability",
  openmeter: "openmeter",
  oryKeto: "ory-keto",
  polar: "polar",
  postal: "postal",
  postgres: "postgres",
  unleash: "unleash",
  valkey: "valkey",
} satisfies Schema.Schema.Type<
  typeof PlatformAdapterServiceNameConstantSchema
>);

export const platformAdapterServiceNames = [
  platformAdapterServiceName.convex,
  platformAdapterServiceName.glitchtip,
  platformAdapterServiceName.keycloak,
  platformAdapterServiceName.meilisearch,
  platformAdapterServiceName.novu,
  platformAdapterServiceName.openpanel,
  platformAdapterServiceName.observability,
  platformAdapterServiceName.openmeter,
  platformAdapterServiceName.oryKeto,
  platformAdapterServiceName.polar,
  platformAdapterServiceName.postal,
  platformAdapterServiceName.postgres,
  platformAdapterServiceName.unleash,
  platformAdapterServiceName.valkey,
] as const;

export const PlatformAdapterServiceNameSchema = Schema.Literal(
  ...platformAdapterServiceNames,
);

export type PlatformAdapterServiceName = Schema.Schema.Type<
  typeof PlatformAdapterServiceNameSchema
>;
