import { Schema } from "effect";

const CustomDomainLifecycleStateConstantSchema = Schema.Struct({
  unverified: Schema.Literal("unverified"),
  verifying: Schema.Literal("verifying"),
  active: Schema.Literal("active"),
  error: Schema.Literal("error"),
  retired: Schema.Literal("retired"),
});

export const customDomainLifecycleState = Schema.validateSync(
  CustomDomainLifecycleStateConstantSchema,
)({
  unverified: "unverified",
  verifying: "verifying",
  active: "active",
  error: "error",
  retired: "retired",
} satisfies Schema.Schema.Type<
  typeof CustomDomainLifecycleStateConstantSchema
>);

export const customDomainLifecycleStates = [
  customDomainLifecycleState.unverified,
  customDomainLifecycleState.verifying,
  customDomainLifecycleState.active,
  customDomainLifecycleState.error,
  customDomainLifecycleState.retired,
] as const;

export const CustomDomainLifecycleStateSchema = Schema.Literal(
  ...customDomainLifecycleStates,
);

export type CustomDomainLifecycleState = Schema.Schema.Type<
  typeof CustomDomainLifecycleStateSchema
>;

const IdentityBrandingHandoffModeConstantSchema = Schema.Struct({
  brandedRedirect: Schema.Literal("branded-redirect"),
});

export const identityBrandingHandoffMode = Schema.validateSync(
  IdentityBrandingHandoffModeConstantSchema,
)({
  brandedRedirect: "branded-redirect",
} satisfies Schema.Schema.Type<
  typeof IdentityBrandingHandoffModeConstantSchema
>);

export const identityBrandingHandoffModes = [
  identityBrandingHandoffMode.brandedRedirect,
] as const;

export const IdentityBrandingHandoffModeSchema = Schema.Literal(
  ...identityBrandingHandoffModes,
);

export type IdentityBrandingHandoffMode = Schema.Schema.Type<
  typeof IdentityBrandingHandoffModeSchema
>;
