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
  / mobile for the current primary admin route subset declared in
  `visual/admin-routes.spec.ts`: `/desk`, `/r/tenants`, `/r/audit`,
  `/r/config`, `/r/flag`, `/r/access`, `/r/billing`, `/r/branding`,
  `/r/retention`, `/r/webhook`, `/r/runs`, `/r/vendors`, `/r/notify`,
  `/r/support`, `/admin/profile`, `/admin/members`,
  `/admin/workspaces`, `/admin/tokens`, and `/admin/audit` (Phase 8c).
- `a11y/**` — `@axe-core/playwright`-backed WCAG 2.1 AA audit for the
  same primary route subset declared in `a11y/admin-routes.spec.ts`;
  serious + critical violations fail CI (Phase 8d).

Run from the repository root:

- `bun run test:e2e` — operator journey
- `bun run test:visual` — visual regression
- `bun run test:a11y` — axe a11y audit
- `bun run test:admin:local` — deploy the local admin stack,
  provision the deterministic admin operator, then run the e2e,
  a11y, and visual suites against the resolved localhost target

Suite-specific local wrappers are also available through
`bun run test:e2e:local`, `bun run test:a11y:local`, and
`bun run test:visual:local`.

The trusted-session fixture is env-bound. Required values live in
`.env.example` (`ADMIN_E2E_*` block). When any value is unset the
fixture skips instead of synthesizing localhost credentials, so the
gate is honest about whether a real platform target was available.

Playwright configuration lives in `playwright.config.ts`. When
`ADMIN_E2E_BASE_URL` is unset the config auto-starts the admin-app
dev server at `http://127.0.0.1:3004` for local exploration. When
the resolved base URL still points at `localhost` / `127.0.0.1`,
the config continues to reuse or start the repo-owned admin dev
server so the local wrappers remain rerunnable without manual
startup. Only non-local configured origins disable the `webServer`
block and target the configured remote origin directly.
