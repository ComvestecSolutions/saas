# axe a11y audits

`@axe-core/playwright`-driven WCAG 2.1 AA audits over every primary
admin-app route (admin-app spec §11 Phase 8d + §10 layer 6 + §14
guardrail "No UI-only authorization" — a11y is a backend-agnostic
contract).

Severity floor: `serious` and `critical` violations fail the gate.
Waivers live in `a11y-allowlist.ts` keyed by `{ route, ruleId,
justification }` — no blanket waivers, no waivers without inline
justification. The list ships empty: first run on the pinned
platform target MUST be green before any waiver lands.

Run from the repo root:

```
bun run test:a11y
```

For the seeded localhost path, use `bun run test:a11y:local`.

The trusted-session fixture skips the audit when `ADMIN_E2E_*` env
values are absent — the gate never synthesizes local credentials.
When the resolved target stays on `localhost` / `127.0.0.1`, the
a11y Playwright config reuses or starts the repo-owned admin dev
server so the local wrapper can rerun without separate manual
startup. Remote and staging targets stay pinned to the configured
origin and keep the `webServer` block disabled.
