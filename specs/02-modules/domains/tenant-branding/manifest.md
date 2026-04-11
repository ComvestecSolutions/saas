# Tenant Branding Manifest

Status: accepted

## Technology Boundary

Runtime-config for tenant-scoped effective values and entitlement-gated resolution. Convex via `file-storage` for logos, favicons, and approved branding assets. PostgreSQL for custom-domain verification state, sender identity metadata, approval history, and audit records.

## Responsibilities

1. Own the effective tenant-branding model across public web, product app, admin app, email delivery, notification center, and identity/session surfaces.
2. Manage approved branding tokens and safe public copy fields.
3. Manage branding asset references and lifecycle integration with `file-storage`.
4. Manage branded sender identity metadata for email surfaces.
5. Manage optional custom-domain requests, verification state, and hostname-to-tenant mapping inputs.
6. Expose public-safe, admin, and support-safe branding projections.

## Ownership Metadata

1. Owner module: `tenant-branding`.
2. Primary admin surface: `admin-app` branding and domain management screens.
3. Downstream consumers: `public-web`, `product-app`, `email-delivery`, `notification-center`, and `identity-session`.
4. Code-declared defaults, schemas, and allowed scopes remain versioned in the repository and synchronize through `runtime-config`.

## Permission Scopes

| Scope             | Description                                               |
| ----------------- | --------------------------------------------------------- |
| `branding:manage` | Manage branding settings, assets, and custom-domain state |

## Feature Flags

| Flag                            | Purpose                                                  | Billable | Default | Allowed Scopes                     |
| ------------------------------- | -------------------------------------------------------- | -------- | ------- | ---------------------------------- |
| `tenant-branding.enabled`       | Enable tenant-specific branding beyond platform defaults | Yes      | false   | platform, enterprise, organization |
| `tenant-branding.customDomain`  | Allow tenant custom-domain requests and activation       | Yes      | false   | platform, enterprise, organization |
| `tenant-branding.brandedEmails` | Apply tenant sender identity and branded email chrome    | Yes      | false   | platform, enterprise, organization |

## Config Keys

| Key                                 | Description                                        | Default | Billable | Allowed Scopes                     |
| ----------------------------------- | -------------------------------------------------- | ------- | -------- | ---------------------------------- |
| `tenant-branding.companyName`       | Public display name for the tenant                 | inherit | Yes      | platform, enterprise, organization |
| `tenant-branding.logoAssetId`       | File reference for the published tenant logo       | inherit | Yes      | platform, enterprise, organization |
| `tenant-branding.faviconAssetId`    | File reference for the published tenant favicon    | inherit | Yes      | platform, enterprise, organization |
| `tenant-branding.theme.primary`     | Approved primary color token                       | inherit | Yes      | platform, enterprise, organization |
| `tenant-branding.theme.secondary`   | Approved secondary color token                     | inherit | Yes      | platform, enterprise, organization |
| `tenant-branding.theme.accent`      | Approved accent color token                        | inherit | Yes      | platform, enterprise, organization |
| `tenant-branding.font.heading`      | Approved heading font token                        | inherit | Yes      | platform, enterprise, organization |
| `tenant-branding.font.body`         | Approved body font token                           | inherit | Yes      | platform, enterprise, organization |
| `tenant-branding.supportEmail`      | Public support contact shown in branded surfaces   | inherit | Yes      | platform, enterprise, organization |
| `tenant-branding.replyToEmail`      | Reply-to identity for branded email surfaces       | inherit | Yes      | platform, enterprise, organization |
| `tenant-branding.customDomain.host` | Requested customer-owned hostname for public entry | null    | Yes      | enterprise, organization           |

## Data Classifications

| Data                                                  | Classification      |
| ----------------------------------------------------- | ------------------- |
| Published brand assets and public company copy        | public              |
| Effective branding tokens and asset references        | internal            |
| Reply-to addresses and sender identity metadata       | tenant-confidential |
| Custom-domain verification records and approval notes | tenant-confidential |
| DNS challenge tokens or domain proofs                 | secret              |

## Projection Profiles

| Profile        | Visible Fields                                                                                                                                       | Audited Fields                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `summary`      | tenantId, companyName, logoUrl, faviconUrl, themeTokens, supportEmail                                                                                | —                              |
| `admin`        | tenantId, companyName, assetIds, themeTokens, supportEmail, replyToEmail, customDomainHost, customDomainStatus, effectiveScope, changedBy, changedAt | replyToEmail, customDomainHost |
| `support-safe` | tenantId, companyName, customDomainStatus, effectiveScope, changedAt                                                                                 | customDomainStatus             |

## Rollout and Retirement Rules

1. New branding keys or flags ship with explicit platform defaults and documented public versus admin projection behavior.
2. Retiring a branding key, sender identity field, or subfeature requires a fallback or migration plan so existing tenant renders do not break silently.
3. Custom-domain retirement must preserve audit history and move records to a terminal lifecycle state rather than deleting verification evidence.

## Rules

1. Only approved design tokens and safe copy fields may be overridden. No arbitrary CSS, JavaScript, HTML, or template code injection is allowed.
2. Effective branding resolves through runtime-config with `platform`, `enterprise`, and `organization` as the default allowed override scopes. `individual` is excluded unless a later accepted spec changes that rule.
3. Entitlement must be checked before applying tenant-specific branding or subfeatures such as custom domains and branded emails.
4. Brand assets are stored in `file-storage`. Domain verification state and approval history remain in PostgreSQL-backed module records.
5. Public-safe projections must never expose verification tokens, unpublished assets, internal sender identities, or approval notes.
6. Custom domains follow the lifecycle `unverified`, `verifying`, `active`, `error`, `retired` and activate only after verification and approval.
7. Email delivery, notification center, and identity/session surfaces consume resolved `tenant-branding` projections and do not own separate branding stores.
