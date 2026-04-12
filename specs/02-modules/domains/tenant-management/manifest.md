# Tenant Management Manifest

Status: accepted

## Technology Boundary

Keycloak for identity federation. Convex for tenant data and membership state. PostgreSQL for audit records related to membership changes.

## Responsibilities

1. Enterprise accounts, organizations, and individual user records.
2. Memberships, invitations, and role assignment.
3. Tenant context resolution for applications and workflows.
4. Standalone individual support — individuals without enterprise or organization affiliation.
5. Guided onboarding workflow and activation checklist for new tenants.

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
