# Product App

This TanStack Start shell hosts the authenticated tenant-facing experience for future Comvestec SaaS products.

Current status: validated. The intended backend-ready flow lives in [../../specs/02-apps/product-app/spec.md](../../specs/02-apps/product-app/spec.md), and current delivery maturity lives in [../../specs/00-governance/implementation-tracker.md](../../specs/00-governance/implementation-tracker.md).

Local development:

- Run `bun run --cwd apps/product-app dev` from the repository root.
- Default port: `3002`.
- Shared dependencies: `@comvestec/config`, `@comvestec/contracts`, and `@comvestec/platform`.

This shell should consume backend-owned auth, bootstrap, and entitlement flows through shared platform services rather than reimplementing them in route code. Do not hand-edit `src/routeTree.gen.ts`.
