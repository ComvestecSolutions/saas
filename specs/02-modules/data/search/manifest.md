# Search Manifest

Status: accepted

## Technology Boundary

Meilisearch for full-text and faceted search. Index lifecycle managed per-tenant through the search adapter. Convex provides the source documents; indexing is triggered by domain events.

## Responsibilities

1. Full-text search across tenant-scoped data.
2. Index creation, update, and teardown per tenant.
3. Faceted filtering and ranking configuration.
4. Search relevance tuning and synonym management.

## Permission Scopes

| Scope          | Description                                        |
| -------------- | -------------------------------------------------- |
| `search:admin` | Manage search indexes, synonyms, and ranking rules |

## Feature Flags

| Flag             | Purpose           | Billable | Default | Allowed Scopes |
| ---------------- | ----------------- | -------- | ------- | -------------- |
| `search.enabled` | Module visibility | No       | true    | platform       |

## Config Keys

| Key                         | Description                        | Default | Billable | Allowed Scopes       |
| --------------------------- | ---------------------------------- | ------- | -------- | -------------------- |
| `search.index.maxDocuments` | Maximum documents per tenant index | 100000  | No       | platform, enterprise |

## Data Classifications

| Data                      | Classification      |
| ------------------------- | ------------------- |
| Search index content      | tenant-confidential |
| Ranking and synonym rules | internal            |
| Search queries            | internal            |

## Projection Profiles

| Profile | Visible Fields                     | Audited Fields |
| ------- | ---------------------------------- | -------------- |
| admin   | indexName, documentCount, lastSync | —              |
| summary | indexName, documentCount           | —              |

## Rules

1. Search indexes must be tenant-isolated.
2. Index content must reflect current field-security projections — no regulated-sensitive fields in search results without proper authorization.
3. Index teardown on tenant deletion must be explicit and auditable.
