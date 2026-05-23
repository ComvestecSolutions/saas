/**
 * Operator Desk patterns barrel (admin-app spec §7).
 *
 * Slice 1b decision 1c: the canonical `StatusChip` is the typed
 * semantic alias in `patterns/data/`. The barrel additionally
 * re-exports the legacy `patterns/admin/StatusChip` as
 * `LegacyStatusChip` + keeps `resolveStatusVariant` exported under
 * its original name as a temporary back-compat hook for admin-app
 * routes. Slice 1b-tail finishes the tear-down and removes
 * `patterns/admin/*` entirely.
 */
export {
  AdminShell,
  SideNav,
  ContextHeader,
  EmptyState,
  LoadingState,
  ErrorState,
  PermissionDeniedState,
  StatusChip as LegacyStatusChip,
  resolveStatusVariant,
  resolveStatusVariant as resolveLegacyStatusVariant,
} from "./admin";
export type {
  SideNavProps,
  ContextHeaderProps,
  StatusChipVariant as LegacyStatusChipVariant,
} from "./admin";
export * from "./desk";
export * from "./data";
export * from "./governance";
