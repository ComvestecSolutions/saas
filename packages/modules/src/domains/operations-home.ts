/**
 * Operations Home aggregate v2 module wrapper (admin-app
 * implementation plan §9 item 3).
 *
 * The aggregate has no module-owned persistence; it is composed
 * by the platform service from existing module services
 * (audit-log, tenant-management, identity-session, etc.) plus
 * vendor adapters. This wrapper exists so that the module-id is
 * reachable from the `@comvestec/modules` barrel for downstream
 * manifest, audit, and tracker consumers without having to reach
 * across into `@comvestec/contracts` for the constant alone.
 */
import { platformModuleId } from "@comvestec/contracts";

export const operationsHomeModuleId = platformModuleId.operationsHome;
