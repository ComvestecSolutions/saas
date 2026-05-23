import { Schema } from "effect";

/**
 * Typed Novu workflow identifiers used by first-party platform
 * services when triggering notification workflows. Mirrors the
 * `defineModule*` helper surfaces used elsewhere in the runtime
 * vocabulary: callers refer to `novuWorkflowId.*` instead of
 * sprinkling raw strings, and the surface is decoded once via
 * `Schema.validateSync` so a regression in the literal table
 * surfaces at module load.
 *
 * The concrete workflow string is mirrored as the operator-facing
 * environment value (`NOVU_WORKFLOW_ID_ADMIN_ORGANIZATION_INVITATION`,
 * etc.). Boundary decode happens at the service environment
 * decode site.
 */
const NovuWorkflowIdConstantSchema = Schema.Struct({
  adminOrganizationInvitation: Schema.Literal("admin-organization.invitation"),
});

export const novuWorkflowId = Schema.validateSync(NovuWorkflowIdConstantSchema)(
  {
    adminOrganizationInvitation: "admin-organization.invitation",
  } satisfies Schema.Schema.Type<typeof NovuWorkflowIdConstantSchema>,
);

export const novuWorkflowIds = [
  novuWorkflowId.adminOrganizationInvitation,
] as const;

export const NovuWorkflowIdSchema = Schema.Literal(...novuWorkflowIds);

export type NovuWorkflowId = Schema.Schema.Type<typeof NovuWorkflowIdSchema>;
