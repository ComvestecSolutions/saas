/**
 * Design tokens for the Comvestec Operator Desk (v2).
 *
 * The CSS-driven tokens live in `./*.css` (imported via
 * `@comvestec/ui/styles`); the TypeScript exports below are the typed
 * surface that primitives and patterns import directly.
 *
 * Legacy `opsTokens` is preserved for the still-shipped legacy admin
 * patterns (`patterns/admin/*`) until slice 1b tears them down.
 */

export { spacingScale, spacingMap, assertSpacing } from "./spacing";
export type { SpacingUnit } from "./spacing";

export { radii } from "./shape";
export type { RadiusToken, RadiusValue } from "./shape";

export { durations, easings } from "./motion";
export type { DurationToken, DurationValue, EasingToken } from "./motion";

export { operatorDeskTailwindPreset } from "./tailwind.preset";
export type { OperatorDeskTailwindPreset } from "./tailwind.preset";

/**
 * Legacy Ops tokens kept temporarily for `patterns/admin/*`.
 * Slice 1b removes this export when the legacy admin shell is torn
 * down per the implementation-tracker `Next gap`.
 */
export const opsTokens = {
  bg: "var(--ops-bg)",
  surface1: "var(--ops-surface-1)",
  surface2: "var(--ops-surface-2)",
  surface3: "var(--ops-surface-3)",
  border: "var(--ops-border)",
  borderStrong: "var(--ops-border-strong)",
  text: "var(--ops-text)",
  textSecondary: "var(--ops-text-secondary)",
  textMuted: "var(--ops-text-muted)",
  accent: "var(--ops-accent)",
  accentSoft: "var(--ops-accent-soft)",
  accentText: "var(--ops-accent-text)",
  statusNeutral: "var(--ops-status-neutral)",
  statusActive: "var(--ops-status-active)",
  statusPending: "var(--ops-status-pending)",
  statusDrift: "var(--ops-status-drift)",
  statusError: "var(--ops-status-error)",
  sidebarWidth: "var(--ops-sidebar-width)",
  sidebarCollapsedWidth: "var(--ops-sidebar-collapsed-width)",
  headerHeight: "var(--ops-header-height)",
  radius: "var(--ops-radius)",
  radiusSm: "var(--ops-radius-sm)",
  fontMono: "var(--ops-font-mono)",
} as const;

export type OpsToken = (typeof opsTokens)[keyof typeof opsTokens];
