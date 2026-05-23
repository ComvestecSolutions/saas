/**
 * Tailwind v4 preset — Operator Desk design tokens.
 *
 * This preset is consumed by the admin-app (slice 1b) via the Tailwind
 * v4 `@plugin` / `@theme` CSS-first config. It enforces the binding
 * spacing rule (admin-app spec rule 13 / plan §12) by REPLACING the
 * default spacing scale with only the five allowed units. Anything
 * outside `{ 2, 4, 6, 8, 10 }` will fail to resolve as a Tailwind
 * utility.
 *
 * Tailwind v4 prefers CSS-first configuration (`@theme`). This TS
 * preset is the canonical typed source of truth that `@theme inline`
 * blocks must mirror — slice 1b will wire the admin-app stylesheet to
 * it via `@plugin "./tailwind.preset.ts"`.
 */

import { spacingMap } from "./spacing";
import { radii } from "./shape";
import { durations } from "./motion";

const radiusMap = {
  chip: `${radii.chip}px`,
  primitive: `${radii.primitive}px`,
  pane: `${radii.pane}px`,
  shell: `${radii.shell}px`,
} as const;

const durationMap = {
  hover: `${durations.hover}ms`,
  state: `${durations.state}ms`,
  layout: `${durations.layout}ms`,
} as const;

export const operatorDeskTailwindPreset = {
  /**
   * Tailwind v4 honours the `theme` field even when CSS-first config
   * is the primary driver. Setting these explicitly (rather than
   * `extend`) replaces the defaults — which is exactly the intent for
   * spacing: the default 0/0.5/1/1.5/… ladder is forbidden.
   */
  theme: {
    spacing: spacingMap,
    borderRadius: radiusMap,
    transitionDuration: durationMap,
    colors: {
      transparent: "transparent",
      current: "currentColor",
      canvas: {
        950: "var(--canvas-950)",
        900: "var(--canvas-900)",
        850: "var(--canvas-850)",
      },
      slate: {
        50: "var(--slate-50)",
        100: "var(--slate-100)",
        200: "var(--slate-200)",
        300: "var(--slate-300)",
        400: "var(--slate-400)",
        500: "var(--slate-500)",
        600: "var(--slate-600)",
        700: "var(--slate-700)",
        800: "var(--slate-800)",
        900: "var(--slate-900)",
        950: "var(--slate-950)",
      },
      emerald: {
        300: "var(--emerald-300)",
        400: "var(--emerald-400)",
        500: "var(--emerald-500)",
        600: "var(--emerald-600)",
        700: "var(--emerald-700)",
      },
      amber: {
        300: "var(--amber-300)",
        400: "var(--amber-400)",
        500: "var(--amber-500)",
        600: "var(--amber-600)",
      },
      violet: {
        300: "var(--violet-300)",
        400: "var(--violet-400)",
        500: "var(--violet-500)",
        600: "var(--violet-600)",
      },
      crimson: {
        300: "var(--crimson-300)",
        400: "var(--crimson-400)",
        500: "var(--crimson-500)",
        600: "var(--crimson-600)",
      },
      fg: {
        DEFAULT: "var(--fg-default)",
        secondary: "var(--fg-secondary)",
        muted: "var(--fg-muted)",
        disabled: "var(--fg-disabled)",
        inverse: "var(--fg-inverse)",
      },
      status: {
        "neutral-fg": "var(--status-neutral-fg)",
        "neutral-bg": "var(--status-neutral-bg)",
        "active-fg": "var(--status-active-fg)",
        "active-bg": "var(--status-active-bg)",
        "pending-fg": "var(--status-pending-fg)",
        "pending-bg": "var(--status-pending-bg)",
        "drift-fg": "var(--status-drift-fg)",
        "drift-bg": "var(--status-drift-bg)",
        "error-fg": "var(--status-error-fg)",
        "error-bg": "var(--status-error-bg)",
      },
    },
    fontFamily: {
      sans: "var(--font-sans)",
      mono: "var(--font-mono)",
    },
    fontSize: {
      11: "var(--font-size-11)",
      13: "var(--font-size-13)",
      14: "var(--font-size-14)",
      16: "var(--font-size-16)",
      20: "var(--font-size-20)",
      24: "var(--font-size-24)",
    },
    fontWeight: {
      regular: "400",
      medium: "500",
      semibold: "600",
    },
  },
} as const;

export type OperatorDeskTailwindPreset = typeof operatorDeskTailwindPreset;

export default operatorDeskTailwindPreset;
