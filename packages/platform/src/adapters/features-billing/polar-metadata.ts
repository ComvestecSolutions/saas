import { Schema } from "effect";
import type {
  BillingCheckoutSessionInput,
  BillingPlan,
} from "@comvestec/contracts";

export type PolarMetadataValue = string | number | boolean;

export type PolarMetadata = Readonly<Record<string, PolarMetadataValue>>;

export const polarMetadataKey = {
  planKey: "comvestecPlanKey",
  entitlements: "comvestecEntitlements",
  tenantScope: "comvestecTenantScope",
  tenantScopeId: "comvestecTenantScopeId",
  planId: "comvestecPlanId",
  priceId: "comvestecPriceId",
} as const;

export const PolarMetadataKeySchema = Schema.Literal(
  polarMetadataKey.planKey,
  polarMetadataKey.entitlements,
  polarMetadataKey.tenantScope,
  polarMetadataKey.tenantScopeId,
  polarMetadataKey.planId,
  polarMetadataKey.priceId,
);

export type PolarMetadataKey = Schema.Schema.Type<
  typeof PolarMetadataKeySchema
>;

export type PolarCatalogMetadataField =
  | typeof polarMetadataKey.planKey
  | typeof polarMetadataKey.entitlements;

type PolarCatalogProductMetadataFields = {
  readonly [polarMetadataKey.planKey]: BillingPlan["planKey"];
  readonly [polarMetadataKey.entitlements]: string;
};

export type PolarCatalogProductMetadata = PolarMetadata &
  PolarCatalogProductMetadataFields;

export type PolarCatalogProductMetadataLookup = PolarMetadata &
  Partial<PolarCatalogProductMetadataFields>;

type PolarCheckoutMetadataFields = {
  readonly [polarMetadataKey.tenantScope]: BillingCheckoutSessionInput["tenantScope"];
  readonly [polarMetadataKey.tenantScopeId]: BillingCheckoutSessionInput["tenantScopeId"];
  readonly [polarMetadataKey.planId]: BillingPlan["planId"];
  readonly [polarMetadataKey.priceId]: BillingPlan["prices"][number]["priceId"];
};

export type PolarCheckoutMetadata = PolarMetadata & PolarCheckoutMetadataFields;

export type PolarCheckoutMetadataLookup = PolarMetadata &
  Partial<PolarCheckoutMetadataFields>;

const buildPolarMetadataFieldPath = <TKey extends PolarMetadataKey>(
  key: TKey,
) => `metadata.${key}` as const;

export const polarWebhookMetadataField = {
  tenantScope: buildPolarMetadataFieldPath(polarMetadataKey.tenantScope),
  tenantScopeId: buildPolarMetadataFieldPath(polarMetadataKey.tenantScopeId),
  planId: buildPolarMetadataFieldPath(polarMetadataKey.planId),
  priceId: buildPolarMetadataFieldPath(polarMetadataKey.priceId),
} as const;

export const buildPolarCatalogProductMetadata = (input: {
  readonly planKey: BillingPlan["planKey"];
  readonly entitlements: string;
}): PolarCatalogProductMetadata => ({
  [polarMetadataKey.planKey]: input.planKey,
  [polarMetadataKey.entitlements]: input.entitlements,
});

export const buildPolarCheckoutMetadata = (input: {
  readonly tenantScope: BillingCheckoutSessionInput["tenantScope"];
  readonly tenantScopeId: BillingCheckoutSessionInput["tenantScopeId"];
  readonly planId: BillingPlan["planId"];
  readonly priceId: BillingPlan["prices"][number]["priceId"];
}): PolarCheckoutMetadata => ({
  [polarMetadataKey.tenantScope]: input.tenantScope,
  [polarMetadataKey.tenantScopeId]: input.tenantScopeId,
  [polarMetadataKey.planId]: input.planId,
  [polarMetadataKey.priceId]: input.priceId,
});
