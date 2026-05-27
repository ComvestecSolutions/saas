# Admin App

This TanStack Start shell hosts platform operations, configuration, permissions, audit review, and support tooling.

Current status: live operator shell with the current delivery maturity tracked in [../../specs/00-governance/implementation-tracker.md](../../specs/00-governance/implementation-tracker.md). The intended operator workflow lives in [../../specs/02-apps/admin-app/spec.md](../../specs/02-apps/admin-app/spec.md).

Local development:

- Run `bun run --cwd apps/admin-app dev` from the repository root.
- Default port: `3004`.
- Shared dependencies: `@comvestec/config`, `@comvestec/contracts`, and `@comvestec/platform`.

Routes should stay thin consumers of shared platform services. Do not hand-edit `src/routeTree.gen.ts`; treat generated route tree files as tooling output.
