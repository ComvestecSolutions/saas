/**
 * Motion tokens (admin-app plan §7).
 *
 * Durations in ms:
 *   hover  →  60 ms — micro state (color/opacity hover)
 *   state  → 120 ms — pressed / open / closed toggles
 *   layout → 180 ms — pane resize, sheet enter/exit, ribbon peek
 */

export const durations = {
  hover: 60,
  state: 120,
  layout: 180,
} as const;

export type DurationToken = keyof typeof durations;
export type DurationValue = (typeof durations)[DurationToken];

export const easings = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  entrance: "cubic-bezier(0, 0, 0, 1)",
  exit: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

export type EasingToken = keyof typeof easings;
