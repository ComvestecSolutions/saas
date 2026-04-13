# SaaS Foundation Specs

## Purpose

This directory is the source of truth for the Comvestec Solutions reusable SaaS platform. The goal is to define a platform baseline that can support many future SaaS products without redesigning the same enterprise concerns for each one.

## Structure

- `00-governance`: delivery tracker, backend-readiness roadmap, and spec-process governance artifacts.
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
2. Architecture, security, permissions, field visibility, data ownership, observability, and deployment changes must start here.
3. Each module with runtime behavior must eventually have a manifest.
4. Every non-trivial stack or architecture choice should have an ADR.
5. If a feature requires a flag, config, permission, or sensitive data access, that requirement must be described in specs before implementation.

## Progress Tracking

Implementation status is tracked in [00-governance/implementation-tracker.md](00-governance/implementation-tracker.md). Backend-ready slice priorities are tracked in [00-governance/backend-readiness-roadmap.md](00-governance/backend-readiness-roadmap.md).

1. Update the tracker in the same change when a spec area moves from documented to scaffolded, implemented, validated, or blocked.
2. Update the roadmap in the same change when the first backend-ready slice changes scope, work order, or acceptance criteria.
3. Link tracker rows to both the governing spec and the evidence that justifies the status.

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
