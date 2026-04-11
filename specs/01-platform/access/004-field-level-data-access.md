# 004 Field-Level Data Access

Status: accepted

## Goal

Protect sensitive data at field level without making the system fragile or slow.

## Data Classification

Every field must be assigned one of these classes:

1. `public`
2. `internal`
3. `tenant-confidential`
4. `regulated-sensitive`
5. `secret`
6. `derived-analytics`

## Access Model

1. Check actor identity and tenant context.
2. Evaluate resource-level permission.
3. Fetch only the projection needed for the use case when possible.
4. Apply the module's field projection profile.
5. Redact, mask, tokenize, or decrypt fields according to policy.
6. Validate the resulting response against typed contracts.
7. Emit a sensitive-read audit event when required.

## Projection Profiles

Every module must define projection profiles rather than ad hoc field checks. Initial profile categories:

1. `summary`
2. `detail`
3. `admin`
4. `support-safe`
5. `billing`
6. `compliance-review`

## Security Rules

1. Secrets are never returned to end-user clients.
2. Regulated-sensitive fields require explicit policy ownership.
3. Sensitive reads from admin or support surfaces must carry actor, reason, and correlation context.
4. Break-glass access must be time-bounded and audited.

## Performance Rules

1. Prefer projection-oriented queries instead of loading everything and redacting later.
2. Cache permission decisions within request scope.
3. Avoid per-field network round trips or policy-engine calls.
