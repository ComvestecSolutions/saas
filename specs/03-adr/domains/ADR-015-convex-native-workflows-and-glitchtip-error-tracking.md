# ADR-015 Convex Native Workflows And GlitchTip Error Tracking

Status: accepted

## Decision

Use Convex-native scheduling and actions as the default workflow-jobs runtime for the SaaS foundation.

Do not keep Trigger.dev as a current platform dependency or optional Docker Compose profile in the baseline repository.

Use GlitchTip as the self-hosted error-tracking integration in the default Docker Compose baseline.

Keep shared config and feature-flag names vendor-neutral so future error-tracking swaps do not require another contract rename.

Workflow jobs remain a distinct module boundary, but the initial foundation ships them on top of the existing Convex deployment rather than a separate workflow service. External job runners remain a future adapter seam, not a baseline dependency.

## Rationale

1. Convex is already a first-class platform dependency and aligns with the repository's bias toward route-owned server data and reactive application state.
2. Removing Trigger.dev reduces the Compose footprint, optional-service drift, and environment surface area without removing the ability to add an external workflow adapter later.
3. GlitchTip satisfies the repository's open-source and self-hostable dependency policy while preserving a realistic managed migration path through GlitchTip Cloud, while its all-in-one mode keeps the local Compose footprint materially lighter than a self-hosted Sentry stack.
4. Vendor-neutral names such as `errorTrackingDsn` and `observability.errorTrackingEnabled` keep the shared contracts stable even if the underlying error-tracking product changes in the future.
5. The combined change keeps the platform within the modular-monolith architecture: workflow execution and error tracking stay behind shared boundaries instead of becoming app-owned integrations.
