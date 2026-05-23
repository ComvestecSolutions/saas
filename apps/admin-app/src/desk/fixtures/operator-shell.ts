import type {
  AlertsPulseProps,
  EdgeRailItem,
  PulseSegment,
  VendorCardProps,
  WorkspaceTab,
} from "@comvestec/ui";

/**
 * Typed shell fixtures for the slice 1b-tail Operator Desk wiring.
 *
 * These are intentionally shape-correct placeholders sourced from
 * literal labels only — no raw bearer tokens, no raw resource ids,
 * no operator-facing copy that leaks an internal identifier. Each
 * exported binding is replaced by a real helper in a later slice;
 * see the `// TODO(slice-future)` markers below.
 */

// TODO(slice-future): replace with the admin-org pulse helper that
// streams live posture from `admin-organization`/governance services.
export const pulseSegmentsFixture: readonly PulseSegment[] = [
  { id: "tenants", label: "Tenants", tone: "nominal", count: 0 },
  { id: "approvals", label: "Approvals", tone: "pending", count: 0 },
  { id: "drift", label: "Drift", tone: "drift", count: 0 },
  { id: "incidents", label: "Incidents", tone: "nominal", count: 0 },
];

// TODO(slice-future): replace with `usePinnedResources` backed by the
// admin-organization pinned-resources helper.
export const edgeRailItemsFixture: readonly EdgeRailItem[] = [
  { id: "operations-home", label: "Home", current: true },
  { id: "approvals-queue", label: "Approvals" },
  { id: "audit-stream", label: "Audit" },
];

// TODO(slice-future): replace with the admin-workspaces helper once
// the saved-workspace backend lands (admin-app plan §9 item 2).
export const workspaceTabsFixture: readonly WorkspaceTab[] = [
  { id: "default", label: "Operations Home", active: true },
];

// TODO(slice-future): replace with the alerts-pulse helper once the
// alerts backend lands. Shape-correct empty state for now.
export const alertsPulseFixture = {
  count: 0,
  tone: "neutral",
} as const satisfies Pick<AlertsPulseProps, "count" | "tone">;

// TODO(slice-future): replace with the vendor-card helper backed by
// the integrations vendor registry.
export const vendorCardsFixture: readonly VendorCardProps[] = [];
