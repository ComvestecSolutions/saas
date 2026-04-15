# Tooling

This directory is reserved for repository automation, validation scripts, spec checks, and generation tools.

## Current Workflow Automation

1. `tooling/scripts/setup-hooks.mjs` configures `.githooks` as the local hook path.
2. `tooling/scripts/validate-branch-name.mjs` enforces `main`, `dev`, or `<type>/<scope>-<slug>` branch names for local work.
3. `tooling/scripts/validate-pre-push.mjs` revalidates the exact branch refs being published and lints every outbound commit message before a push is allowed. It reads ref updates from stdin, so prefer exercising it through `git push` instead of invoking it bare.
4. `tooling/scripts/validate-commit-range.mjs` lints commit messages across a PR or revision range so workflow checks can catch invalid history even if local hooks are bypassed.
5. `tooling/scripts/validate-staged-groups.mjs` enforces one primary change area per commit, with `repo`, `docs`, and `tests` treated as companion groups.
6. `tooling/scripts/validate-pr-body.mjs` enforces the required pull request template headings.
7. `commitlint.config.cjs` and `lint-staged.config.mjs` enforce commit-message structure and staged-file formatting.
8. `tooling/scripts/run-subscriber-journey-api.ts` starts the backend-owned subscriber journey HTTP surface without relying on any frontend app runtime.

Planned tooling includes:

1. spec validation
2. manifest validation
3. bidirectional config registry sync and drift checks
4. permission coverage checks
5. audit coverage checks
6. implementation tracker consistency checks
