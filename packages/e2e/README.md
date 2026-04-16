# E2E Package

This package holds Playwright-based browser validation for the SaaS foundation.

Current status: scaffolded. The only checked-in test, `tests/foundation-smoke.spec.ts`, is intentionally skipped until real browser journeys are wired to the current backend-owned surfaces.

Run the suite from the repository root:

- `bun run test:e2e`
- `bun run test:e2e:ui`

Or run it from this package directly:

- `bun run test:e2e`
- `bun run test:e2e:ui`

Playwright configuration lives in `playwright.config.ts`. Add browser tests here once a flow is stable enough to validate end to end instead of as a placeholder scaffold.
