import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type CustomDomainLifecycleState,
  customDomainLifecycleState,
  CustomDomainLifecycleStateSchema,
  identityBrandingHandoffMode,
  IdentityBrandingHandoffModeSchema,
  PlatformScopeSchema,
  RequestContextSchema,
} from "@comvestec/contracts";
import {
  platformHost,
  tenantBrandingConfigKey,
  tenantBrandingRuntimeValueKey,
} from "@comvestec/config";

const ThemeTokenSchema = Schema.Struct({
  primary: Schema.NonEmptyString,
  secondary: Schema.NonEmptyString,
  accent: Schema.NonEmptyString,
});

export type ThemeToken = Schema.Schema.Type<typeof ThemeTokenSchema>;

const BrandingResolutionInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  entitled: Schema.Boolean,
  values: Schema.Record({ key: Schema.NonEmptyString, value: Schema.Any }),
});

const PublicBrandingProjectionSchema = Schema.Struct({
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

const AdminBrandingProjectionSchema = Schema.Struct({
  companyName: Schema.NonEmptyString,
  logoAssetId: Schema.optional(Schema.NonEmptyString),
  faviconAssetId: Schema.optional(Schema.NonEmptyString),
  supportEmail: Schema.optional(Schema.NonEmptyString),
  replyToEmail: Schema.optional(Schema.NonEmptyString),
  customDomainHost: Schema.optional(Schema.NonEmptyString),
  customDomainStatus: CustomDomainLifecycleStateSchema,
  effectiveScope: PlatformScopeSchema,
  entitled: Schema.Boolean,
});

const BrandingResolutionResultSchema = Schema.Struct({
  publicProjection: PublicBrandingProjectionSchema,
  adminProjection: AdminBrandingProjectionSchema,
});

export type BrandingResolutionResult = Schema.Schema.Type<
  typeof BrandingResolutionResultSchema
>;

const IdentityBrandingHandoffInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  loginBaseUrl: Schema.NonEmptyString,
  branding: PublicBrandingProjectionSchema,
});

export const IdentityBrandingHandoffSchema = Schema.Struct({
  mode: IdentityBrandingHandoffModeSchema,
  loginUrl: Schema.NonEmptyString,
  host: Schema.NonEmptyString,
  tenantHint: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  themeHint: Schema.NonEmptyString,
  correlationId: Schema.NonEmptyString,
});

export type IdentityBrandingHandoff = Schema.Schema.Type<
  typeof IdentityBrandingHandoffSchema
>;

const defaultThemeTokens = Schema.validateSync(ThemeTokenSchema)({
  primary: "#0F172A",
  secondary: "#334155",
  accent: "#0EA5E9",
} satisfies ThemeToken);

type BrandingValueMap = Schema.Schema.Type<
  typeof BrandingResolutionInputSchema
>["values"];

const getBrandingStringValue = (values: BrandingValueMap, key: string) =>
  values[key] as string | undefined;

const getCustomDomainStatus = (values: BrandingValueMap) =>
  values[tenantBrandingRuntimeValueKey.customDomainStatus] as
    | CustomDomainLifecycleState
    | undefined;

export type TenantBrandingModuleService = {
  readonly resolveBranding: (
    input: unknown,
  ) => Effect.Effect<BrandingResolutionResult, ParseResult.ParseError>;
  readonly buildIdentityHandoff: (
    input: unknown,
  ) => Effect.Effect<IdentityBrandingHandoff, ParseResult.ParseError>;
};

export class TenantBrandingModule extends Context.Tag("TenantBrandingModule")<
  TenantBrandingModule,
  TenantBrandingModuleService
>() {}

export const makeTenantBrandingModule = () =>
  Effect.succeed<TenantBrandingModuleService>({
    resolveBranding: (input: unknown) =>
      Schema.decodeUnknown(BrandingResolutionInputSchema)(input).pipe(
        Effect.flatMap((request) => {
          const companyName = request.entitled
            ? (getBrandingStringValue(
                request.values,
                tenantBrandingConfigKey.companyName,
              ) ?? "Platform brand fallback")
            : "Platform brand fallback";

          return (
            request.entitled
              ? Schema.decodeUnknown(ThemeTokenSchema)({
                  primary:
                    getBrandingStringValue(
                      request.values,
                      tenantBrandingConfigKey.themePrimary,
                    ) ?? defaultThemeTokens.primary,
                  secondary:
                    getBrandingStringValue(
                      request.values,
                      tenantBrandingConfigKey.themeSecondary,
                    ) ?? defaultThemeTokens.secondary,
                  accent:
                    getBrandingStringValue(
                      request.values,
                      tenantBrandingConfigKey.themeAccent,
                    ) ?? defaultThemeTokens.accent,
                })
              : Effect.succeed(defaultThemeTokens)
          ).pipe(
            Effect.flatMap((themeTokens) =>
              Schema.decodeUnknown(BrandingResolutionResultSchema)({
                publicProjection: {
                  companyName,
                  logoAssetId: request.entitled
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.logoAssetId,
                      )
                    : undefined,
                  faviconAssetId: request.entitled
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.faviconAssetId,
                      )
                    : undefined,
                  supportEmail: request.entitled
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.supportEmail,
                      )
                    : undefined,
                  themeTokens,
                  effectiveScope: request.requestContext.tenant.scope,
                  entitled: request.entitled,
                },
                adminProjection: {
                  companyName,
                  logoAssetId: request.entitled
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.logoAssetId,
                      )
                    : undefined,
                  faviconAssetId: request.entitled
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.faviconAssetId,
                      )
                    : undefined,
                  supportEmail: request.entitled
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.supportEmail,
                      )
                    : undefined,
                  replyToEmail: request.entitled
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.replyToEmail,
                      )
                    : undefined,
                  customDomainHost: request.entitled
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.customDomainHost,
                      )
                    : undefined,
                  customDomainStatus:
                    getCustomDomainStatus(request.values) ??
                    customDomainLifecycleState.unverified,
                  effectiveScope: request.requestContext.tenant.scope,
                  entitled: request.entitled,
                },
              }),
            ),
          );
        }),
      ),
    buildIdentityHandoff: (input: unknown) =>
      Schema.decodeUnknown(IdentityBrandingHandoffInputSchema)(input).pipe(
        Effect.flatMap((request) =>
          Schema.decodeUnknown(IdentityBrandingHandoffSchema)({
            mode: identityBrandingHandoffMode.brandedRedirect,
            loginUrl:
              `${request.loginBaseUrl}?tenant_hint=${request.requestContext.tenant.scopeId}` +
              `&brand=${encodeURIComponent(request.branding.companyName)}` +
              `&return_host=${encodeURIComponent(request.requestContext.host ?? platformHost.localDevelopment)}`,
            host: request.requestContext.host ?? platformHost.localDevelopment,
            tenantHint: request.requestContext.tenant.scopeId,
            displayName: request.branding.companyName,
            themeHint: request.branding.themeTokens.primary,
            correlationId: request.requestContext.correlationId,
          }),
        ),
      ),
  });

export const TenantBrandingModuleLive = Layer.effect(
  TenantBrandingModule,
  makeTenantBrandingModule(),
);
