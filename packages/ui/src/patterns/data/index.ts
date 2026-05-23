/**
 * Operator Desk data patterns (admin-app spec §7, §8).
 *
 * Hard rule (binding slice 1b decision 1): nothing in
 * `patterns/data/*` may import from `patterns/governance/*`. The
 * admin-app composes governance components into the
 * `renderBulkActionConfirm` render-prop slot exposed by
 * `DenseDataTable`.
 */
export { DenseDataTable } from "./DenseDataTable";
export type {
  DenseDataTableBulkAction,
  DenseDataTableBulkActionConfirmRenderArgs,
  DenseDataTableDensity,
  DenseDataTableProps,
  DenseDataTableSavedView,
} from "./DenseDataTable";
export { KeyValueCards } from "./KeyValueCards";
export type {
  KeyValueCard,
  KeyValueCardEntry,
  KeyValueCardsProps,
} from "./KeyValueCards";
export { LogStream } from "./LogStream";
export type {
  LogStreamEntry,
  LogStreamFacet,
  LogStreamProps,
} from "./LogStream";
export { KpiTileV2 } from "./KpiTileV2";
export type { KpiTileV2Props } from "./KpiTileV2";
export { StateScreen } from "./StateScreen";
export type { StateScreenProps, StateScreenVariant } from "./StateScreen";
export { StatusChip, statusChipToneToBadgeVariant } from "./StatusChip";
export type { StatusChipProps, StatusChipTone } from "./StatusChip";
