import { Schema } from "effect";

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

const platformAdapterServiceNames = [
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

export const createPlatformAdapterHealthcheckSchema = <
  const TService extends PlatformAdapterServiceName,
>(
  serviceName: TService,
) =>
  Schema.Struct({
    healthy: Schema.Literal(true),
    service: Schema.Literal(serviceName),
  });
