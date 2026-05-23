/**
 * Operator Desk governance patterns (admin-app spec §7, §"Rules").
 *
 * Allowed to import from `patterns/data/*` (the data layer hosts the
 * canonical `StatusChip` vocabulary). The reverse direction is
 * forbidden — `patterns/data/*` must not import any governance
 * pattern (slice 1b decision 1).
 */
export { DiffApprovalDrawer } from "./DiffApprovalDrawer";
export type {
  DiffApprovalDecisionInput,
  DiffApprovalDrawerProps,
  DiffApprovalLifecycleEvent,
  DiffApprovalStream,
  DiffApprovalStreamKey,
} from "./DiffApprovalDrawer";
export { RevealField } from "./RevealField";
export type {
  RevealFieldAuditEchoInput,
  RevealFieldProps,
  RevealFieldRevealInput,
} from "./RevealField";
export { HighRiskActionGuard } from "./HighRiskActionGuard";
export type {
  HighRiskActionGuardAction,
  HighRiskActionGuardConfirmInput,
  HighRiskActionGuardProps,
  HighRiskReason,
} from "./HighRiskActionGuard";
export { Picker } from "./Picker";
export type { PickerProps } from "./Picker";
export { VendorCard } from "./VendorCard";
export type { VendorCardDeepLink, VendorCardProps } from "./VendorCard";
