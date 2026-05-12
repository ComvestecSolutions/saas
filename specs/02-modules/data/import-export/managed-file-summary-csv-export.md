# Import Export Managed-File Summary CSV Export

Status: accepted

## Purpose

Close the next `import-export` format gap by allowing the existing managed-file-summary export route and workflow path to produce a CSV artifact in addition to the landed JSON artifact.

## Scope

1. Reuse the existing managed-file-summary export route, durable job record, workflow kind, and file-storage artifact boundary.
2. Add CSV as a second supported format for the existing managed-file-summary export family.
3. Preserve JSON as the default format when callers omit the format field.

## Non-Goals

1. A new export family.
2. Import ingestion or validation workflows.
3. Dataset catalogs, artifact browsing, or tenant-facing export UI.
4. Module-local download or workflow infrastructure outside the shared file-storage and workflow-jobs boundaries.

## Format Rules

1. Managed-file-summary export now supports `json` and `csv`.
2. The existing route continues to work when `format` is omitted by defaulting to `json`.
3. CSV exports use the same managed-file summary projection fields and field order on every row: `fileId`, `fileName`, `contentType`, `sizeBytes`, and `deletedAt`.
4. CSV serialization must escape commas, quotes, and line breaks so file names and content types remain parseable.
5. CSV serialization must neutralize spreadsheet-leading formula characters in string fields before operators open the artifact in spreadsheet tooling.
6. JSON and CSV requests for the same tenant must not collide in durable workflow or job identifiers.

## Durable Job Rules

1. The durable import-export job record stores the requested format and a format-specific source identifier for the managed-file-summary family.
2. The shared workflow payload stores the same format so replay or rerun paths reproduce the requested artifact shape.
3. Completed jobs continue to expose the produced managed-file id through the existing file-storage download path.
4. CSV exports inherit the same retention-guard-before-acceptance, execution-time retention recheck, request-audit-before-acceptance, and best-effort post-completion audit semantics defined by the base managed-file-summary JSON export spec.

## Artifact Rules

1. JSON exports remain `application/json` artifacts with a `.json` suffix.
2. CSV exports produce `text/csv` artifacts with a `.csv` suffix.
3. Both formats remain tenant-confidential managed files owned by the target tenant.

## Follow-Up Work

1. Add broader export families only through accepted specs that define their source projection and artifact behavior.
2. Add richer artifact lifecycle controls separately from this format extension.
