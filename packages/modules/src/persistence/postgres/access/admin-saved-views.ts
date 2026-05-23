/**
 * Admin saved-views Drizzle table per admin-app implementation plan
 * §9 item 2 / `specs/02-apps/admin-app/spec.md`.
 *
 * Saved views belong to an individual admin operator and are stored
 * per-user (no cross-user sharing in the current slice). The
 * `owner_subject_id` column is the canonical isolation key and is
 * enforced both at the repository layer (every query is scoped by
 * it) and at the platform service layer (where a mismatch surfaces
 * as `CrossUserAccessDenied`).
 *
 * The composite unique index on (owner_subject_id, name) prevents
 * two views with the same name for the same operator while leaving
 * other operators free to choose any name they like.
 *
 * Audit emission for create/update/delete/pin lives in the platform
 * service via the central audit-log module keyed by
 * `platformModuleId.adminSavedViews`.
 */
import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const adminSavedViewsTable = pgTable(
  "admin_saved_views",
  {
    id: uuid("id").notNull().defaultRandom(),
    ownerSubjectId: text("owner_subject_id").notNull(),
    name: text("name").notNull(),
    resourceKind: varchar("resource_kind", { length: 64 }).notNull(),
    serializedView: text("serialized_view").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("admin_saved_views_owner_name_uq").on(
      table.ownerSubjectId,
      table.name,
    ),
    index("admin_saved_views_owner_idx").on(table.ownerSubjectId),
    index("admin_saved_views_owner_resource_idx").on(
      table.ownerSubjectId,
      table.resourceKind,
    ),
  ],
);
