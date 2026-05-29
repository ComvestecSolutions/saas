# Visual baselines

Per-route Playwright screenshots at desktop (1440×900), tablet
(768×1024), and mobile (375×812) viewports (admin-app spec §11
Phase 8c + §10 layer 5).

Baselines are written under `__screenshots__/` after the first run
on a stable, env-bound platform target (`ADMIN_E2E_BASE_URL` and the
trusted-session cookie). When the resolved target stays on
`localhost` / `127.0.0.1`, the visual config reuses or starts the
repo-owned admin dev server so the local wrapper can refresh
baselines without a separate manual startup step. Remote and staging
targets stay pinned to the configured origin and keep the
`webServer` block disabled.

Bootstrap a new baseline batch on the pinned target:

```
ADMIN_E2E_BASE_URL=... ADMIN_E2E_TRUSTED_SESSION_COOKIE_NAME=... \
  ADMIN_E2E_TRUSTED_SESSION_COOKIE_VALUE=... \
  ADMIN_E2E_TENANT_ID=... ADMIN_E2E_INVITE_EMAIL=... \
  ADMIN_E2E_TOKEN_LABEL=... \
  bun run test:visual -- --update-snapshots
```

After baselines land, `bun run test:visual` runs the comparison gate.
With no env configured the suite skips per the trusted-session fixture.
For the seeded localhost path, use `bun run test:visual:local`.
