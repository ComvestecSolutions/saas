/**
 * Spacing scale — admin-app spec rule 13 / plan §12 (binding).
 *
 * Allowed units: 2, 4, 6, 8, 10 px.
 * Sum of paddings/margins between adjacent surfaces must never exceed
 * 10px. Place 10 on one side only when needed.
 *
 * The Tailwind preset (`tailwind.preset.ts`) consumes this list to
 * forbid the default Tailwind spacing scale and expose only these
 * five tokens as utilities.
 */

export const spacingScale = [2, 4, 6, 8, 10] as const;

export type SpacingUnit = (typeof spacingScale)[number];

/**
 * String form keyed by the px value (Tailwind-friendly).
 *   { "2": "2px", "4": "4px", ... }
 */
export const spacingMap: Readonly<
  Record<`${SpacingUnit}`, `${SpacingUnit}px`>
> = Object.freeze(
  spacingScale.reduce(
    (accumulator, unit) => {
      const key = `${unit}` as `${SpacingUnit}`;
      const value = `${unit}px` as `${SpacingUnit}px`;
      return { ...accumulator, [key]: value };
    },
    {} as Record<`${SpacingUnit}`, `${SpacingUnit}px`>,
  ),
);

/**
 * Asserts at compile-time and at runtime that a candidate value is one
 * of the allowed spacing units. Keep raw `style={{ padding }}` callers
 * honest when CSS-var or Tailwind utilities cannot be used.
 */
export const assertSpacing = (candidate: number): SpacingUnit => {
  if (!(spacingScale as readonly number[]).includes(candidate)) {
    throw new Error(
      `Disallowed spacing value: ${candidate}px. Allowed units: ${spacingScale.join(
        ", ",
      )}.`,
    );
  }
  return candidate as SpacingUnit;
};
