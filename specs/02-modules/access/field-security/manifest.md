# Field Security Manifest

Status: accepted

## Technology Boundary

Enforcement runs in-process using Effect services. Projection profiles and classification declarations live in module manifests. Sensitive-read audit events flow to PostgreSQL via the audit-log module.

## Responsibilities

1. Field classification.
2. Projection profile definitions.
3. Redaction, masking, and selective decryption rules.
4. Sensitive-read audit requirements.

## Enforcement Boundary

1. Module-owned queries should prefer projection-oriented fetches.
2. Every server response containing module data must still pass through the shared field-security projection service before serialization.
3. When query-time projection is not possible, the shared projection service must remove or mask fields before framework serialization.
4. Audited fields produce sensitive-read audit records when they are returned to privileged actors.

## Permission Scopes

| Scope         | Description                                              |
| ------------- | -------------------------------------------------------- |
| `field:admin` | Administer field classifications and projection profiles |

## Feature Flags

| Flag                     | Purpose           | Billable | Default | Allowed Scopes |
| ------------------------ | ----------------- | -------- | ------- | -------------- |
| `field-security.enabled` | Module visibility | No       | true    | platform       |

## Config Keys

| Key                                 | Description                                | Default | Billable | Allowed Scopes |
| ----------------------------------- | ------------------------------------------ | ------- | -------- | -------------- |
| `field-security.sensitiveReadAudit` | Whether sensitive-read events are captured | true    | No       | platform       |

## Data Classifications

| Data                           | Classification      |
| ------------------------------ | ------------------- |
| Field classification rules     | internal            |
| Projection profile definitions | internal            |
| Sensitive-read audit events    | regulated-sensitive |

## Projection Profiles

| Profile           | Visible Fields                               | Audited Fields |
| ----------------- | -------------------------------------------- | -------------- |
| admin             | field, classification, projectionProfile     | —              |
| compliance-review | field, classification, accessorId, timestamp | accessorId     |

## Rules

1. No module may expose a regulated-sensitive field without a declared projection profile.
2. Support-safe views must avoid unnecessary exposure.
3. Field access behavior must be inspectable in the admin app.
4. Secret fields are never returned to end-user or public clients.
