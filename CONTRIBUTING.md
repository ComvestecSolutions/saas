# Contributing

## Ground Rules

1. Treat this repository as a reusable SaaS foundation, not a one-off app.
2. Keep changes grouped by one related area of work per commit.
3. Do not mix unrelated package, app, spec, and tooling changes into one commit.
4. Update docs, instructions, specs, and tests in the same change when behavior or governance changes.
5. Open pull requests to `dev`. Leave `main` untouched until a later promotion.

## Local Setup

1. Install dependencies with `bun install`.
2. Run `bun run hooks:install` if the hooks were not configured automatically.
3. Keep hooks enabled. `pre-commit` blocks invalid local branch names, and `pre-push` revalidates published branch refs plus outbound commit messages.
4. Use `bun run format:check`, `bun run typecheck`, and `bun run test` before pushing.

## Type Hygiene

1. Reuse existing named schema types when they already exist. For example, use `RequestContext` instead of repeating `Schema.Schema.Type<typeof RequestContextSchema>` in downstream code.
2. Introduce `Schema.Schema.Type<typeof SomeSchema>` only at the canonical type alias definition for that schema, or when no named type exists yet.
3. Treat `unknown` as a boundary-only tool. Keep it for raw undecoded input, external thrown values, arbitrary JSON payloads, or generic-preserving casts that cannot be tightened honestly.
4. Decode request, transport, and framework payloads at the edge before passing them into typed services.
5. Decode environment-derived runtime config at the boundary too. Required env values must fail fast when missing or empty; do not hardcode localhost URLs, credentials, or fallback defaults inside runtime code.

## Branch Naming

Use this format for all working branches except `main` and `dev`:

`<type>/<scope>-<short-slug>`

Allowed branch types:

1. `feature`
2. `fix`
3. `chore`
4. `docs`
5. `refactor`
6. `test`
7. `build`
8. `ci`
9. `perf`
10. `hotfix`
11. `release`

Allowed scopes:

1. `repo`
2. `contracts`
3. `config`
4. `modules`
5. `platform`
6. `apps`
7. `admin-app`
8. `product-app`
9. `public-web`
10. `ops`
11. `specs`
12. `tests`
13. `e2e`
14. `security`
15. `deps`
16. `tooling`

Examples:

1. `feature/platform-service-name-vocabulary`
2. `chore/repo-contribution-governance`
3. `fix/modules-break-glass-expiry`

## Commit Messages

Commit messages follow Conventional Commits with a required scope:

`<type>(<scope>): <subject>`

Allowed commit types:

1. `feat`
2. `fix`
3. `docs`
4. `style`
5. `refactor`
6. `perf`
7. `test`
8. `build`
9. `ci`
10. `chore`
11. `revert`

Commit scopes use the branch scope list above, plus `docs` and `ci` for repository documentation or workflow automation changes.

Examples:

1. `chore(repo): add contribution governance baseline`
2. `ci(repo): validate pull request body headings`
3. `refactor(platform): centralize adapter service names`

## Grouped Commit Policy

1. Each commit should have one primary change area.
2. Companion updates in `tests/`, `specs/`, docs, or repo tooling are allowed when they directly support that same primary area.
3. If a change touches more than one primary area, split it into separate commits.
4. Repo-wide meta changes such as hook setup, GitHub templates, dependency policy, or formatter rules belong in `repo`, `ci`, `deps`, or `tooling` scoped commits.

## Pull Requests

1. Branch from the latest `dev` state when possible.
2. Open PRs into `dev`.
3. Keep PRs focused on one area of responsibility.
4. Fill out the pull request template fully.
5. Make sure the PR body begins with `# Pull Request` and keeps these headings intact: `## What Does This PR Do?`, `## Why Is This Needed?`, `## What Changed?`, `## Testing Notes`, `## Screenshots/Demo (If Applicable)`, `## Review Notes`, and `## Checklist`.
6. Do not add placeholder linked-work-item fields or manual affected-surface sections; GitHub applies path-based labels automatically from changed paths.
7. GitHub auto-assigns the PR author when the author is assignable in the repository; reassign only when ownership truly changes.
8. Do not leave placeholder text, unchecked assumptions, or unrelated commits in the branch history.

## Required Validation

Before push:

1. `bun run format:check`
2. `bun run typecheck`
3. `bun run test`
4. Let the configured `pre-push` hook validate the exact branch refs being published and the commit messages leaving your machine.

Before merge:

1. Docs and instructions reflect the final pattern.
2. Commits are grouped logically.
3. PR targets `dev`.
4. Security-sensitive changes have explicit tests.
5. Branch-name, commit-history, label, and PR-body validation workflows are green.

## Security Reports

Do not open public issues for vulnerabilities. Follow [SECURITY.md](SECURITY.md).
