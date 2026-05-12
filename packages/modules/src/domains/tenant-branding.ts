import { Context, Effect, Layer, ParseResult, Schema } from "effect";
import {
  type CustomDomainVerificationReference,
  type CustomDomainVerificationRecord,
  CustomDomainVerificationReferenceSchema,
  CustomDomainVerificationRecordSchema,
  type CustomDomainVerificationScopeReference,
  CustomDomainVerificationScopeReferenceSchema,
  type CustomDomainLifecycleState,
  customDomainLifecycleState,
  CustomDomainLifecycleStateSchema,
  identityBrandingHandoffMode,
  IdentityBrandingHandoffModeSchema,
  PlatformScopeSchema,
  type PublicBrandingProjection,
  PublicBrandingProjectionSchema,
  type RequestCustomDomainVerificationInput,
  RequestCustomDomainVerificationInputSchema,
  RequestContextSchema,
  type ThemeToken,
  ThemeTokenSchema,
} from "@comvestec/contracts";
import {
  platformHost,
  tenantBrandingConfigKey,
  tenantBrandingRuntimeValueKey,
} from "@comvestec/config";
import {
  type TenantBrandingDomainVerificationPostgresRepositoryService,
  type TenantBrandingDomainVerificationPostgresRepositoryError,
} from "../persistence";

const BrandingResolutionInputSchema = Schema.Struct({
  requestContext: RequestContextSchema,
  entitled: Schema.Boolean,
  values: Schema.Record({ key: Schema.NonEmptyString, value: Schema.Any }),
});

export type BrandingResolutionInput = Schema.Schema.Type<
  typeof BrandingResolutionInputSchema
>;

export { PublicBrandingProjectionSchema, ThemeTokenSchema };
export type { PublicBrandingProjection, ThemeToken };

export const AdminBrandingProjectionSchema = Schema.Struct({
  companyName: Schema.NonEmptyString,
  logoAssetId: Schema.optional(Schema.NonEmptyString),
  faviconAssetId: Schema.optional(Schema.NonEmptyString),
  supportEmail: Schema.optional(Schema.NonEmptyString),
  themeTokens: ThemeTokenSchema,
  effectiveScope: PlatformScopeSchema,
  entitled: Schema.Boolean,
  replyToEmail: Schema.optional(Schema.NonEmptyString),
  customDomainHost: Schema.optional(Schema.NonEmptyString),
  customDomainStatus: CustomDomainLifecycleStateSchema,
});

export const BrandingResolutionResultSchema = Schema.Struct({
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

export type IdentityBrandingHandoffInput = Schema.Schema.Type<
  typeof IdentityBrandingHandoffInputSchema
>;

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

export const platformBrandFallbackCompanyName = "Platform brand fallback";

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
    input: BrandingResolutionInput,
  ) => Effect.Effect<BrandingResolutionResult, ParseResult.ParseError>;
  readonly buildIdentityHandoff: (
    input: IdentityBrandingHandoffInput,
  ) => Effect.Effect<IdentityBrandingHandoff, ParseResult.ParseError>;
  readonly requestCustomDomainVerification: (
    input: RequestCustomDomainVerificationInput,
  ) => Effect.Effect<
    CustomDomainVerificationRecord,
    | ParseResult.ParseError
    | TenantBrandingDomainVerificationPostgresRepositoryError
    | TenantBrandingDomainVerificationRepositoryNotConfiguredError
  >;
  readonly updateCustomDomainVerification: (
    input: CustomDomainVerificationRecord,
  ) => Effect.Effect<
    CustomDomainVerificationRecord | undefined,
    | ParseResult.ParseError
    | TenantBrandingDomainVerificationPostgresRepositoryError
    | TenantBrandingDomainVerificationRepositoryNotConfiguredError
  >;
  readonly findCustomDomainVerification: (
    input: CustomDomainVerificationReference,
  ) => Effect.Effect<
    CustomDomainVerificationRecord | undefined,
    | ParseResult.ParseError
    | TenantBrandingDomainVerificationPostgresRepositoryError
    | TenantBrandingDomainVerificationRepositoryNotConfiguredError
  >;
  readonly findCurrentCustomDomainVerification: (
    input: CustomDomainVerificationScopeReference,
  ) => Effect.Effect<
    CustomDomainVerificationRecord | undefined,
    | ParseResult.ParseError
    | TenantBrandingDomainVerificationPostgresRepositoryError
    | TenantBrandingDomainVerificationRepositoryNotConfiguredError
  >;
};

export type TenantBrandingDomainVerificationRepositoryNotConfiguredError = {
  readonly _tag: "TenantBrandingDomainVerificationRepositoryNotConfiguredError";
};

export type TenantBrandingModuleOptions = {
  readonly domainVerificationRepository?: TenantBrandingDomainVerificationPostgresRepositoryService;
};

export class TenantBrandingModule extends Context.Tag("TenantBrandingModule")<
  TenantBrandingModule,
  TenantBrandingModuleService
>() {}

export const makeTenantBrandingModule = (
  options: TenantBrandingModuleOptions = {},
) =>
  Effect.succeed({
    resolveBranding: (input: BrandingResolutionInput) =>
      Schema.decodeUnknown(BrandingResolutionInputSchema)(input).pipe(
        Effect.flatMap((request) => {
          const hasMaterializedValues = Object.keys(request.values).length > 0;
          const companyName = hasMaterializedValues
            ? (getBrandingStringValue(
                request.values,
                tenantBrandingConfigKey.companyName,
              ) ?? platformBrandFallbackCompanyName)
            : platformBrandFallbackCompanyName;

          return (
            hasMaterializedValues
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
                  logoAssetId: hasMaterializedValues
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.logoAssetId,
                      )
                    : undefined,
                  faviconAssetId: hasMaterializedValues
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.faviconAssetId,
                      )
                    : undefined,
                  supportEmail: hasMaterializedValues
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
                  logoAssetId: hasMaterializedValues
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.logoAssetId,
                      )
                    : undefined,
                  faviconAssetId: hasMaterializedValues
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.faviconAssetId,
                      )
                    : undefined,
                  supportEmail: hasMaterializedValues
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.supportEmail,
                      )
                    : undefined,
                  replyToEmail: hasMaterializedValues
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.replyToEmail,
                      )
                    : undefined,
                  customDomainHost: hasMaterializedValues
                    ? getBrandingStringValue(
                        request.values,
                        tenantBrandingConfigKey.customDomainHost,
                      )
                    : undefined,
                  customDomainStatus:
                    getCustomDomainStatus(request.values) ??
                    customDomainLifecycleState.unverified,
                  themeTokens,
                  effectiveScope: request.requestContext.tenant.scope,
                  entitled: request.entitled,
                },
              }),
            ),
          );
        }),
      ),
    buildIdentityHandoff: (input: IdentityBrandingHandoffInput) =>
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
    requestCustomDomainVerification: (
      input: RequestCustomDomainVerificationInput,
    ): Effect.Effect<
      CustomDomainVerificationRecord,
      | ParseResult.ParseError
      | TenantBrandingDomainVerificationPostgresRepositoryError
      | TenantBrandingDomainVerificationRepositoryNotConfiguredError
    > =>
      Effect.gen(function* () {
        const request = yield* Schema.decodeUnknown(
          RequestCustomDomainVerificationInputSchema,
        )(input);
        const repository = options.domainVerificationRepository;

        if (repository === undefined) {
          return yield* Effect.fail({
            _tag: "TenantBrandingDomainVerificationRepositoryNotConfiguredError",
          } satisfies TenantBrandingDomainVerificationRepositoryNotConfiguredError);
        }

        const changedAt = new Date().toISOString();
        const record = yield* repository.createCustomDomainVerification({
          verificationId: [
            "tenant-branding",
            "custom-domain",
            request.scope,
            request.scopeId,
            crypto.randomUUID(),
          ].join(":"),
          scope: request.scope,
          scopeId: request.scopeId,
          requestedHost: request.requestedHost.toLowerCase(),
          lifecycleState: customDomainLifecycleState.unverified,
          changedAt,
        });

        return yield* Schema.decodeUnknown(
          CustomDomainVerificationRecordSchema,
        )(record);
      }),
    updateCustomDomainVerification: (
      input: CustomDomainVerificationRecord,
    ): Effect.Effect<
      CustomDomainVerificationRecord | undefined,
      | ParseResult.ParseError
      | TenantBrandingDomainVerificationPostgresRepositoryError
      | TenantBrandingDomainVerificationRepositoryNotConfiguredError
    > =>
      Effect.gen(function* () {
        const record = yield* Schema.decodeUnknown(
          CustomDomainVerificationRecordSchema,
        )(input);
        const repository = options.domainVerificationRepository;

        if (repository === undefined) {
          return yield* Effect.fail({
            _tag: "TenantBrandingDomainVerificationRepositoryNotConfiguredError",
          } satisfies TenantBrandingDomainVerificationRepositoryNotConfiguredError);
        }

        return yield* repository.updateCustomDomainVerification(record);
      }),
    findCustomDomainVerification: (
      input: CustomDomainVerificationReference,
    ): Effect.Effect<
      CustomDomainVerificationRecord | undefined,
      | ParseResult.ParseError
      | TenantBrandingDomainVerificationPostgresRepositoryError
      | TenantBrandingDomainVerificationRepositoryNotConfiguredError
    > =>
      Effect.gen(function* () {
        const reference = yield* Schema.decodeUnknown(
          CustomDomainVerificationReferenceSchema,
        )(input);
        const repository = options.domainVerificationRepository;

        if (repository === undefined) {
          return yield* Effect.fail({
            _tag: "TenantBrandingDomainVerificationRepositoryNotConfiguredError",
          } satisfies TenantBrandingDomainVerificationRepositoryNotConfiguredError);
        }

        return yield* repository.findCustomDomainVerification({
          ...reference,
          requestedHost: reference.requestedHost.toLowerCase(),
        });
      }),
    findCurrentCustomDomainVerification: (
      input: CustomDomainVerificationScopeReference,
    ): Effect.Effect<
      CustomDomainVerificationRecord | undefined,
      | ParseResult.ParseError
      | TenantBrandingDomainVerificationPostgresRepositoryError
      | TenantBrandingDomainVerificationRepositoryNotConfiguredError
    > =>
      Effect.gen(function* () {
        const reference = yield* Schema.decodeUnknown(
          CustomDomainVerificationScopeReferenceSchema,
        )(input);
        const repository = options.domainVerificationRepository;

        if (repository === undefined) {
          return yield* Effect.fail({
            _tag: "TenantBrandingDomainVerificationRepositoryNotConfiguredError",
          } satisfies TenantBrandingDomainVerificationRepositoryNotConfiguredError);
        }

        return yield* repository.findCurrentCustomDomainVerification(reference);
      }),
  } satisfies TenantBrandingModuleService);

export const TenantBrandingModuleLive = Layer.effect(
  TenantBrandingModule,
  makeTenantBrandingModule(),
);
