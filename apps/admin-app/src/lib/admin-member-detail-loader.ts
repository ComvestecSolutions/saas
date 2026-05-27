import type {
  AdminMemberDetailInput,
  AdminMemberDetailRouteData,
} from "./admin-member-detail-route-data";

export const loadAdminMemberDetailLoaderData = async (
  input: AdminMemberDetailInput,
  loadRouteData: (
    next: AdminMemberDetailInput,
  ) => Promise<AdminMemberDetailRouteData> = (next) =>
    import("./admin-member-detail-route-server").then(
      ({ getAdminMemberDetailData }) =>
        getAdminMemberDetailData({
          data: next,
        }) as Promise<AdminMemberDetailRouteData>,
    ),
): Promise<AdminMemberDetailRouteData> => loadRouteData(input);
