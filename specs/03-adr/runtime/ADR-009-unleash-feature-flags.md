# ADR-009 Unleash Feature Flags

Status: accepted

## Decision

Use Unleash as the feature-flag evaluation engine. Flag declarations live in module manifests in code; Unleash stores effective runtime state and provides server-side SDK evaluation.

## Rationale

1. Self-hostable with a clear path to Unleash Cloud or swap to LaunchDarkly if needed.
2. Server-side SDKs keep flag evaluation on the backend, consistent with the platform's backend-bias rule.
3. Flag declarations in manifests are code-reviewed and agent-friendly; runtime toggles flow through the same bidirectional sync model as config keys (ADR-007).
4. Supports gradual rollouts, environment segmentation, and billable-feature gating through custom strategies.
