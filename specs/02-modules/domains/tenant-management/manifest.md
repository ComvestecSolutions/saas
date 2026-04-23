# Tenant Management Manifest

Status: accepted

## Technology Boundary

Keycloak for identity federation. Convex for tenant data and membership state. PostgreSQL for onboarding runs, provisioning receipts, and audit records related to membership changes.

## Responsibilities

1. Enterprise accounts, organizations, and individual user records.
2. Memberships, invitations, and role assignment.
3. Tenant context resolution for applications and workflows.
4. Standalone individual support — individuals without enterprise or organization affiliation.
5. Guided onboarding workflow and activation checklist for new tenants.
6. Tenant, owner-membership, and onboarding-run provisioning after validated authentication.

## First Backend-Ready Slice

1. Provision tenant identity, primary owner membership, and default onboarding state immediately after validated auth completion.
2. Support pending-to-active progression as billing entitlements become active.
3. Keep onboarding progress durable and recoverable when downstream billing, notification, or branding steps retry.

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

| Key                                              | Description                             | Default | Billable | Allowed Scopes                     |
| ------------------------------------------------ | --------------------------------------- | ------- | -------- | ---------------------------------- |
| `tenant-management.membership.inviteExpiryHours` | Hours before an invite expires          | 72      | No       | platform, enterprise, organization |
| `tenant-management.onboarding.reminderDays`      | Days between onboarding reminder nudges | 3       | No       | platform, enterprise, organization |

## Data Classifications

| Data                              | Classification      |
| --------------------------------- | ------------------- |
| Enterprise and organization names | internal            |
| Membership records                | tenant-confidential |
| Invitation tokens                 | secret              |
| Billing email                     | regulated-sensitive |

## Projection Profiles

| Profile      | Visible Fields                              | Audited Fields |
| ------------ | ------------------------------------------- | -------------- |
| summary      | id, name, status                            | —              |
| admin        | id, name, status, billingEmail, memberCount | billingEmail   |
| support-safe | id, name, status, createdAt                 | —              |

## Key Rules

1. One human identity may belong to many tenants.
2. Tenant boundaries must be explicit in storage and events.
3. Membership changes must be auditable.
4. Standalone individuals are first-class tenants with their own config and entitlement resolution.
5. Onboarding progress is tenant-scoped operational state, not a substitute for permission or entitlement checks.
6. Tenant provisioning must be safe to retry when auth callback or billing events are delivered more than once.
7. Initial tenant creation must not require frontend-owned orchestration.
8. When billing reconciliation can prove prior owner linkage for a tenant, provisioning and onboarding repair may be retried automatically without waiting for another login.
