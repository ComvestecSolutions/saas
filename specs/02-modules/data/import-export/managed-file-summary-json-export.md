# Import Export Managed-File Summary JSON Export

Status: accepted

## Purpose

Close the first real `import-export` gap with an operator-only, tenant-scoped managed-file-summary export that runs through the validated workflow-jobs control plane and writes a downloadable artifact through the shared file-storage boundary.

## Scope

1. The first export family is tenant-scoped managed-file summaries from `file-storage`.
2. This spec defines the JSON artifact format for the managed-file-summary export family.
3. Authenticated operators can request an export job and inspect that job by id through backend-owned admin routes.
4. Export execution runs as a durable workflow job rather than an inline long-running HTTP request.
5. Successful exports produce a tenant-confidential managed-file artifact that is downloaded through the existing file-storage download flow.

## Non-Goals

1. Any import ingestion, validation, or commit workflow.
2. CSV format behavior, which is governed by the separate managed-file-summary CSV export spec.
3. Generic dataset catalogs or list-all-exports browsing surfaces.
4. Module-local download transports that bypass `file-storage`.
5. Completion notifications, email delivery, or tenant-facing export UI.

## Source Projection Boundary

1. `import-export` consumes the existing managed-file summary projection from `file-storage`.
2. The exported record shape is limited to `fileId`, `fileName`, `contentType`, `sizeBytes`, and optional `deletedAt`.
3. Export execution must not read raw storage ids, blob URLs, classification values, legal-hold flags, or other internal file-storage record details.
4. `import-export` must call the shared backend file-storage module directly, not the file-storage HTTP transport.

## Durable Job Model

1. Export requests persist a workflow job owned by `import-export` and executed through the shared workflow-jobs substrate.
2. The workflow payload carries the tenant target, authenticated request context, actor id, requested format, and correlation metadata needed to rerun the export safely.
3. The first slice also persists an `import-export` PostgreSQL job record keyed by the workflow job id so artifact metadata, exported row counts, and module-owned status views remain durable without stretching the shared workflow-jobs schema into module-specific result storage.
4. When a post-completion workflow-row persistence failure leaves the shared workflow record behind the module-owned import-export record, later worker or repair-gap passes must treat the terminal module record as authoritative and reconcile the workflow row instead of replaying or blocking the finished export.
5. Replays and cancellations, when added later, must reuse the shared workflow-jobs operator surface rather than adding module-local repair controls.

## Artifact Behavior

1. The worker serializes the managed-file summary list into a JSON artifact.
2. The worker uploads that artifact through a server-issued managed-file upload reservation and registers the stored blob as a managed file owned by the target tenant.
3. Export artifacts are tenant-confidential managed files.
4. A completed export exposes the produced managed-file id so operators can resolve download access through the existing file-storage transport.
5. Failed exports must preserve the durable error summary on the workflow job and must not register partial artifacts.

## Authorization, Audit, And Isolation Rules

1. Export requests require delegated `export:execute` authorization for the target tenant.
2. Cross-tenant export inspection requires the same break-glass rules already enforced on other operator-only tenant-scoped modules.
3. Export requests must evaluate the `retention-legal-hold` guard for every managed-file summary source record before they append request audit evidence or persist a durable export request record.
4. If any source managed file is under an active `file-object` legal hold, the request must fail closed instead of scheduling a workflow job.
5. Managed-file-summary workflow execution must re-evaluate the same `file-object` retention guard before artifact serialization so a legal hold placed after request acceptance still blocks artifact creation.
6. Artifact download authorization remains owned by `file-storage`; `import-export` only returns the managed-file id.
7. Disabling the module through `import-export.enabled` blocks new export requests but must not erase durable inspection responsibility for already persisted jobs.
8. Completion audit evidence is appended after the module durably marks the export complete and is best-effort; audit persistence failures must not downgrade a completed export into a blocked export.

## Follow-Up Work

1. Add import ingestion through a separate accepted spec instead of broadening this export slice in place.
2. Add artifact browsing, notifications, retention-specific cleanup, and richer replay controls only after the durable managed-file-summary artifact path is proven.
