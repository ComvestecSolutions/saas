/**
 * Design tokens for the Comvestec Operations design system.
 *
 * These constants mirror the CSS custom properties defined in the consuming
 * app's stylesheet. Components reference these via `var(--ops-*)` in inline
 * styles so the package stays self-contained without a CSS build step.
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
