/**
 * Admin workspace contracts per admin-app implementation plan §9
 * item 2 and `specs/02-apps/admin-app/spec.md` (Per-user workspaces
 * + saved views).
 *
 * A workspace is a per-user, ordered bookmark of the bottom-command-
 * strip workspace tabs. The current slice is owner-locked to per-user
 * storage with no cross-user sharing; the `ownerSubjectId` is the
 * canonical isolation key and is enforced by the platform service
 * (see `CrossUserAccessDenied`). Ordering is owner-scoped and
 * authoritative via the `position` column; the dedicated reorder
 * surface atomically rewrites the full position sequence inside a
 * transaction.
 *
 * `serializedLayout` is a JSON-encoded representation of the
 * workspace tab layout. The platform persists this opaquely; the
 * admin app owns rehydration.
 */
import { Schema } from "effect";

export const AdminWorkspaceSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  ownerSubjectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  /**
   * JSON-encoded representation of the workspace tab layout. The
   * platform treats this as an opaque blob; the admin app owns
   * rehydration.
   */
  serializedLayout: Schema.NonEmptyString,
  /**
   * 1-based authoritative ordering position within the owner's
   * workspace set. The reorder surface rewrites this column for
   * every workspace owned by the same subject atomically.
   */
  position: Schema.Int.pipe(Schema.greaterThanOrEqualTo(1)),
  createdAt: Schema.NonEmptyString,
  updatedAt: Schema.NonEmptyString,
});

export type AdminWorkspace = Schema.Schema.Type<typeof AdminWorkspaceSchema>;

export const AdminWorkspaceInputSchema = Schema.Struct({
  ownerSubjectId: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  serializedLayout: Schema.NonEmptyString,
});

export type AdminWorkspaceInput = Schema.Schema.Type<
  typeof AdminWorkspaceInputSchema
>;

export const AdminWorkspacePatchSchema = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  serializedLayout: Schema.optional(Schema.NonEmptyString),
});

export type AdminWorkspacePatch = Schema.Schema.Type<
  typeof AdminWorkspacePatchSchema
>;

export const AdminWorkspaceReorderInputSchema = Schema.Struct({
  ownerSubjectId: Schema.NonEmptyString,
  idsInOrder: Schema.NonEmptyArray(Schema.NonEmptyString),
});

export type AdminWorkspaceReorderInput = Schema.Schema.Type<
  typeof AdminWorkspaceReorderInputSchema
>;
