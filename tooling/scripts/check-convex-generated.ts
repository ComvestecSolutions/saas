import { existsSync } from "node:fs";
import path from "node:path";

const requiredGeneratedBindings = [
  "convex/_generated/api.d.ts",
  "convex/_generated/api.js",
  "convex/_generated/dataModel.d.ts",
  "convex/_generated/server.d.ts",
  "convex/_generated/server.js",
] as const;

const missingBindings = requiredGeneratedBindings.filter(
  (relativePath) => !existsSync(path.resolve(relativePath)),
);

if (missingBindings.length > 0) {
  console.error(
    [
      "Missing required Convex generated bindings:",
      ...missingBindings.map((relativePath) => `- ${relativePath}`),
      "Restore or commit the tracked convex/_generated binding set before rerunning the root typecheck path.",
      "Only regenerate convex/_generated when you are intentionally updating the committed generated surface.",
    ].join("\n"),
  );
  process.exitCode = 1;
}
