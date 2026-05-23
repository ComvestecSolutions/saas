import type {
  AdminInvoiceDetailInput,
  AdminInvoiceDetailRouteData,
} from "./invoice-detail-route-data";

/**
 * Loader for `/r/invoice/$invoiceId` (admin-app implementation
 * plan §8.10 + §11 — Phase 4 Domain operator screens commit 1).
 * Consumes the route-server entrypoint so the loader stays free
 * of Request/Response or Valkey shaping.
 */
export const loadAdminInvoiceDetailLoaderData = async (
  input: AdminInvoiceDetailInput,
  loadRouteData: (
    next: AdminInvoiceDetailInput,
  ) => Promise<AdminInvoiceDetailRouteData> = (next) =>
    import("./invoice-detail-route-server").then(
      ({ getAdminInvoiceDetailData }) =>
        getAdminInvoiceDetailData({
          data: next,
        }) as Promise<AdminInvoiceDetailRouteData>,
    ),
): Promise<AdminInvoiceDetailRouteData> => loadRouteData(input);
