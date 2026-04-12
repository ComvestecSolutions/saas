# ADR-006 Instant App State Strategy

Status: accepted

## Decision

Use TanStack Start route loaders for route-scoped server data, Convex subscriptions for reactive and collaborative data, and local component state for ephemeral UI state.

## Rationale

1. Produces an instant-feeling application without broad client-state overhead.
2. Keeps data ownership explicit.
3. Makes performance behavior easier to reason about.
