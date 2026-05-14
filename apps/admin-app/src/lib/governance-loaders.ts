import type { PlatformModuleId } from "@comvestec/contracts";
import type { AdminRuntimeConfigRouteData } from "./runtime-config-route-data";
import type { AdminFeatureFlagsRouteData } from "./feature-flags-route-data";
import type {
  AdminAccessControlLoaderInput,
  AdminAccessControlRouteData,
} from "./access-control-route-data";
import type { AdminAuditLogRouteData } from "./audit-log-route-data";

export const loadAdminRuntimeConfigLoaderData =
  async (): Promise<AdminRuntimeConfigRouteData> =>
    import("./governance-route-server").then(({ getAdminRuntimeConfigData }) =>
      getAdminRuntimeConfigData(),
    );

export const loadAdminFeatureFlagsLoaderData =
  async (): Promise<AdminFeatureFlagsRouteData> =>
    import("./governance-route-server").then(({ getAdminFeatureFlagsData }) =>
      getAdminFeatureFlagsData(),
    );

export const loadAdminAccessControlLoaderData = async (
  input: AdminAccessControlLoaderInput = {},
): Promise<AdminAccessControlRouteData> =>
  import("./governance-route-server").then(({ getAdminAccessControlData }) =>
    Object.keys(input).length === 0
      ? getAdminAccessControlData()
      : getAdminAccessControlData({ data: input }),
  );

export const loadAdminAuditLogLoaderData = async (
  moduleId?: PlatformModuleId,
): Promise<AdminAuditLogRouteData> =>
  import("./governance-route-server").then(({ getAdminAuditLogData }) =>
    moduleId === undefined
      ? getAdminAuditLogData()
      : getAdminAuditLogData({ data: { moduleId } }),
  );
