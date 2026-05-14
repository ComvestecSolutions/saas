import type { AdminSupportOperationsRouteData } from "./support-operations-route-data";
import type { AdminBrandingRouteData } from "./branding-route-data";
import type { AdminBillingRouteData } from "./billing-route-data";
import type { AdminComplianceRetentionRouteData } from "./compliance-retention-route-data";
import type { AdminWebhooksApiAccessRouteData } from "./webhooks-api-access-route-data";

export const loadAdminSupportOperationsLoaderData =
  async (): Promise<AdminSupportOperationsRouteData> =>
    import("./operational-route-server").then(
      ({ getAdminSupportOperationsData }) => getAdminSupportOperationsData(),
    );

export const loadAdminBrandingLoaderData = async (
  scope?: string,
  scopeId?: string,
): Promise<AdminBrandingRouteData> =>
  import("./operational-route-server").then(({ getAdminBrandingData }) =>
    getAdminBrandingData({
      data: { scope: scope ?? "organization", scopeId: scopeId ?? "" },
    }),
  );

export const loadAdminBillingLoaderData =
  async (): Promise<AdminBillingRouteData> =>
    import("./operational-route-server").then(({ getAdminBillingData }) =>
      getAdminBillingData(),
    );

export const loadAdminComplianceRetentionLoaderData = async (
  scope?: string,
  scopeId?: string,
): Promise<AdminComplianceRetentionRouteData> =>
  import("./operational-route-server").then(
    ({ getAdminComplianceRetentionData }) =>
      getAdminComplianceRetentionData({
        data: { scope: scope ?? "organization", scopeId: scopeId ?? "" },
      }),
  );

export const loadAdminWebhooksApiAccessLoaderData = async (
  scope?: string,
  scopeId?: string,
): Promise<AdminWebhooksApiAccessRouteData> =>
  import("./operational-route-server").then(
    ({ getAdminWebhooksApiAccessData }) =>
      getAdminWebhooksApiAccessData({
        data: { scope: scope ?? "organization", scopeId: scopeId ?? "" },
      }),
  );
