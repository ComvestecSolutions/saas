/**
 * Admin-workspaces app-helper smoke tests (admin-app implementation
 * plan §9 item 2). Confirms the root-safe app helpers are exported
 * with the canonical shape, route through the shared runtime-loader
 * path (so they remain safe to import at app root scope), and do
 * not own any local `Request`/`Response` shaping.
 */
import { describe, expect, it } from "vitest";
import {
  createWorkspaceFromEnvironment,
  deleteWorkspaceFromEnvironment,
  getWorkspaceFromEnvironment,
  listWorkspacesFromEnvironment,
  reorderWorkspacesFromEnvironment,
  updateWorkspaceFromEnvironment,
} from "@comvestec/platform";

describe("admin-workspaces app helpers", () => {
  it("exposes the six canonical *FromEnvironment helpers as functions", () => {
    for (const helper of [
      listWorkspacesFromEnvironment,
      getWorkspaceFromEnvironment,
      createWorkspaceFromEnvironment,
      updateWorkspaceFromEnvironment,
      deleteWorkspaceFromEnvironment,
      reorderWorkspacesFromEnvironment,
    ]) {
      expect(typeof helper).toBe("function");
      // Each helper takes (environment, input) → Effect.
      expect(helper.length).toBe(2);
    }
  });

  it("helper source file does not shape Request/Response payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/admin-workspaces-actions.ts",
      ),
      "utf8",
    );
    expect(source.includes("new Request(")).toBe(false);
    expect(source.includes("new Response(")).toBe(false);
    expect(source.includes("loadRuntimeModuleOrDie")).toBe(true);
    const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sourceWithoutComments.includes("Effect.tryPromise")).toBe(false);
  });
});
