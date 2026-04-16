# Module Catalog

## Purpose

This directory defines reusable platform modules for the SaaS foundation. Each module has a manifest that declares its responsibilities, rules, runtime governance, and admin-surface requirements.

Modules are grouped by domain concern.

Accepted module manifests describe the approved capability catalog for the foundation. They do not imply that every module is already implemented or validated in code.

Use [../00-governance/implementation-tracker.md](../00-governance/implementation-tracker.md) as the source of truth for whether a module is still documented, scaffolded, implemented, validated, or blocked.

## access/

1. authorization
2. field-security
3. identity-session

## governance/

1. audit-log
2. feature-flags
3. config-runtime
4. retention-legal-hold
5. support-operations

## domains/

1. tenant-management
2. tenant-branding
3. billing-and-metering
4. observability

## communication/

1. email-delivery
2. notification-center
3. webhooks-api-access

## data/

1. file-storage
2. import-export
3. search
4. workflow-jobs
