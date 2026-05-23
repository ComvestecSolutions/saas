/**
 * Admin workspaces Drizzle table per admin-app implementation plan
 * §9 item 2 / `specs/02-apps/admin-app/spec.md`.
 *
 * Workspaces belong to an individual admin operator and are stored
 * per-user (no cross-user sharing in the current slice). The
 * `owner_subject_id` column is the canonical isolation key and is
 * enforced both at the repository layer (every query is scoped by
 * it) and at the platform service layer (where a mismatch surfaces
 * as `CrossUserAccessDenied`).
 *
 * The composite unique indexes on (owner_subject_id, name) and
 * (owner_subject_id, position) prevent duplicate names and duplicate
 * ordering positions within a single operator's workspace set while
 * leaving other operators free to choose any name or position
 * independently.
 *
 * Audit emission for create/update/delete/reorder lives in the
 * platform service via the central audit-log module keyed by
 * `platformModuleId.adminWorkspaces`.
 */
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const adminWorkspacesTable = pgTable(
  "admin_workspaces",
  {
    id: uuid("id").notNull().defaultRandom(),
    ownerSubjectId: text("owner_subject_id").notNull(),
    name: text("name").notNull(),
    serializedLayout: text("serialized_layout").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("admin_workspaces_owner_name_uq").on(
      table.ownerSubjectId,
      table.name,
    ),
    uniqueIndex("admin_workspaces_owner_position_uq").on(
      table.ownerSubjectId,
      table.position,
    ),
    index("admin_workspaces_owner_idx").on(table.ownerSubjectId),
  ],
);
