# Visual baselines

Per-route Playwright screenshots at desktop (1440×900), tablet
(768×1024), and mobile (375×812) viewports (admin-app spec §11
Phase 8c + §10 layer 5).

Baselines are written under `__screenshots__/` after the first run
on a stable, env-bound platform target (`ADMIN_E2E_BASE_URL` and the
trusted-session cookie). The visual config never starts a local dev
server — baselines need a deterministic origin.

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
