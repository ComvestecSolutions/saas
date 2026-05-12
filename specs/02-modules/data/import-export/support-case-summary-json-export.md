# Import Export Support-Case Summary JSON Export

Status: accepted

## Purpose

Broaden `import-export` beyond managed-file-summary artifacts with a second operator-only, tenant-scoped export family that serializes support-safe support-case summaries into a JSON artifact through the existing workflow-jobs and file-storage boundaries.

## Scope

1. The export family is tenant-scoped support-case summaries sourced from `support-operations`.
2. This slice defines the JSON artifact format for support-case summary export.
3. Authenticated operators can request the export job and inspect that job by id through backend-owned admin routes.
4. Export execution runs as a durable workflow job rather than an inline long-running HTTP request.
5. Successful exports produce a tenant-confidential managed-file artifact that is downloaded through the existing file-storage download flow.

## Non-Goals

1. CSV format behavior for support-case summaries.
2. Exporting break-glass incidents, impersonation sessions, tenant-health repair gaps, or other support-operations records outside the support-case summary projection.
3. Import ingestion, validation, or commit workflows.
4. Dataset catalogs, artifact browsing, completion notifications, or tenant-facing export UI.
5. Module-local download transports that bypass `file-storage`.

## Source Projection Boundary

1. `import-export` consumes the existing support-safe support-case projection from `support-operations`.
2. The exported record shape is limited to `caseId`, `supportAgent`, `tenantScope`, `tenantScopeId`, `summary`, `status`, `priority`, `startedAt`, and `lastUpdatedAt`.
3. Export execution must not read incident-review fields, impersonation metadata, raw audit events, workflow repair-gap payloads, or other non-case governance details.
4. `import-export` must call the shared backend support-operations projection path or equivalent shared projection helper, not the support-operations HTTP transport.

## Durable Job Model

1. Export requests persist a workflow job owned by `import-export` and executed through the shared workflow-jobs substrate.
2. The workflow payload carries the tenant target, authenticated request context, actor id, requested source, and correlation metadata needed to rerun the export safely.
3. `import-export` continues to persist its module-owned PostgreSQL job record keyed by the workflow job id so artifact metadata, exported row counts, and status views remain durable without stretching the shared workflow-jobs schema into module-specific result storage.
4. Support-case summary jobs use a source-specific workflow kind and source identifier so they do not collide with managed-file-summary jobs for the same tenant or correlation key.
5. Replays and cancellations, when added later, must reuse the shared workflow-jobs operator surface rather than adding module-local repair controls.

## Artifact Behavior

1. The worker serializes the support-safe support-case summary list into a JSON artifact.
2. The worker uploads that artifact through a server-issued managed-file upload reservation and registers the stored blob as a managed file owned by the target tenant.
3. Export artifacts are tenant-confidential managed files.
4. A completed export exposes the produced managed-file id so operators can resolve download access through the existing file-storage transport.
5. Failed exports must preserve the durable error summary on the workflow job and must not register partial artifacts.

## Authorization, Audit, And Isolation Rules

1. Export requests require delegated `export:execute` authorization for the target tenant.
2. Cross-tenant export inspection requires the same break-glass rules already enforced on other operator-only tenant-scoped modules.
3. Support-case summary export must respect the existing support-safe field-security projection before artifact serialization.
4. Disabling the module through `import-export.enabled` blocks new export requests but must not erase durable inspection responsibility for already persisted jobs.
5. Completion audit evidence is appended after the module durably marks the export complete and is best-effort; audit persistence failures must not downgrade a completed export into a blocked export.

## Follow-Up Work

1. Add CSV support for support-case summaries only through a separate accepted spec.
2. Add broader import or export families only through accepted specs that define their source projection and artifact behavior.
3. Add artifact browsing, notifications, retention-specific cleanup, and richer replay controls separately from this family.
