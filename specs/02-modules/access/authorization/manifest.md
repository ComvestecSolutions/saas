# Authorization Manifest

Status: accepted

## Technology Boundary

Ory Keto for relationship-based authorization (Zanzibar-style tuple checks). Keycloak provides coarse role assignment; Keto resolves fine-grained resource and field-level permission checks.

## Responsibilities

1. Resource-level authorization.
2. Permission scope definitions.
3. Relationship checks and cached decision support via Ory Keto.
4. Relation tuple management for tenant hierarchy scoping.

## Required Declarations

1. permission scopes
2. actor classes
3. supported resource types
4. admin inspection requirements

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

1. Admin inspection must show the matched tuple or other allow source.
2. Admin inspection must show whether break-glass or impersonation affected the decision.
3. Admin inspection must show the evaluated tenant scope and subject candidates.

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

| Profile | Visible Fields                       | Audited Fields |
| ------- | ------------------------------------ | -------------- |
| admin   | subject, relation, object, namespace | —              |
| summary | subject, relation                    | —              |

## Rules

1. Resource authorization is distinct from field visibility.
2. Decisions must be explainable for admin inspection.
3. Privileged flows require stronger audit and approval behavior.
4. Break-glass and support impersonation must never silently bypass explainability.
