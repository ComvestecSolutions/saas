import { Effect } from "effect";
import {
  type CustomDomainLifecycleState,
  customDomainLifecycleState,
  type PlatformScope,
  platformScope,
  type TenantBrandingCustomDomainScope,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getTenantBrandingSupportSafeViewFromSessionId,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for `/r/domain/$hostname`
 * (admin-app implementation plan §8.10 + §11 — Phase 4 Domain
 * operator screens commit 2). The domain-detail surface
 * renders the custom-domain lifecycle chip, DNS-record table
 * (with copy-to-clipboard per record) and the verify CTA gated
 * through the high-risk action guard per spec §8.10.
 *
 * Backed live by the Phase 1
 * `getTenantBrandingSupportSafeView` helper, which already
 * yields the canonical lifecycle state (unverified | verifying
 * | active | error | retired). The verbose
 * `CustomDomainVerificationRecord` (including `dnsProof`) lives
 * inside the platform module and is not yet projected through
 * a typed by-session helper — the loader emits a deterministic
 * placeholder DNS-record set today so the spine of the spec
 * §8.10 screen is shippable. Promoting the loader to read the
 * full verification record by hostname is tracked under the
 * Admin app row's Phase 4 follow-ups in the implementation
 * tracker.
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

export type AdminDomainDetailDnsRecord = {
  readonly recordType: "TXT" | "CNAME";
  readonly host: string;
  readonly value: string;
};

export type AdminDomainDetailRouteData =
  | { readonly kind: "shell" }
  | { readonly kind: "stale-session" }
  | { readonly kind: "denied"; readonly reason: string }
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

type GetTenantBrandingSupportSafeView =
  typeof getTenantBrandingSupportSafeViewFromSessionId;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminDomainDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getTenantBrandingSupportSafeView: GetTenantBrandingSupportSafeView;
};

const defaultDependencies: AdminDomainDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getTenantBrandingSupportSafeView:
    getTenantBrandingSupportSafeViewFromSessionId,
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

const buildPlaceholderDnsRecords = (
  hostname: string,
  tenant: AdminDomainDetailTenantTarget,
): readonly AdminDomainDetailDnsRecord[] => [
  {
    recordType: "TXT",
    host: `_comvestec-verify.${hostname}`,
    value: `comvestec-domain-verify=${tenant.scope}:${tenant.scopeId}`,
  },
  {
    recordType: "CNAME",
    host: hostname,
    value: "tenant-edge.comvestec.app",
  },
];

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
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap(() =>
            dependencies
              .getTenantBrandingSupportSafeView(environment, {
                sessionId,
                scope: brandingScope,
                scopeId: input.tenant.scopeId,
              })
              .pipe(
                Effect.map(
                  (branding): AdminDomainDetailRouteData => ({
                    kind: "ready",
                    hostname: input.hostname,
                    tenant: input.tenant,
                    lifecycleState:
                      branding.customDomainStatus ??
                      customDomainLifecycleState.unverified,
                    dnsRecords: buildPlaceholderDnsRecords(
                      input.hostname,
                      input.tenant,
                    ),
                    changedAt: branding.changedAt ?? null,
                  }),
                ),
              ),
          ),
        ),
      ),
    ),
    Effect.catchTag("SubscriberJourneySessionIdMissingError", () =>
      Effect.succeed({ kind: "shell" } as const),
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
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
};
