# 012 AI Workflow Governance

Status: accepted

## Goal

Use AI assistance to accelerate delivery without weakening architecture, security, or maintainability.

## Required Assets

1. Root Copilot instructions.
2. Specs for architecture, permissions, data access, and operational rules.
3. ADRs for important decisions.

## AI Contribution Rules

1. AI-generated changes must follow existing specs and ADRs.
2. If a requested change alters architecture, security, permissions, data ownership, or runtime governance, the relevant spec must be updated first.
3. AI must not introduce hidden flags, undocumented config, or UI-only authorization shortcuts.
4. AI changes that affect sensitive data access must update manifests and audit behavior.

## Review Rules

1. Human review is required for security-sensitive, permission-sensitive, and data-model changes.
2. AI-generated changes should cite or align with the relevant spec and ADR in commit or review context.
