# File Storage Manifest

Status: accepted

## Technology Boundary

Convex for file storage and file metadata. PostgreSQL for file-level audit records and legal hold metadata.

## Responsibilities

1. Convex-backed file storage.
2. File metadata ownership.
3. Access, retention, and deletion behavior.
4. Branding asset storage for modules such as `tenant-branding`.

## Permission Scopes

| Scope        | Description                     |
| ------------ | ------------------------------- |
| `file:read`  | Read files and file metadata    |
| `file:write` | Upload, update, or delete files |

## Feature Flags

| Flag                   | Purpose           | Billable | Default | Allowed Scopes |
| ---------------------- | ----------------- | -------- | ------- | -------------- |
| `file-storage.enabled` | Module visibility | No       | true    | platform       |

## Config Keys

| Key                            | Description                           | Default | Billable | Allowed Scopes         |
| ------------------------------ | ------------------------------------- | ------- | -------- | ---------------------- |
| `file-storage.maxUploadSizeMb` | Maximum single file upload size in MB | 50      | No       | platform, organization |

## Data Classifications

| Data                             | Classification      |
| -------------------------------- | ------------------- |
| File content                     | tenant-confidential |
| File metadata (name, type, size) | internal            |
| Published branding assets        | public              |
| Legal hold markers               | regulated-sensitive |

## Projection Profiles

| Profile | Visible Fields                                        | Audited Fields |
| ------- | ----------------------------------------------------- | -------------- |
| summary | id, name, type, size                                  | —              |
| admin   | id, name, type, size, uploadedBy, tenantId, legalHold | legalHold      |

## Rules

1. File access must honor tenant and resource authorization.
2. Sensitive files require classification and audit requirements.
3. Retention and legal hold behavior must be explicit.
4. `file-storage` owns branding asset bytes and file metadata, while `tenant-branding` owns which approved assets are published in effective branding projections.
