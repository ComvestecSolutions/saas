# 007 Security and Compliance Baseline

Status: accepted

## Target Posture

The baseline must be SOC 2-ready, GDPR-ready, and HIPAA-ready.

## Required Controls

1. MFA for privileged actors.
2. Server-side authorization on all reads and writes.
3. Field-level protection for sensitive data.
4. Immutable audit trails for security-relevant actions.
5. Support impersonation controls with approvals and expiration.
6. Encrypted transport and secure secret handling.
7. Backup and restore procedures.
8. Data retention and deletion policies.
9. Dependency, image, and supply-chain scanning.
10. Stable-version pinning for runtime packages and container images with documented upgrade cadence.
11. Tenant-isolation verification in CI for representative read, write, export, and support-access paths.

## Evidence-Oriented Design

1. Permission changes must be queryable.
2. Sensitive reads must be reviewable.
3. Config changes must include actor and reason.
4. Break-glass events must be explicit and limited.
5. Isolation verification results must be reviewable as repository validation artifacts.

## Exclusions

1. No hardcoded super-admin shortcuts in application code.
2. No undocumented support-only endpoints.
3. No direct production data access outside approved operating flows.
