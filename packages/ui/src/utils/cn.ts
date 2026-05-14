/**
 * Merge class names, filtering out falsy values.
 * A lightweight alternative to `clsx` / `classnames` for use within
 * packages/ui without adding a runtime dependency.
 */
export const cn = (
  ...classes: ReadonlyArray<string | undefined | null | false>
): string => classes.filter(Boolean).join(" ");
