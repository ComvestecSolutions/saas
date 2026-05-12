import type {
  AdminTenantRepairRouteData,
  AdminTenantRepairRouteLoaderInput,
} from "./tenant-repair-route-data";

export const loadAdminTenantRepairLoaderData = async (
  input: AdminTenantRepairRouteLoaderInput = {},
  loadRouteData: (
    input: AdminTenantRepairRouteLoaderInput,
  ) => Promise<AdminTenantRepairRouteData> = (requestInput) =>
    import("./tenant-repair-route-server").then(
      ({ getAdminTenantRepairData }) =>
        getAdminTenantRepairData(
          requestInput.inspectionReason === undefined
            ? undefined
            : {
                data: {
                  inspectionReason: requestInput.inspectionReason,
                },
              },
        ),
    ),
) => loadRouteData(input);
