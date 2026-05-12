# SaaS Foundation Specs

## Purpose

This directory is the source of truth for the Comvestec Solutions reusable SaaS platform. The goal is to define a platform baseline that can support many future SaaS products without redesigning the same enterprise concerns for each one.

## Structure

- `00-governance`: delivery tracker, current platform overview, backend-readiness roadmap, backend end-to-end test plan, and spec-process governance artifacts.
- `01-platform`: cross-cutting architecture, security, data, performance, and governance specs, organized into `architecture/`, `access/`, `security/`, `runtime/`, and `domains/`.
- `02-apps`: behavior and responsibilities for public web, product app, and admin app.
- `02-modules`: module manifests for reusable platform capabilities, organized into `access/`, `governance/`, `domains/`, `communication/`, and `data/`.
- `03-adr`: architecture decision records, organized into `architecture/`, `storage/`, `identity/`, `runtime/`, `communication/`, and `domains/`.
- `04-ops`: runbooks and operational procedures.

## Document Status

Use one of these statuses at the top of every future spec:

- `draft`: under discussion.
- `accepted`: approved baseline.
- `superseded`: replaced by another document.

## Authoring Rules

1. Specs define intent, boundaries, and invariants. They do not duplicate implementation details.
2. Accepted specs and ADRs describe the approved platform direction even when delivery is still scaffolded or partially implemented.
3. Architecture, security, permissions, field visibility, data ownership, observability, and deployment changes must start here.
4. Each module with runtime behavior must eventually have a manifest.
5. Every non-trivial stack or architecture choice should have an ADR.
6. If a feature requires a flag, config, permission, or sensitive data access, that requirement must be described in specs before implementation.

## Progress Tracking

Accepted specs define what the platform is expected to become. Current maturity lives in [00-governance/implementation-tracker.md](00-governance/implementation-tracker.md), backend-ready slice priorities live in [00-governance/backend-readiness-roadmap.md](00-governance/backend-readiness-roadmap.md), and the reusable backend e2e delivery program lives in [00-governance/backend-end-to-end-test-plan.md](00-governance/backend-end-to-end-test-plan.md).

1. Update the tracker in the same change when a spec area moves from documented to scaffolded, implemented, validated, or blocked.
2. Update the roadmap in the same change when the first backend-ready slice changes scope, work order, or acceptance criteria.
3. Link tracker rows to both the governing spec and the evidence that justifies the status.
4. Do not rewrite accepted specs down to the current implementation gap. Use the tracker to record whether delivery is documented, scaffolded, implemented, validated, or blocked.

## Initial Scope

The first implementation slice covers:

- modular monolith architecture
- multi-tenant identity and authorization
- field-level data security
- config, permissions, and feature governance
- observability and auditability
- instant-app performance model
- self-hostable deployment profiles
- admin operating model
