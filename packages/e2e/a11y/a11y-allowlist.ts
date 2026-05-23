/**
 * a11y-ignored allowlist (admin-app spec §11 Phase 8d).
 *
 * Each entry MUST carry an explicit justification. Entries are
 * scoped per route so a single rule waiver does not blanket the
 * entire admin app. The audit gate fails on any unjustified serious
 * or critical violation outside this list.
 *
 * No entries are pre-populated: the spec requires the gate to be
 * green on first run against the pinned platform target before any
 * waiver is added. New waivers MUST cite the admin-app spec section
 * and the underlying constraint (third-party widget, deferred
 * primitive port, etc.).
 */
export type A11yWaiver = {
  readonly route: string;
  readonly ruleId: string;
  readonly justification: string;
};

export const a11yIgnored: readonly A11yWaiver[] = [];
