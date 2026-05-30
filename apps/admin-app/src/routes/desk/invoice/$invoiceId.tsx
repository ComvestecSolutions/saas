import { useState } from "react";
import { Schema } from "effect";
import { RevealField, StateScreen } from "@comvestec/ui";
import { PlatformScopeSchema } from "@comvestec/contracts";
import { createAdminAppFileRoute } from "../../../file-route";
import { ScreenHeader } from "../../../components/ui";
import {
  decodeSchemaOrUndefined,
  decodeSyncBoundary,
} from "../../../lib/effect-boundary";
import { formatAdminInteger } from "../../../lib/number-format";
import type {
  AdminInvoiceDetailInput,
  AdminInvoiceDetailRouteData,
} from "../../../lib/invoice-detail-route-data";

/**
 * `/desk/invoice/$invoiceId` — Invoice detail surface shipped by
 * Phase 4 Domain operator screens commit 1 (admin-app
 * implementation plan §8.10 + §11). Consumes the
 * `invoice-detail-{loader,route-data,route-server}.ts` trio
 * gated end-to-end through
 * `resolveTrustedRequestContextFromSessionId`. Renders the
 * Polar customer summary scoped to the invoice with a
 * deep-link Refund affordance per spec §16 Q2 — refunds are
 * NEVER executed in-app.
 *
 * Regulated-sensitive customer fields (email, billing address)
 * render through `RevealField` so the reveal flow is consistent
 * with the rest of the v2 governance surfaces. Line-item level
 * detail is pending the typed Polar-invoice helper (tracked
 * under the Admin app row's Phase 4 follow-ups).
 */
const RawSearchSchema = Schema.Struct({
  tenantScope: Schema.optional(Schema.String),
  tenantScopeId: Schema.optional(Schema.String),
  customerId: Schema.optional(Schema.String),
});
const RawSearchBoundarySchema = Schema.Struct({
  tenantScope: Schema.optional(Schema.Unknown),
  tenantScopeId: Schema.optional(Schema.Unknown),
  customerId: Schema.optional(Schema.Unknown),
});

type RawSearch = Schema.Schema.Type<typeof RawSearchSchema>;
const decodeRawSearchBoundary = decodeSyncBoundary(RawSearchBoundarySchema);
const decodeSearchString = decodeSchemaOrUndefined(Schema.String);
const decodeTenantScope = decodeSchemaOrUndefined(PlatformScopeSchema);
const decodeNonEmptyString = decodeSchemaOrUndefined(Schema.NonEmptyString);

const validateSearch = (raw: unknown): RawSearch => {
  const search = decodeRawSearchBoundary(raw);
  const tenantScope = decodeSearchString(search.tenantScope);
  const tenantScopeId = decodeSearchString(search.tenantScopeId);
  const customerId = decodeSearchString(search.customerId);

  return {
    ...(tenantScope === undefined ? {} : { tenantScope }),
    ...(tenantScopeId === undefined ? {} : { tenantScopeId }),
    ...(customerId === undefined ? {} : { customerId }),
  };
};

const decodeLoaderInput = (
  invoiceId: string,
  raw: RawSearch,
): AdminInvoiceDetailInput | null => {
  const tenantScope = decodeTenantScope(raw.tenantScope);
  const tenantScopeId = decodeNonEmptyString(raw.tenantScopeId);
  const customerId = decodeNonEmptyString(raw.customerId);
  if (
    tenantScope === undefined ||
    tenantScopeId === undefined ||
    customerId === undefined
  ) {
    return null;
  }
  return {
    invoiceId,
    tenant: {
      scope: tenantScope,
      scopeId: tenantScopeId,
    },
    customerId,
  };
};

const polarInvoiceDeepLinkBase = "https://polar.sh/dashboard/billing/invoices/";

export const Route = createAdminAppFileRoute("/desk/invoice/$invoiceId")({
  validateSearch,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    const input = decodeLoaderInput(params.invoiceId, deps.search);
    if (input === null) {
      return {
        kind: "error" as const,
        title: "Invoice tenant required",
        description:
          "Provide tenantScope, tenantScopeId, and customerId search params to load invoice detail.",
      } satisfies AdminInvoiceDetailRouteData;
    }
    const { loadAdminInvoiceDetailLoaderData } =
      await import("../../../lib/invoice-detail-loader");
    return loadAdminInvoiceDetailLoaderData(input);
  },
  component: InvoiceDetailRoute,
  pendingComponent: () => (
    <StateScreen variant="loading" title="Loading invoice detail…" />
  ),
});

function InvoiceDetailRoute() {
  const data: AdminInvoiceDetailRouteData = Route.useLoaderData();
  const [emailRevealed, setEmailRevealed] = useState(false);
  const [addressRevealed, setAddressRevealed] = useState(false);

  if (data.kind === "shell") {
    return (
      <StateScreen
        variant="denied"
        title="Operator session required"
        description="Sign in with a platform-operator or support-operator session to view invoice detail."
      />
    );
  }
  if (data.kind === "stale-session") {
    return (
      <StateScreen
        variant="stale"
        title="Session refresh required"
        description="Re-authenticate to access invoice detail."
      />
    );
  }
  if (data.kind === "denied") {
    return (
      <StateScreen
        variant="denied"
        title="Access denied"
        description={data.reason}
      />
    );
  }
  if (data.kind === "error") {
    return (
      <StateScreen
        variant="5xx"
        title={data.title}
        description={data.description}
      />
    );
  }

  const { customer, invoiceId, tenant } = data;
  const summary = customer.summary;
  const polarDeepLink = `${polarInvoiceDeepLinkBase}${encodeURIComponent(invoiceId)}`;

  return (
    <section
      data-testid="invoice-detail-ready"
      data-pattern="invoice-detail-v2"
      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}
    >
      <ScreenHeader
        title={`Invoice ${invoiceId}`}
        breadcrumbs={[
          { label: "Resources" },
          { label: "Billing", href: "/desk/billing" },
          { label: invoiceId },
        ]}
        subtitle={
          <>
            Tenant{" "}
            <span className="mono">
              {tenant.scope}/{tenant.scopeId}
            </span>{" "}
            · Polar customer <span className="mono">{summary.customerId}</span>
          </>
        }
      />
      <dl
        data-testid="invoice-detail-customer-card"
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          gap: 6,
          margin: 0,
          padding: 6,
          border: "1px solid var(--bg-2)",
          borderRadius: 4,
          fontSize: "0.8125rem",
        }}
      >
        <dt>Email</dt>
        <dd style={{ margin: 0 }}>
          <RevealField
            label="Email"
            value={<span className="mono">{summary.email}</span>}
            revealed={emailRevealed}
            onReveal={() => setEmailRevealed(true)}
            onHide={() => setEmailRevealed(false)}
          />
        </dd>
        <dt>Name</dt>
        <dd style={{ margin: 0 }}>{summary.name ?? "—"}</dd>
        <dt>Billing address</dt>
        <dd style={{ margin: 0 }}>
          <RevealField
            label="Billing address"
            value={
              summary.billingAddress === undefined
                ? "—"
                : [
                    summary.billingAddress.line1,
                    summary.billingAddress.line2,
                    summary.billingAddress.city,
                    summary.billingAddress.state,
                    summary.billingAddress.postalCode,
                    summary.billingAddress.country,
                  ]
                    .filter((part): part is string => part !== undefined)
                    .join(", ")
            }
            revealed={addressRevealed}
            onReveal={() => setAddressRevealed(true)}
            onHide={() => setAddressRevealed(false)}
          />
        </dd>
        <dt>Total spend (minor units)</dt>
        <dd style={{ margin: 0 }}>
          {formatAdminInteger(summary.totalSpendCents)}
        </dd>
        <dt>Active subscriptions</dt>
        <dd style={{ margin: 0 }}>{summary.subscriptionCount}</dd>
        <dt>Customer created</dt>
        <dd style={{ margin: 0 }} className="mono">
          {summary.createdAt}
        </dd>
      </dl>
      <div style={{ display: "flex", gap: 6 }}>
        <a
          data-testid="invoice-detail-polar-deeplink"
          href={polarDeepLink}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            padding: "6px 10px",
            border: "1px solid var(--bg-2)",
            borderRadius: 4,
            fontSize: "0.8125rem",
          }}
        >
          Open in Polar
        </a>
        <a
          data-testid="invoice-detail-refund-deeplink"
          href={`${polarDeepLink}#refund`}
          target="_blank"
          rel="noreferrer noopener"
          style={{
            padding: "6px 10px",
            border: "1px solid var(--bg-2)",
            borderRadius: 4,
            fontSize: "0.8125rem",
          }}
        >
          Issue refund in Polar
        </a>
      </div>
    </section>
  );
}
