# Public Web App

This TanStack Start shell hosts the public marketing, trust, pricing, and documentation entry points for the SaaS foundation.

Current status: scaffolded. The intended public-web responsibilities live in [../../specs/02-apps/public-web/spec.md](../../specs/02-apps/public-web/spec.md), and current delivery maturity lives in [../../specs/00-governance/implementation-tracker.md](../../specs/00-governance/implementation-tracker.md).

Local development:

- Run `bun run --cwd apps/public-web dev` from the repository root.
- Default port: `3000`.
- Shared dependency: `@comvestec/platform`.

This shell should consume backend-owned public plan listing, auth handoff, and checkout boundaries rather than turning into a client-owned billing surface. Do not hand-edit `src/routeTree.gen.ts`.
