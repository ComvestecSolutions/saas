/**
 * Admin-saved-views app-helper smoke tests (admin-app implementation
 * plan §9 item 2). Confirms that the root-safe app helpers are
 * exported with the canonical shape, route through the shared
 * runtime-loader path (so they remain safe to import at app root
 * scope), and do not own any local `Request`/`Response` shaping.
 */
import { describe, expect, it } from "vitest";
import {
  createSavedViewFromEnvironment,
  deleteSavedViewFromEnvironment,
  getSavedViewFromEnvironment,
  listSavedViewsFromEnvironment,
  setPinnedSavedViewFromEnvironment,
  updateSavedViewFromEnvironment,
} from "@comvestec/platform";

describe("admin-saved-views app helpers", () => {
  it("exposes the six canonical *FromEnvironment helpers as functions", () => {
    for (const helper of [
      listSavedViewsFromEnvironment,
      getSavedViewFromEnvironment,
      createSavedViewFromEnvironment,
      updateSavedViewFromEnvironment,
      deleteSavedViewFromEnvironment,
      setPinnedSavedViewFromEnvironment,
    ]) {
      expect(typeof helper).toBe("function");
      // Each helper takes (environment, input) → Effect.
      expect(helper.length).toBe(2);
    }
  });

  it("helper source files do not shape Request/Response payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/admin-saved-views-actions.ts",
      ),
      "utf8",
    );
    // Defensive: helpers are forbidden from owning Request/Response
    // construction — that is HTTP-transport territory.
    expect(source.includes("new Request(")).toBe(false);
    expect(source.includes("new Response(")).toBe(false);
    // Defensive: helpers must route through `loadRuntimeModuleOrDie`
    // (the shared runtime-loader-backed dynamic import) instead of a
    // duplicate `Effect.tryPromise` wrapper.
    expect(source.includes("loadRuntimeModuleOrDie")).toBe(true);
    // Strip block comments before asserting the absence of a
    // duplicate Effect.tryPromise wrapper so the docstring's
    // historical reference does not trip this guard.
    const sourceWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sourceWithoutComments.includes("Effect.tryPromise")).toBe(false);
  });
});
