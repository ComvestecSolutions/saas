# Retention and Legal Hold Manifest

Status: accepted

## Technology Boundary

PostgreSQL via Drizzle for retention policies and legal hold records. Effect services for retention policy, legal hold, and guard-evaluation workflows. Downstream file-lifecycle and export modules consume this module's guard decisions instead of reimplementing retention logic.

## Responsibilities

1. Retention policy definition per data type and tenant.
2. Legal hold placement and release with auditable actor identity.
3. Retention guard evaluation for downstream destructive workflows and purge-eligibility checks.
4. Compliance review over retention policies and legal holds through projected backend surfaces.

## Permission Scopes

| Scope              | Description                               |
| ------------------ | ----------------------------------------- |
| `retention:manage` | Manage retention policies and legal holds |

## Feature Flags

| Flag                           | Purpose           | Billable | Default | Allowed Scopes |
| ------------------------------ | ----------------- | -------- | ------- | -------------- |
| `retention-legal-hold.enabled` | Module visibility | No       | false   | platform       |

## Config Keys

| Key                                         | Description                           | Default | Billable | Allowed Scopes       |
| ------------------------------------------- | ------------------------------------- | ------- | -------- | -------------------- |
| `retention-legal-hold.defaultRetentionDays` | Default data retention period in days | 730     | No       | platform, enterprise |

## Data Classifications

| Data                 | Classification      |
| -------------------- | ------------------- |
| Retention policies   | internal            |
| Legal hold records   | regulated-sensitive |
| Purge execution logs | regulated-sensitive |

## Projection Profiles

| Profile           | Visible Fields                                                                           | Audited Fields                      |
| ----------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| admin             | policyId, dataType, retentionDays, legalHoldActive                                       | legalHoldActive                     |
| compliance-review | legalHoldId, dataType, targetId, status, placedAt, releasedAt, evidence, legalHoldActive | legalHoldActive, targetId, evidence |

## Rules

1. Data under legal hold must never be purged regardless of retention policy.
2. Legal hold placement and release must be auditable with actor identity.
3. Downstream file-lifecycle, export, and deletion flows must consume retention guard decisions before destructive actions.
