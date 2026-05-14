# Tooling

This directory is reserved for repository automation, validation scripts, spec checks, and generation tools.

Run repo-owned tooling through Bun. Prefer Bun-native APIs such as `Bun.spawn(...)` when Bun exposes an equivalent, keep direct Node runtime usage only for upstream-enforced exceptions such as Convex `"use node"` actions, and treat Node-compat modules used from Bun as compatibility shims rather than a separate Node runtime exception.

## Current Workflow Automation

1. `tooling/scripts/setup-hooks.mjs` configures `.githooks` as the local hook path.
2. `tooling/scripts/validate-branch-name.mjs` enforces `main`, `dev`, or `<type>/<scope>-<slug>` branch names for local work.
3. `tooling/scripts/validate-pre-push.mjs` revalidates the exact branch refs being published, lints every outbound commit message, and rejects the forbidden Copilot co-author trailer before a push is allowed. It reads ref updates from stdin, so prefer exercising it through `git push` instead of invoking it bare.
4. `tooling/scripts/validate-commit-range.mjs` lints commit messages across a PR or revision range so workflow checks can catch invalid history even if local hooks are bypassed.
5. `tooling/scripts/validate-staged-groups.mjs` enforces one primary change area per commit, with `repo`, `docs`, and `tests` treated as companion groups.
6. `tooling/scripts/validate-pr-body.mjs` enforces the required pull request template headings.
7. `commitlint.config.cjs`, `.githooks/commit-msg`, and `lint-staged.config.mjs` enforce commit-message structure, strip the forbidden Copilot co-author trailer from local commit messages, and keep staged-file formatting aligned.
8. `tooling/scripts/run-subscriber-journey-api.ts` starts the backend-owned subscriber journey HTTP surface without relying on any frontend app runtime.
9. `tooling/scripts/check-typecheck-coverage.ts` verifies that every first-party TypeScript file is covered by the actual workspace or root tsconfig entrypoints while only explicit exclusions stay out of scope: `.git/`, `.turbo/`, `node_modules/`, `vendor/`, root `build/`, `coverage/`, and `dist/`, plus workspace `apps/*/build`, `apps/*/dist`, `packages/*/build`, and `packages/*/dist` outputs.
10. The same typecheck coverage audit also enforces owned app file-route definitions under `apps/*/src/routes/**` to bind the exported `Route` directly through the app-local typed helper from `src/file-route`. Root route definitions in `apps/*/src/routes/__root.tsx` stay outside this specific file-route audit because they use `createRootRoute(...)` rather than `createFileRoute(...)`.

Planned tooling includes:

The items below are backlog candidates, not implemented repository automation today.

1. spec validation
2. manifest validation
3. bidirectional config registry sync and drift checks
4. permission coverage checks
5. audit coverage checks
6. implementation tracker consistency checks
