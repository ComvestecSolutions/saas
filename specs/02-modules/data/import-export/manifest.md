# Import Export Manifest

Status: accepted

## Technology Boundary

Background jobs via Convex-native workflows or in-process Effect services for small workloads. PostgreSQL for import/export job records and status tracking. Convex file storage for staged import files and export artifacts.

## Responsibilities

1. Bulk data import with validation and error reporting.
2. Data export in standard formats (CSV, JSON).
3. Job progress tracking and completion notification.
4. Tenant-scoped data extraction honoring field-security rules.

## Permission Scopes

| Scope            | Description               |
| ---------------- | ------------------------- |
| `import:execute` | Execute bulk data imports |
| `export:execute` | Execute data exports      |

## Feature Flags

| Flag                    | Purpose           | Billable | Default | Allowed Scopes |
| ----------------------- | ----------------- | -------- | ------- | -------------- |
| `import-export.enabled` | Module visibility | No       | false   | platform       |

## Config Keys

| Key                              | Description                   | Default | Billable | Allowed Scopes       |
| -------------------------------- | ----------------------------- | ------- | -------- | -------------------- |
| `import-export.maxRowsPerImport` | Maximum rows per import batch | 10000   | No       | platform, enterprise |

## Data Classifications

| Data                     | Classification      |
| ------------------------ | ------------------- |
| Import source files      | tenant-confidential |
| Export artifacts         | tenant-confidential |
| Import validation errors | internal            |
| Job status records       | internal            |

## Projection Profiles

| Profile | Visible Fields                                        | Audited Fields |
| ------- | ----------------------------------------------------- | -------------- |
| admin   | jobId, type, status, rowCount, startedAt, completedAt | —              |
| summary | jobId, type, status                                   | —              |

## Rules

1. Exports must pass through field-security projections — no regulated-sensitive fields without authorization.
2. Import validation must reject malformed data before committing.
3. Large imports must run as background jobs, not blocking requests.
