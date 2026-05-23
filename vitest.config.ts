import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const workspaceRootDirectory = fileURLToPath(new URL(".", import.meta.url));

const resolveFromWorkspaceRoot = (...segments: string[]): string =>
  resolve(workspaceRootDirectory, ...segments);

export default defineConfig({
  resolve: {
    alias: {
      "@comvestec/contracts": resolveFromWorkspaceRoot(
        "packages/contracts/src/index.ts",
      ),
      "@comvestec/config": resolveFromWorkspaceRoot(
        "packages/config/src/index.ts",
      ),
      "@comvestec/platform/http": resolveFromWorkspaceRoot(
        "packages/platform/src/http/index.ts",
      ),
      "@comvestec/platform": resolveFromWorkspaceRoot(
        "packages/platform/src/index.ts",
      ),
      "@comvestec/modules": resolveFromWorkspaceRoot(
        "packages/modules/src/index.ts",
      ),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "clover", "json"],
      reportsDirectory: "./coverage",
      include: [
        "apps/*/src/**/*.{ts,tsx}",
        "packages/*/src/**/*.ts",
        "convex/**/*.ts",
        "tooling/**/*.ts",
      ],
      exclude: [
        ...configDefaults.exclude,
        "apps/*/src/**/*.browser.test.{ts,tsx}",
        "apps/*/src/routeTree.gen.ts",
        "convex/_generated/**",
        "packages/e2e/**",
        "tests/**",
        "tooling/bun.d.ts",
        "vendor/**",
        "**/*.d.ts",
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "backend",
          environment: "node",
          globals: true,
          testTimeout: 15000,
          include: ["tests/**/*.test.ts"],
          exclude: [
            "tests/**/*.browser.test.{ts,tsx}",
            "packages/e2e/**",
            "tests/platform/backend-e2e/**",
          ],
          sequence: {
            hooks: "list",
          },
          maxWorkers: 1,
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "backend-e2e",
          environment: "node",
          globals: true,
          testTimeout: 60000,
          include: ["tests/platform/backend-e2e/**/*.test.ts"],
          sequence: {
            hooks: "list",
          },
          maxWorkers: 1,
          fileParallelism: false,
        },
      },
      "apps/*/vite.config.ts",
      "packages/ui/vite.config.ts",
    ],
  },
});
