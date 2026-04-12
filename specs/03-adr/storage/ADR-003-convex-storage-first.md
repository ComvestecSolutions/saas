# ADR-003 Convex Storage First

Status: accepted

## Decision

Use Convex storage as the default file storage layer for the foundation instead of adding MinIO or another separate object store at this stage.

## Rationale

1. Keeps the platform simpler in the first implementation slice.
2. Reduces infrastructure surface area.
3. Aligns storage behavior with the Convex-centric product state model.
