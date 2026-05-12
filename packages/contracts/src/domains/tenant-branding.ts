import { Schema } from "effect";
import { PlatformScopeSchema, platformScope } from "../access/platform-scopes";
import { IsoTimestampSchema } from "../runtime/timestamps";

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

export const TenantBrandingScopeSchema = Schema.Literal(
  platformScope.platform,
  platformScope.enterprise,
  platformScope.organization,
);

export type TenantBrandingScope = Schema.Schema.Type<
  typeof TenantBrandingScopeSchema
>;

export const TenantBrandingCustomDomainScopeSchema = Schema.Literal(
  platformScope.enterprise,
  platformScope.organization,
);

export type TenantBrandingCustomDomainScope = Schema.Schema.Type<
  typeof TenantBrandingCustomDomainScopeSchema
>;

export const ThemeTokenSchema = Schema.Struct({
  primary: Schema.NonEmptyString,
  secondary: Schema.NonEmptyString,
  accent: Schema.NonEmptyString,
});

export type ThemeToken = Schema.Schema.Type<typeof ThemeTokenSchema>;

export const PublicBrandingProjectionSchema = Schema.Struct({
  companyName: Schema.NonEmptyString,
  logoAssetId: Schema.optional(Schema.NonEmptyString),
  faviconAssetId: Schema.optional(Schema.NonEmptyString),
  supportEmail: Schema.optional(Schema.NonEmptyString),
  themeTokens: ThemeTokenSchema,
  effectiveScope: PlatformScopeSchema,
  entitled: Schema.Boolean,
});

export type PublicBrandingProjection = Schema.Schema.Type<
  typeof PublicBrandingProjectionSchema
>;

const customDomainHostLabelPattern = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;
const ipv4AddressPattern = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const isValidCustomDomainHost = (value: string) => {
  if (
    value.length > 253 ||
    !value.includes(".") ||
    ipv4AddressPattern.test(value) ||
    value.includes("://") ||
    value.includes("/") ||
    /\s/.test(value)
  ) {
    return false;
  }

  return value
    .split(".")
    .every((label) => customDomainHostLabelPattern.test(label));
};

export const CustomDomainHostSchema = Schema.NonEmptyString.pipe(
  Schema.filter((value) => isValidCustomDomainHost(value)),
);

export type CustomDomainHost = Schema.Schema.Type<
  typeof CustomDomainHostSchema
>;

export const CustomDomainVerificationScopeReferenceSchema = Schema.Struct({
  scope: TenantBrandingCustomDomainScopeSchema,
  scopeId: Schema.NonEmptyString,
});

export type CustomDomainVerificationScopeReference = Schema.Schema.Type<
  typeof CustomDomainVerificationScopeReferenceSchema
>;

export const CustomDomainVerificationReferenceSchema = Schema.Struct({
  scope: TenantBrandingCustomDomainScopeSchema,
  scopeId: Schema.NonEmptyString,
  requestedHost: CustomDomainHostSchema,
});

export type CustomDomainVerificationReference = Schema.Schema.Type<
  typeof CustomDomainVerificationReferenceSchema
>;

export const CustomDomainVerificationRecordSchema = Schema.Struct({
  verificationId: Schema.NonEmptyString,
  scope: TenantBrandingCustomDomainScopeSchema,
  scopeId: Schema.NonEmptyString,
  requestedHost: CustomDomainHostSchema,
  lifecycleState: CustomDomainLifecycleStateSchema,
  dnsProof: Schema.optional(
    Schema.Record({ key: Schema.NonEmptyString, value: Schema.Unknown }),
  ),
  approvedBy: Schema.optional(Schema.NonEmptyString),
  approvalNotes: Schema.optional(Schema.NonEmptyString),
  changedAt: IsoTimestampSchema,
});

export type CustomDomainVerificationRecord = Schema.Schema.Type<
  typeof CustomDomainVerificationRecordSchema
>;

export const CustomDomainVerificationAdminViewSchema = Schema.Struct({
  verificationId: Schema.NonEmptyString,
  scope: TenantBrandingCustomDomainScopeSchema,
  scopeId: Schema.NonEmptyString,
  requestedHost: CustomDomainHostSchema,
  lifecycleState: CustomDomainLifecycleStateSchema,
  changedAt: IsoTimestampSchema,
});

export type CustomDomainVerificationAdminView = Schema.Schema.Type<
  typeof CustomDomainVerificationAdminViewSchema
>;

export const TenantBrandingSupportSafeViewSchema = Schema.Struct({
  scope: TenantBrandingCustomDomainScopeSchema,
  scopeId: Schema.NonEmptyString,
  companyName: Schema.NonEmptyString,
  customDomainStatus: CustomDomainLifecycleStateSchema,
  effectiveScope: PlatformScopeSchema,
  changedAt: Schema.optional(IsoTimestampSchema),
});

export type TenantBrandingSupportSafeView = Schema.Schema.Type<
  typeof TenantBrandingSupportSafeViewSchema
>;

const TenantBrandingAssetKindConstantSchema = Schema.Struct({
  logo: Schema.Literal("logo"),
  favicon: Schema.Literal("favicon"),
});

export const tenantBrandingAssetKind = Schema.validateSync(
  TenantBrandingAssetKindConstantSchema,
)({
  logo: "logo",
  favicon: "favicon",
} satisfies Schema.Schema.Type<typeof TenantBrandingAssetKindConstantSchema>);

export const tenantBrandingAssetKinds = [
  tenantBrandingAssetKind.logo,
  tenantBrandingAssetKind.favicon,
] as const;

export const TenantBrandingAssetKindSchema = Schema.Literal(
  ...tenantBrandingAssetKinds,
);

export type TenantBrandingAssetKind = Schema.Schema.Type<
  typeof TenantBrandingAssetKindSchema
>;

export const TenantBrandingPublishedAssetReferenceViewSchema = Schema.Struct({
  scope: TenantBrandingScopeSchema,
  scopeId: Schema.NonEmptyString,
  assetKind: TenantBrandingAssetKindSchema,
  fileId: Schema.NonEmptyString,
  changedAt: IsoTimestampSchema,
});

export type TenantBrandingPublishedAssetReferenceView = Schema.Schema.Type<
  typeof TenantBrandingPublishedAssetReferenceViewSchema
>;

export const RequestCustomDomainVerificationInputSchema = Schema.Struct({
  scope: TenantBrandingCustomDomainScopeSchema,
  scopeId: Schema.NonEmptyString,
  requestedHost: CustomDomainHostSchema,
});

export type RequestCustomDomainVerificationInput = Schema.Schema.Type<
  typeof RequestCustomDomainVerificationInputSchema
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
