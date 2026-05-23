import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditional className composition + Tailwind conflict resolution.
 *
 * Supersedes the legacy `cn(...strings)` signature: the new ClassValue
 * union (string | number | boolean | null | undefined | array | record)
 * is a superset, so existing call-sites remain valid.
 */
export const cn = (...inputs: ReadonlyArray<ClassValue>): string =>
  twMerge(clsx(inputs));
