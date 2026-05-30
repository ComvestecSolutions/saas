import { Effect } from "effect";
import {
  type PlatformScope,
  platformScope,
  type TenantBrandingCustomDomainScope,
  type TenantBrandingSupportSafeView,
} from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getTenantBrandingSupportSafeViewFromSessionId,
  resolveTrustedRequestContextFromSessionId,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for the `/desk/branding` Branding
 * & Domains v2 surface (admin-app implementation plan §8.10 +
 * §11 — Phase 4 Domain operator screens commit 2). Mirrors the
 * v2 loader-trio pattern shipped for `/desk/billing`, `/desk/invoice`,
 * and `/desk/meter`. The route component consumes a thin
 * `shell | stale-session | denied | error | ready` discriminated
 * union and reads per-tenant branding posture rows.
 *
 * Backed by the Phase 1 `getTenantBrandingSupportSafeView`
 * helper, which yields the support-safe view (company name,
 * effective scope, custom-domain lifecycle state, last change).
 * Per-tenant theme tokens, asset references, sender-identity and
 * a live side-by-side preview iframe are tracked as Phase 4
 * follow-ups under the Admin app row of the implementation
 * tracker; the loader emits placeholders today so the spine of
 * the spec §8.10 screen is shippable.
 *
 * The branding helper only supports `enterprise` / `organization`
 * scopes — `individual` and `platform` rows are flagged inline
 * as `unsupported` and skipped without failing the whole posture
 * board.
 */
export type AdminBrandingListTenantTarget = {
  readonly scope: PlatformScope;
  readonly scopeId: string;
};

export type AdminBrandingListInput = {
  readonly tenantTargets: readonly AdminBrandingListTenantTarget[];
  readonly selectedTenantId?: string;
};

export type AdminBrandingListRow = {
  readonly tenant: AdminBrandingListTenantTarget;
  readonly branding: TenantBrandingSupportSafeView | null;
  readonly unsupported: boolean;
};

export type AdminBrandingListRouteData =
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
      readonly rows: readonly AdminBrandingListRow[];
      readonly selectedTenantId?: string;
    };

type GetTenantBrandingSupportSafeView =
  typeof getTenantBrandingSupportSafeViewFromSessionId;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminBrandingListDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getTenantBrandingSupportSafeView: GetTenantBrandingSupportSafeView;
};

const defaultDependencies: AdminBrandingListDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getTenantBrandingSupportSafeView:
    getTenantBrandingSupportSafeViewFromSessionId,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminBrandingListRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Branding posture unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Branding posture could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

const toCustomDomainScope = (
  scope: PlatformScope,
): TenantBrandingCustomDomainScope | null => {
  if (scope === platformScope.enterprise) return platformScope.enterprise;
  if (scope === platformScope.organization) return platformScope.organization;
  return null;
};

export const loadAdminBrandingListRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminBrandingListInput,
  dependencies: AdminBrandingListDependencies = defaultDependencies,
): Effect.Effect<AdminBrandingListRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap(() =>
            Effect.forEach(
              input.tenantTargets,
              (tenant) => {
                const brandingScope = toCustomDomainScope(tenant.scope);
                if (brandingScope === null) {
                  return Effect.succeed<AdminBrandingListRow>({
                    tenant,
                    branding: null,
                    unsupported: true,
                  });
                }
                return dependencies
                  .getTenantBrandingSupportSafeView(environment, {
                    sessionId,
                    scope: brandingScope,
                    scopeId: tenant.scopeId,
                  })
                  .pipe(
                    Effect.map(
                      (branding): AdminBrandingListRow => ({
                        tenant,
                        branding,
                        unsupported: false,
                      }),
                    ),
                  );
              },
              { concurrency: 4 },
            ).pipe(
              Effect.map(
                (rows): AdminBrandingListRouteData => ({
                  kind: "ready",
                  rows,
                  ...(input.selectedTenantId === undefined
                    ? {}
                    : { selectedTenantId: input.selectedTenantId }),
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
          "The current operator session cannot inspect support-safe branding data for this tenant set.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
