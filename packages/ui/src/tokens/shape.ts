/**
 * Shape tokens — radii in px (admin-app plan §7 tokens).
 *
 *   chip      → 4px (Badge / StatusChip — 4px chips only)
 *   primitive → 4px (Button, Input, Select, Checkbox …)
 *   pane      → 8px (workbench pane, dialog, popover surface)
 *   shell     → 10px (outer desk shell containers; 10 max)
 */

export const radii = {
  chip: 4,
  primitive: 4,
  pane: 8,
  shell: 10,
} as const;

export type RadiusToken = keyof typeof radii;
export type RadiusValue = (typeof radii)[RadiusToken];
