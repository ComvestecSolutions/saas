import { Effect, Option } from "effect";
import { type PlatformScope, reasonCatalogId } from "@comvestec/contracts";
import {
  extractRequiredSubscriberJourneySessionId,
  getPolarCustomerByIdFromEnvironment,
  resolveTrustedRequestContextFromSessionId,
  type PolarCustomerReadView,
} from "@comvestec/platform";
import { retryTransientAdminSessionReadiness } from "./admin-session-readiness";

/**
 * Discriminated-union route data for `/r/invoice/$invoiceId`
 * (admin-app implementation plan §8.10 + §11 — Phase 4 Domain
 * operator screens commit 1). The invoice-detail surface
 * resolves the Polar customer scoped to the invoice via the
 * Phase 1 `getPolarCustomerByIdFromEnvironment` helper. The
 * Polar customer record carries the spend / subscription
 * vocabulary the v2 invoice surface renders today; line-item
 * level detail will land when a typed Polar-invoice helper
 * ships (tracked under the Admin app row's Phase 4 follow-ups).
 *
 * Per `specs/02-apps/admin-app/plan.md §16 Q2` refunds are
 * deep-link-only — the loader carries no mutation surface.
 */
export type AdminInvoiceDetailTenantTarget = {
  readonly scope: PlatformScope;
  readonly scopeId: string;
};

export type AdminInvoiceDetailInput = {
  readonly invoiceId: string;
  readonly tenant: AdminInvoiceDetailTenantTarget;
  readonly customerId: string;
};

export type AdminInvoiceDetailRouteData =
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
      readonly invoiceId: string;
      readonly tenant: AdminInvoiceDetailTenantTarget;
      readonly customer: PolarCustomerReadView;
    };

type GetPolarCustomerById = typeof getPolarCustomerByIdFromEnvironment;
type ResolveTrustedRequestContext =
  typeof resolveTrustedRequestContextFromSessionId;

export type AdminInvoiceDetailDependencies = {
  readonly resolveTrustedRequestContext: ResolveTrustedRequestContext;
  readonly getPolarCustomerById: GetPolarCustomerById;
};

const defaultDependencies: AdminInvoiceDetailDependencies = {
  resolveTrustedRequestContext: resolveTrustedRequestContextFromSessionId,
  getPolarCustomerById: getPolarCustomerByIdFromEnvironment,
};

const buildErrorState = (
  error: unknown,
): Extract<AdminInvoiceDetailRouteData, { readonly kind: "error" }> => ({
  kind: "error",
  title: "Invoice detail unavailable",
  description:
    error instanceof Error && error.message.length > 0
      ? error.message
      : "Invoice detail could not be loaded from the current backend state. Retry shortly; if the problem persists every upstream source is failing and the platform has degraded to an unavailable state.",
});

export const loadAdminInvoiceDetailRouteDataFromRequest = (
  request: Request,
  environment: unknown,
  input: AdminInvoiceDetailInput,
  dependencies: AdminInvoiceDetailDependencies = defaultDependencies,
): Effect.Effect<AdminInvoiceDetailRouteData, never> =>
  extractRequiredSubscriberJourneySessionId(request).pipe(
    Effect.flatMap((sessionId) =>
      retryTransientAdminSessionReadiness(() =>
        dependencies.resolveTrustedRequestContext(environment, sessionId).pipe(
          Effect.flatMap((requestContext) =>
            dependencies
              .getPolarCustomerById(environment, {
                requestContext,
                query: {
                  tenant: input.tenant,
                  customerId: input.customerId,
                  reasonCatalogId: reasonCatalogId.polarCustomerRead,
                },
              })
              .pipe(
                Effect.map(
                  (customerOption): AdminInvoiceDetailRouteData =>
                    Option.match(customerOption, {
                      onNone: (): AdminInvoiceDetailRouteData => ({
                        kind: "error",
                        title: "Invoice customer not found",
                        description:
                          "The Polar customer scoped to this invoice could not be located. The invoice may have been deleted or the customer identifier may be stale.",
                      }),
                      onSome: (customer): AdminInvoiceDetailRouteData => ({
                        kind: "ready",
                        invoiceId: input.invoiceId,
                        tenant: input.tenant,
                        customer,
                      }),
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
    Effect.catchTag("PolarCustomerReadUnauthorized", () =>
      Effect.succeed({
        kind: "denied",
        reason:
          "The current operator session cannot review Polar customer data for this invoice.",
      } as const),
    ),
    Effect.catchAll((error) => Effect.succeed(buildErrorState(error))),
  );
