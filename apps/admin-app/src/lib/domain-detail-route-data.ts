import { Effect, Schema } from "effect";
import {
  type CustomDomainLifecycleState,
  type CustomDomainVerificationRecord,
  type PlatformScope,
  platformScope,
  type TenantBrandingCustomDomainScope,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getCustomDomainVerificationFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for `/desk/domain/$hostname`
 * (admin-app implementation plan §8.10 + §11 — Phase 4 Domain
 * operator screens commit 2). The domain-detail surface
 * renders the custom-domain lifecycle chip, DNS-record table
 * (with copy-to-clipboard per record) and the verify CTA gated
 * through the high-risk action guard per spec §8.10.
 *
 * Backed live by the Phase 1
 * `getCustomDomainVerification` helper, which yields the
 * current verification record (including the optional `dnsProof`
 * payload) through the trusted session. The route now projects
 * live DNS proof rows when the record carries a `records`
 * collection and falls back to an honest empty DNS-proof state
 * when the verification exists but no publishable proof rows
 * have been stored yet.
 *
 * The branding helper only supports `enterprise` /
 * `organization` scopes — `individual` and `platform` tenant
 * targets short-circuit to a `denied` posture.
 */
export type AdminDomainDetailTenantTarget = {
  readonly scope: PlatformScope;
  readonly scopeId: string;
};

export type AdminDomainDetailInput = {
  readonly hostname: string;
  readonly tenant: AdminDomainDetailTenantTarget;
};

const AdminDomainDetailDnsRecordSchema = Schema.Struct({
  recordType: Schema.Literal("TXT", "CNAME"),
  host: Schema.NonEmptyString,
  value: Schema.NonEmptyString,
});

export type AdminDomainDetailDnsRecord = Schema.Schema.Type<
  typeof AdminDomainDetailDnsRecordSchema
>;

const AdminDomainDetailDnsProofSchema = Schema.Struct({
  records: Schema.Array(AdminDomainDetailDnsRecordSchema),
});

const isAdminDomainDetailDnsProof = Schema.is(AdminDomainDetailDnsProofSchema);

export type AdminDomainDetailRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
  | {
      readonly kind: "not-found";
      readonly title: string;
      readonly description: string;
    }
  | {
      readonly kind: "error";
      readonly title: string;
      readonly description: string;
    }
  | {
      readonly kind: "ready";
      readonly hostname: string;
      readonly tenant: AdminDomainDetailTenantTarget;
      readonly lifecycleState: CustomDomainLifecycleState;
      readonly dnsRecords: readonly AdminDomainDetailDnsRecord[];
      readonly changedAt: string | null;
    };

type GetCustomDomainVerification =
  typeof getCustomDomainVerificationFromSessionId;

export type AdminDomainDetailDependencies = {
  readonly getCustomDomainVerification: GetCustomDomainVerification;
};

const defaultDependencies: AdminDomainDetailDependencies = {
  getCustomDomainVerification: getCustomDomainVerificationFromSessionId,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminDomainDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Domain detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Domain detail could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

const toCustomDomainScope = (
  scope: PlatformScope,
): TenantBrandingCustomDomainScope | null => {
  if (scope === platformScope.enterprise) return platformScope.enterprise;
  if (scope === platformScope.organization) return platformScope.organization;
  return null;
};

const buildDomainNotFoundState = (
  input: AdminDomainDetailInput,
): Extract<AdminDomainDetailRouteData, { readonly kind: "not-found" }> => ({
  kind: "not-found",
  title: "Domain not found",
  description: `No custom-domain verification record was found for '${input.hostname}' under ${input.tenant.scope}/${input.tenant.scopeId}.`,
});

const decodeDnsProofRecords = (
  dnsProof: CustomDomainVerificationRecord["dnsProof"],
): readonly AdminDomainDetailDnsRecord[] =>
  dnsProof !== undefined && isAdminDomainDetailDnsProof(dnsProof)
    ? dnsProof.records
    : [];

export const loadAdminDomainDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminDomainDetailInput,
  dependencies: AdminDomainDetailDependencies = defaultDependencies,
): Effect.Effect<AdminDomainDetailRouteData, never> => {
  const brandingScope = toCustomDomainScope(input.tenant.scope);
  if (brandingScope === null) {
    return Effect.succeed({
      kind: "denied",
      reason:
        "Custom-domain lifecycle is only available for enterprise or organization tenants.",
    } as const);
  }

  return extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies
          .getCustomDomainVerification(environment, {
            sessionId,
            scope: brandingScope,
            scopeId: input.tenant.scopeId,
            requestedHost: input.hostname,
          })
          .pipe(
            Effect.map(
              (verification): AdminDomainDetailRouteData => ({
                kind: "ready",
                hostname: verification.requestedHost,
                tenant: input.tenant,
                lifecycleState: verification.lifecycleState,
                dnsRecords: decodeDnsProofRecords(verification.dnsProof),
                changedAt: verification.changedAt,
              }),
            ),
          ),
      ),
    ),
    Effect.catchTag("TenantBrandingCustomDomainVerificationNotFoundError", () =>
      Effect.succeed(buildDomainNotFoundState(input)),
    ),
    Effect.catchTag("TenantBrandingUnauthenticatedActorError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("IdentitySessionRequestContextNotFoundError", () =>
      Effect.succeed({ kind: "stale-session" } as const),
    ),
    Effect.catchTag("TenantBrandingAccessDeniedError", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot inspect custom-domain lifecycle for this tenant target.",
      } as const),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
};
