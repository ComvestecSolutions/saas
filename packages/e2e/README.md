# E2E Package

Playwright-based browser validation for the SaaS foundation Operator
Desk (admin-app spec §11 Phase 8).

Suites:

- `tests/admin-operator-journey.spec.ts` — sign-in → `/desk` → pin
  tenant → reveal regulated-sensitive audit field → invite member →
  issue + revoke an `admin-operator-test-token`. Uses the
  trusted-session fixture under `tests/fixtures/trusted-session.ts`;
  no manual token paste, no synthesized credentials.
- `visual/**` — per-route Playwright screenshots at desktop / tablet
  / mobile for every `/desk`, `/r/*`, and `/admin/*` route (Phase 8c).
- `a11y/**` — `@axe-core/playwright`-backed WCAG 2.1 AA audit per
  primary route; serious + critical violations fail CI (Phase 8d).

Run from the repository root:

- `bun run test:e2e` — operator journey
- `bun run test:visual` — visual regression
- `bun run test:a11y` — axe a11y audit

The trusted-session fixture is env-bound. Required values live in
`.env.example` (`ADMIN_E2E_*` block). When any value is unset the
fixture skips instead of synthesizing localhost credentials, so the
gate is honest about whether a real platform target was available.

Playwright configuration lives in `playwright.config.ts`. When
`ADMIN_E2E_BASE_URL` is unset the config auto-starts the admin-app
dev server at `http://127.0.0.1:3004` for local exploration; when
`ADMIN_E2E_BASE_URL` is set (CI / staging) the webServer block is
disabled so tests target the configured origin.
