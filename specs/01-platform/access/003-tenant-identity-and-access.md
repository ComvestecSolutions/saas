# 003 Tenant, Identity, and Access

Status: accepted

## Principal Model

The platform supports these actor types:

1. Anonymous public visitor.
1. Individual user — standalone customer or member within an organization or enterprise.
1. Enterprise administrator.
1. Organization administrator.
1. Organization member.
1. Platform operator.
1. Support operator.
1. Service actor such as jobs, webhooks, or API clients.

## Tenant Hierarchy

1. `platform`: global scope for Comvestec Solutions operators and shared infrastructure.
2. `enterprise`: customer enterprise container that can own one or many organizations.
3. `organization`: administrative and billing boundary within an enterprise.
4. `individual`: a specific human identity. An individual may belong to an enterprise and organization, or may be a standalone customer with no enterprise or organization affiliation.

A standalone individual who does not belong to any enterprise or organization is still a first-class tenant. Their config and feature resolution skips the enterprise and organization levels and resolves from individual directly to platform defaults.

## Identity

1. Keycloak is the source for authentication, sessions, MFA, and external identity federation.
2. A single human identity can belong to multiple organizations and enterprises.
3. Platform operators are outside customer tenant scope and require elevated controls.

## Request Access Context

Every server-side authorization, projection, runtime-config, branding, and audit decision must operate on a shared request access context rather than ad hoc per-route values.

1. Request access context separates actor identity from resolved tenant scope.
2. Actor identity includes actor type and, when authenticated, actor ID.
3. Resolved tenant scope includes `scope` and `scopeId`, with optional `enterpriseId`, `organizationId`, and `individualId` fields when that membership context exists.
4. Standalone individuals may resolve with `scope: individual` and no enterprise or organization membership IDs.
5. Anonymous public requests, platform operators, support operators, and service actors may operate without customer tenant membership IDs.
6. Session ID, correlation ID, optional reason, impersonation context, and break-glass context travel with the request access context for explainability and audit.

## Authorization

1. Resource access is evaluated server-side.
2. Relationship or policy checks determine whether the actor can access a resource.
3. Field visibility is evaluated separately using projection profiles.
4. Support impersonation and break-glass flows are explicit, temporary, approved, and audited.

## Access Invariants

1. No UI component may be the source of truth for authorization.
2. Every persisted record and emitted event must carry tenant context unless intentionally global.
3. Sensitive fields require explicit visibility rules and may require read auditing.
4. Shared contracts must not conflate actor identity with tenant scope resolution.
