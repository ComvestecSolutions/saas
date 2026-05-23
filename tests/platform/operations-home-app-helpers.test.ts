/**
 * Operations Home aggregate v2 app-helper smoke tests
 * (admin-app implementation plan §9 item 3). Confirms the
 * canonical helper shape, the shared runtime-loader path, and
 * the absence of `Request`/`Response` shaping at the
 * first-party app boundary.
 */
import { describe, expect, it } from "vitest";
import { getOperationsHomeSnapshotFromEnvironment } from "@comvestec/platform";

describe("operations-home app helpers", () => {
  it("exposes the canonical *FromEnvironment helper as a function", () => {
    expect(typeof getOperationsHomeSnapshotFromEnvironment).toBe("function");
    expect(getOperationsHomeSnapshotFromEnvironment.length).toBe(2);
  });

  it("helper source does not shape Request/Response payloads", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        "packages/platform/src/services/apps/operations-home-actions.ts",
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
