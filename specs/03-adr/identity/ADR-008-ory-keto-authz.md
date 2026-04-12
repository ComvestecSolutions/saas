# ADR-008 Ory Keto Relationship-Based Authorization

Status: accepted

## Decision

Use Ory Keto as the relationship-based authorization engine. Keycloak handles authentication and coarse role assignment; Ory Keto resolves fine-grained permission checks using the Zanzibar model.

## Rationale

1. Zanzibar-style tuple checks scale to field-level and resource-level authorization without custom code.
2. Self-hostable with a managed path through Ory Network.
3. Separates authn concerns (Keycloak) from authz graph (Keto), keeping each service focused.
4. Relation tuples map cleanly onto the platform's permission-scope model.
