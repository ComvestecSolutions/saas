# Authorization Manifest

Status: accepted

## Technology Boundary

Ory Keto for relationship-based authorization (Zanzibar-style tuple checks). Keycloak provides coarse role assignment; Keto resolves fine-grained resource and field-level permission checks.

## Responsibilities

1. Resource-level authorization.
2. Permission scope definitions.
3. Relationship checks and cached decision support via Ory Keto.
4. Relation tuple management for tenant hierarchy scoping.
5. Authenticated operator tuple mutation on the Ory-managed relation path with audit-backed review.

## Required Declarations

1. permission scopes
2. actor classes
3. supported resource types
4. admin inspection requirements
5. admin mutation requirements

## Actor Classes

1. Anonymous public visitor.
2. Individual user.
3. Enterprise administrator.
4. Organization administrator.
5. Organization member.
6. Platform operator.
7. Support operator.
8. Service actor.

## Supported Resource Types

1. tenant
2. organization
3. individual
4. module
5. config-key
6. feature-flag
7. branding-profile
8. file
9. audit-event
10. support-case
11. billing-entitlement

## Relation Tuple Model

1. Authorization tuples use namespace, object, relation, subject, and tenant-scope context.
2. Keycloak roles identify coarse actor classes, while Keto tuples answer resource-level and privileged-path checks.
3. Permission scopes map to supported relation families rather than becoming raw tuple names directly.
4. Request-scope caching is allowed for decision reuse within one request, but cache hits must remain explainable.

## Admin Inspection Requirements

1. Admin inspection must show the matched tuple when persisted tuple evidence exists, or the alternative allow source when access is granted without persisted tuple evidence.
2. Admin inspection must show whether break-glass was used and whether impersonation was active on the evaluated request context.
3. Admin inspection must show the evaluated tenant scope and subject candidates.

## Admin Mutation Requirements

1. Admin tuple mutation must require an authenticated platform or support operator session and a non-empty operator reason.
2. Admin tuple mutation currently covers additive tuple writes on the Ory-managed relation path; revocation and deletion remain follow-on capabilities.
3. Mutation responses must return the persisted tuple together with the projected audit event generated for the change.
4. Operator review of tuple changes must route through the existing admin audit-log read surface rather than a separate authorization proposal store.

## Permission Scopes

| Scope         | Description                                             |
| ------------- | ------------------------------------------------------- |
| `field:admin` | Administer field-level access rules and relation tuples |

## Feature Flags

| Flag                    | Purpose           | Billable | Default | Allowed Scopes |
| ----------------------- | ----------------- | -------- | ------- | -------------- |
| `authorization.enabled` | Module visibility | No       | true    | platform       |

## Config Keys

| Key                              | Description             | Default | Billable | Allowed Scopes |
| -------------------------------- | ----------------------- | ------- | -------- | -------------- |
| `authorization.cache.ttlSeconds` | Keto decision cache TTL | 60      | No       | platform       |

## Data Classifications

| Data                            | Classification      |
| ------------------------------- | ------------------- |
| Relation tuples                 | tenant-confidential |
| Permission check results        | internal            |
| Actor identity in check context | internal            |

## Projection Profiles

| Profile | Visible Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Audited Fields                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| admin   | allowSource, evaluatedActorType, evaluatedActorId, evaluatedSessionId, evaluatedCorrelationId, decision.allowed, decision.reason, decision.auditRequired, decision.matchedTuple.namespace, decision.matchedTuple.object, decision.matchedTuple.relation, decision.matchedTuple.subject, explanation.subjectCandidates, explanation.matchedSubject, explanation.usedBreakGlass, explanation.impersonationActive, explanation.requestScope, explanation.requestScopeId, tuple.namespace, tuple.object, tuple.relation, tuple.subject | decision.matchedTuple.subject, explanation.subjectCandidates, explanation.matchedSubject, evaluatedActorId, tuple.subject |
| summary | allowSource, explanation.matchedSubject, explanation.requestScope, explanation.requestScopeId                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                                         |

## Rules

1. Resource authorization is distinct from field visibility.
2. Decisions must be explainable for admin inspection.
3. Privileged flows require stronger audit and approval behavior.
4. Break-glass and support impersonation must never silently bypass explainability; inspection views must remain explicit about when only the request context, rather than the matched tuple, explains the decision.
