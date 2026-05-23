# 005 Admin Operator Access Management

Status: accepted

## Responsibilities

1. Model Comvestec-operated admin-app identities as governed platform operators rather than ad hoc local users.
2. Expose authenticated operators' own profile, role, and effective admin capabilities through backend-owned projections.
3. Allow day-to-day operator staffing after bootstrap without direct database edits or ad hoc provisioning scripts.
4. Keep customer-tenant member and invitation management on the existing tenant-management module instead of duplicating that workflow in a second identity system.

## Supported Operator Roles

1. `platform-operator` is the full-trust operator role for the admin control plane.
2. `support-operator` is the restricted operator role for support-safe and governance-safe admin workflows.
3. Customer-facing roles such as `owner`, `admin`, `editor`, `member`, and `viewer` remain tenant-management relations, not admin-app operator actor types.
4. The admin UI must not invent additional operator roles or permission labels that the backend does not already govern.

## Bootstrap and Staffing Lifecycle

1. The first human admin operator may be created by the bootstrap or provisioning command path.
2. After the first operator exists, routine operator staffing must happen through backend-owned admin-app workflows over trusted sessions.
3. Operator staffing workflows use Keycloak as the credential and actor-type source of truth.
4. Operator staffing workflows must not require direct database writes, raw Ory Keto edits, or one-off scripts for normal employee onboarding.
5. Backend-owned operator provisioning may still emit a one-time credential or reset handoff, but that handoff must stay bounded to the current governed workflow and must not be written into tracked files.

## Profile and Permission Surfaces

1. The admin shell must show the current operator identity and current operator role, not only a generic role chip.
2. The admin app must provide a dedicated operator profile surface that shows the authenticated operator's actor id, email, display name, actor role, session id, and effective admin capabilities.
3. Effective permissions shown in the admin app must come from the same backend capability-resolution path that controls navigation and route access.
4. Route visibility, action availability, and profile permission summaries must stay backend-owned rather than app-local allowlists.

## Operator Management Surface

1. The access-control area is the operator-facing home for admin-operator staffing workflows.
2. Platform operators may list current admin operators and provision or update operator access for supported roles.
3. Support operators may inspect their own role and effective capabilities, but they must not be able to elevate or provision operator access unless a future backend slice explicitly grants that authority.
4. Operator provisioning must stamp the governed actor-type claim and enable the identity through the shared Keycloak boundary before the user can sign in.

## Tenant Membership and Invitations

1. Tenant member and invitation management remains owned by the tenant-management module.
2. The admin app must surface current tenant memberships and invitations through the tenant workspace and allow governed membership grant or revoke plus invitation issue or revoke without database edits.
3. Tenant membership and invitation screens must reuse the shared tenant-management app-helper boundary rather than calling backend-owned HTTP handlers directly.

## Security and Audit Rules

1. All operator-profile, operator-management, membership, and invitation workflows require trusted session resolution on the backend.
2. Platform-operator staffing changes must record durable backend audit evidence with actor identity, target identity, and reason metadata.
3. The admin app must not introduce local credential forms, local role editing shortcuts, or UI-only permission checks.
4. Support-safe and privileged routes must continue to enforce their current backend role boundaries even when the profile or staffing UI makes those boundaries more visible.
