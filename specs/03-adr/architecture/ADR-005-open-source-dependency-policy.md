# ADR-005 Open Source Dependency Policy

Status: accepted

## Decision

Prefer open-source self-hostable dependencies with practical managed-service migration paths.

All committed dependency and container references must use current stable release lines unless an ADR explicitly approves an exception.

## Rationale

1. Preserves self-hosting.
2. Avoids lock-in during the foundation phase.
3. Keeps future deployment options open.
4. Reduces avoidable exposure to stale-version vulnerabilities and unreviewed prerelease behavior.
