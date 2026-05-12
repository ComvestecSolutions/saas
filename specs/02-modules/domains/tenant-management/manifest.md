# Tenant Management Manifest

Status: accepted

## Technology Boundary

Keycloak for identity federation. Convex for tenant data. Ory Keto relation tuples for current membership relations. PostgreSQL for onboarding runs, invitation records, provisioning receipts, and audit records related to membership changes.

## Responsibilities

1. Enterprise accounts, organizations, and individual user records.
2. Memberships, invitations, and role assignment.
3. Tenant context resolution for applications and workflows.
4. Standalone individual support — individuals without enterprise or organization affiliation.
5. Guided onboarding workflow and activation checklist for new tenants.
6. Tenant, owner-membership, and onboarding-run provisioning after validated authentication.
7. Backend-owned operator review of current tenant onboarding state for troubleshooting and recovery.
8. Backend-owned operator inspection of current tenant membership relations for troubleshooting and recovery.
9. Backend-owned operator mutation of direct tenant membership relations for troubleshooting and recovery.
10. Backend-owned operator issuance, inspection, and revocation of tenant invitations for troubleshooting and recovery.
11. Authenticated tenant-invitation token redemption that consumes the invitation and grants the invited relation without exposing secret tokens through routine inspection workflows.

## First Backend-Ready Slice

1. Provision tenant identity, primary owner membership, and default onboarding state immediately after validated auth completion.
2. Support pending-to-active progression as billing entitlements become active.
3. Keep onboarding progress durable and recoverable when downstream billing, notification, or branding steps retry.
4. Expose current onboarding state through a backend-owned operator workflow without projecting free-form onboarding metadata.
5. Expose current tenant membership relations through a backend-owned operator workflow with auditable tenant-confidential reads.
6. Grant and revoke direct tenant membership relations through backend-owned operator workflows with auditable change reasons.
7. Issue, inspect, and revoke current tenant invitations through backend-owned operator workflows without exposing secret invitation tokens through inspection surfaces.
8. Hand off one-time invitation tokens at issuance time and redeem them through an authenticated backend-owned workflow that grants the invited relation once and consumes the invitation durably.

## Permission Scopes

| Scope           | Description                                |
| --------------- | ------------------------------------------ |
| `tenant:read`   | Read tenant-scoped resources               |
| `tenant:write`  | Create or modify tenant structures         |
| `member:manage` | Manage memberships, invitations, and roles |

## Feature Flags

| Flag                                    | Purpose                               | Billable | Default | Allowed Scopes                     |
| --------------------------------------- | ------------------------------------- | -------- | ------- | ---------------------------------- |
| `tenant-management.enabled`             | Module visibility                     | No       | true    | platform                           |
| `tenant-management.enterpriseHierarchy` | Enable multi-org enterprise hierarchy | Yes      | false   | platform, enterprise               |
| `tenant-management.guidedOnboarding`    | Enable guided onboarding workflow     | No       | false   | platform, enterprise, organization |

## Config Keys

| Key                                                            | Description                                          | Default | Billable | Allowed Scopes                     |
| -------------------------------------------------------------- | ---------------------------------------------------- | ------- | -------- | ---------------------------------- |
| `tenant-management.membership.inviteExpiryHours`               | Hours before an invite expires                       | 72      | No       | platform, enterprise, organization |
| `tenant-management.membership.inviteReminderHoursBeforeExpiry` | Hours before invite expiry to queue a reminder email | 24      | No       | platform, enterprise, organization |
| `tenant-management.onboarding.reminderDays`                    | Days between onboarding reminder nudges              | 3       | No       | platform, enterprise, organization |

## Data Classifications

| Data                                       | Classification      |
| ------------------------------------------ | ------------------- |
| Enterprise and organization names          | internal            |
| Tenant creation timestamps                 | internal            |
| Membership records and member counts       | tenant-confidential |
| Invitation ids                             | internal            |
| Invitation recipient email                 | regulated-sensitive |
| Invitation relation and lifecycle metadata | tenant-confidential |
| Invitation tokens                          | secret              |
| Billing email                              | regulated-sensitive |

## Projection Profiles

| Profile      | Visible Fields                                                                                                                                                                                                                                                                                    | Audited Fields                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| summary      | id, name, status                                                                                                                                                                                                                                                                                  | —                                       |
| admin        | id, name, status, billingEmail, memberCount, invitation.invitationId, invitation.recipientEmail, invitation.relation, invitation.status, invitation.issuedBy, invitation.issuedAt, invitation.expiresAt, invitation.revokedAt, invitation.revokedBy, invitation.redeemedAt, invitation.redeemedBy | billingEmail, invitation.recipientEmail |
| support-safe | id, name, status, createdAt, invitation.invitationId, invitation.relation, invitation.status, invitation.issuedAt, invitation.expiresAt, invitation.revokedAt, invitation.redeemedAt                                                                                                              | —                                       |

## Key Rules

1. One human identity may belong to many tenants.
2. Tenant boundaries must be explicit in storage and events.
3. Membership changes must be auditable.
4. Standalone individuals are first-class tenants with their own config and entitlement resolution.
5. Onboarding progress is tenant-scoped operational state, not a substitute for permission or entitlement checks.
6. Tenant provisioning must be safe to retry when auth callback or billing events are delivered more than once.
7. Initial tenant creation must not require frontend-owned orchestration.
8. When billing reconciliation can prove prior owner linkage for a tenant, provisioning and onboarding repair may be retried automatically without waiting for another login.
9. Invitation tokens must remain secret at rest and must never be exposed through routine inspection workflows.
10. Invitation record expiry must resolve from the declared runtime config key instead of hardcoded service defaults.
11. Invitation token handoff may expose the secret token only at issuance time or another explicitly audited handoff workflow, never through routine query or inspection responses.
12. Invitation redemption must require an authenticated actor, consume the invitation durably on first successful redemption, and write the invited membership relation through the same Ory Keto boundary used by direct membership mutation.
