import type { BadgeVariant } from "../../primitives/Badge";
import { Badge } from "../../primitives/Badge";

export type StatusChipVariant = BadgeVariant;

export type StatusChipProps = {
  readonly status: string;
  readonly variant: StatusChipVariant;
};

/**
 * StatusChip renders a 4px-radius badge for operation and workflow states.
 * No pill badges per design-system rule.
 */
export function StatusChip({ status, variant }: StatusChipProps) {
  return <Badge variant={variant}>{status}</Badge>;
}

/**
 * Derive a BadgeVariant from a generic status string.
 * Callers should prefer explicit mappings, but this helper
 * covers common machine-vocabulary status values.
 */
export const resolveStatusVariant = (status: string): StatusChipVariant => {
  const lower = status.toLowerCase();

  if (
    lower === "active" ||
    lower === "healthy" ||
    lower === "applied" ||
    lower === "approved" ||
    lower === "resolved"
  ) {
    return "active";
  }

  if (
    lower === "pending" ||
    lower === "scheduled" ||
    lower === "verifying" ||
    lower === "pending-review" ||
    lower === "running"
  ) {
    return "pending";
  }

  if (
    lower === "drifted" ||
    lower === "drift" ||
    lower === "deprecated" ||
    lower === "needs-sync" ||
    lower === "superseded"
  ) {
    return "drift";
  }

  if (
    lower === "error" ||
    lower === "blocked" ||
    lower === "expired" ||
    lower === "denied" ||
    lower === "failed" ||
    lower === "rejected" ||
    lower === "revoked" ||
    lower === "cancelled"
  ) {
    return "error";
  }

  return "neutral";
};
