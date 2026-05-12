# ADR-021 Vitest Validation Stack

Status: accepted

## Decision

1. Replace Jest plus `ts-jest` with Vitest for repository-owned unit and integration tests.
2. Keep Bun as the command surface for non-browser test execution by invoking Vitest through package scripts such as `bun run test` and `bun run test:backend`, rather than using Bun's built-in `bun test` runner.
3. Use Vitest Browser Mode with a Playwright provider for browser and component tests that need real browser execution in the first-party app shells.
4. Keep the existing Playwright end-to-end suite as a separate validation layer instead of merging end-to-end coverage into Vitest Browser Mode.

## Rationale

1. Vitest aligns with the Vite-native transform pipeline already used by the TanStack Start app shells, reducing duplicated test-only ESM and TypeScript configuration.
2. Replacing `ts-jest` removes a separate ESM transform stack that was only present to keep Jest working against the repository's TypeScript and path-alias layout.
3. The repository is Bun-first for package management, scripts, hooks, and automation, but Vitest's own docs distinguish running Vitest through Bun scripts from Bun's built-in `bun test` runner. Keeping `bun run ...` as the operator surface preserves the Bun-first workflow without switching to the wrong test engine.
4. Vitest Browser Mode gives app-shell tests native browser globals and real interaction semantics while the Playwright provider keeps the browser path CI-ready and consistent with the repository's existing browser automation footprint.

## Consequences

1. The root validation contract changes from Jest-through-Bun scripts to Vitest-through-Bun scripts.
2. Browser and component tests follow explicit Vitest project boundaries and naming conventions instead of sharing the non-browser runner.
3. Jest-specific module mocking, timer control, and namespace typing must be rewritten to Vitest-compatible APIs during migration.
4. Coverage, watch mode, and browser-mode orchestration are provided by Vitest configuration rather than by ad hoc per-tool wrappers.
