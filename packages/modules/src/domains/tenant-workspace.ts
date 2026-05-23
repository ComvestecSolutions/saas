/**
 * Tenant workspace aggregate v2 module wrapper (admin-app
 * implementation plan §9 item 4).
 *
 * The aggregate has no module-owned persistence; it is composed
 * by the platform service from existing tenant-scoped module
 * services (tenant-management, audit-log, billing-and-metering,
 * tenant-branding, support-operations, etc.) plus per-vendor
 * incident adapters. This wrapper exists so the module-id is
 * reachable from the `@comvestec/modules` barrel for downstream
 * manifest, audit, and tracker consumers without reaching
 * across into `@comvestec/contracts` for the constant alone.
 */
import { platformModuleId } from "@comvestec/contracts";

export const tenantWorkspaceModuleId = platformModuleId.tenantWorkspace;
