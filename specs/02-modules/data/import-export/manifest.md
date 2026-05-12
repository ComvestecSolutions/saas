# Import Export Manifest

Status: accepted

## Technology Boundary

Background jobs via the shared Workflow jobs control plane with Convex execution or in-process Effect services for small workloads. PostgreSQL stores import-export job records and status details, with workflow-jobs providing the shared execution substrate. Convex file storage provides staged import files and export artifacts.

## Responsibilities

1. Bulk data import with validation and error reporting.
2. Data export in standard formats (CSV, JSON).
3. Job progress tracking and completion notification.
4. Tenant-scoped data extraction honoring field-security rules.
5. Operator-only support-case summary export through support-safe `support-operations` projections.
6. Implemented slices: operator-only managed-file-summary JSON and CSV export through workflow jobs plus file-storage-backed artifact delivery.

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

1. `admin` exposes `jobId`, `tenantScope`, `tenantScopeId`, `source`, `format`, `status`, `rowCount`, `artifactFileId`, `lastError`, `startedAt`, `completedAt`, and `createdAt`.
2. There is no separate human-documented summary projection for the currently implemented backend slice.
3. No import-export projection profile currently declares audited fields.

## Rules

1. Exports must pass through field-security projections — no regulated-sensitive fields without authorization.
2. Import validation must reject malformed data before committing.
3. Large imports must run as background jobs, not blocking requests.
4. Managed-file-summary export slices must reuse the shared workflow-jobs and file-storage boundaries instead of introducing module-local artifact or execution infrastructure.
5. Managed-file-summary export slices return managed-file artifact identifiers and rely on file-storage for download authorization and URL resolution.
6. Support-case summary export slices must consume the support-safe case projection from `support-operations` and must not export impersonation-session, break-glass incident, or other non-case governance records.
