/**
 * Admin saved-views module surface (per admin-app implementation
 * plan §9 item 2). Re-exports the canonical contract types so
 * downstream platform / app code can import from
 * `@comvestec/modules` without reaching across packages.
 *
 * The module has no internal logic of its own: the per-user
 * isolation invariant is enforced at the platform service boundary
 * (see `CrossUserAccessDenied`), and the persistence boundary lives
 * in `packages/modules/src/persistence/postgres/access/admin-saved-views*.ts`.
 */
export {
  adminSavedViewResourceKind,
  adminSavedViewResourceKinds,
  AdminSavedViewResourceKindSchema,
  AdminSavedViewSchema,
} from "@comvestec/contracts";

export type {
  AdminSavedView,
  AdminSavedViewResourceKind,
} from "@comvestec/contracts";
