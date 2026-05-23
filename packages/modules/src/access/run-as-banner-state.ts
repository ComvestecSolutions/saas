/**
 * Run-as / acting-as banner state module surface (admin-app
 * implementation plan §9 item 14). Re-exports the canonical
 * contract types so downstream platform + app code imports from
 * `@comvestec/modules` without reaching across packages.
 *
 * The module has no internal logic of its own: the active-grant
 * lookup against the manual-break-glass repository, the
 * `secondsRemaining` projection against the injected `Clock`, the
 * `releasable` decision, the release flow (with
 * `validateReasonForAction` + `requiresAttachment` enforcement),
 * audit emission, and the bounded short-TTL cache all live at the
 * platform service boundary in
 * `packages/platform/src/services/access/run-as-banner-state-service.ts`.
 */
export {
  RunAsBannerStateInputSchema,
  RunAsBannerStateSchema,
} from "@comvestec/contracts";

export type {
  RunAsBannerState,
  RunAsBannerStateInput,
} from "@comvestec/contracts";
