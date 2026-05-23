# ADR-023: Admin-organization membership module

Status: accepted

Date: 2026-05-17

## Context

The platform's existing actor types (`platform-operator`,
`support-operator`, etc.) describe the trusted-session boundary
into the platform backend. They do **not** describe membership of
the internal organisation that runs the SaaS foundation as a
product.

The admin app needs:

1. Owner / admin / role-restricted membership for the internal
   admin org (so the admin app itself can be governed like any
   other tenant).
2. Backend-owned invitation and role-change flows (no shell
   scripts after the first owner).
3. A capability join with the existing platform actor types so
   role-driven navigation and action visibility are authoritative.

## Decision

Introduce a new module: **`admin-organization`** (sibling of
`tenant-management`, **not** reused inside it).

Schema (Postgres, owned by `packages/modules/src/governance/`):

- `admin_members` — `id`, `keycloakSubjectId`, `email`,
  `displayName`, `role`, `createdAt`, `updatedAt`, `archivedAt`.
- `admin_member_invitations` — `id`, `email`, `invitedRole`,
  `invitedBy`, `tokenHash`, `expiresAt`, `acceptedAt`,
  `revokedAt`.
- `admin_audit_log` (view over the central audit log filtered to
  admin-org module events) — read-only.

Roles (enum):

| Role               | Capability summary                                         |
| ------------------ | ---------------------------------------------------------- |
| `admin-owner`      | All + member management + workspaces + test-token issuance |
| `admin-admin`      | All operator screens + manage non-owner members            |
| `admin-operator`   | Platform-operator equivalent (governance, repair, tenants) |
| `support-reviewer` | Support-safe surfaces + break-glass review                 |
| `billing-only`     | Billing & entitlements + invoice export                    |
| `compliance`       | Audit, retention, legal hold, support read-only            |
| `viewer`           | Read-only everywhere; no mutation, no reveal               |

Capability resolution: the existing platform capability snapshot
is joined with the admin-org role. The join lives in the new
`admin-organization` service so the admin app receives a single
authoritative capability surface.

Invitations are sent through the existing `notification-center`
(Novu) module using a new template `admin-org-invitation`.
Acceptance lands on the existing OIDC sign-in handoff and
creates the `admin_members` row on first successful callback.

Bootstrap: the existing operator-bootstrap script seeds the first
`admin-owner` once per environment. Subsequent members are
invited from `/admin/members`.

Audit: every membership change, role change, invite, revoke, and
acceptance is audit-logged through the existing `audit-log`
module using reason-catalog entries owned by the new module.

## Consequences

Positive:

- The admin app stops conflating platform-actor types with
  product-level admin-org membership.
- Self-service member management eliminates shell-script
  staffing.
- Capability resolution becomes a single backend surface; UI does
  no role math.

Negative / accepted trade-offs:

- New module = new manifest, tests, contracts, app helpers, HTTP
  adapter. Mitigated by following the standard module shape.
- The bootstrap owner remains a privileged path; documented in
  the operator runbook.

## Alternatives considered

1. **Reuse `tenant-management`** with the admin org as a special
   tenant — rejected; muddied semantics and risked admin-org rows
   leaking through tenant-list queries.
2. **Encode admin-org role inside Keycloak groups only** —
   rejected; would push policy logic into Keycloak and prevent
   first-party auditing of role changes.
3. **No admin-org concept** (status quo) — rejected per owner
   directive.

## References

- `specs/02-apps/admin-app/spec.md`
- `specs/02-apps/admin-app/implementation-plan.md`
- ADR-022 (Operator Desk shell)
