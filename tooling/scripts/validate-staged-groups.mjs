import { execFileSync } from "node:child_process";

const currentBranch = execFileSync("git", ["branch", "--show-current"], {
  encoding: "utf8",
  stdio: "pipe",
}).trim();

const branchScope = currentBranch.includes("/repo-") ? "repo" : undefined;

const stagedFiles = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
  {
    encoding: "utf8",
    stdio: "pipe",
  },
)
  .split(/\r?\n/)
  .map((entry) => entry.trim())
  .filter(Boolean);

if (stagedFiles.length === 0) {
  process.stdout.write("No staged files to validate.\n");
  process.exit(0);
}

const classify = (filePath) => {
  if (filePath.startsWith("packages/platform/")) return "platform";
  if (filePath.startsWith("packages/modules/")) return "modules";
  if (filePath.startsWith("packages/contracts/")) return "contracts";
  if (filePath.startsWith("packages/config/")) return "config";
  if (filePath.startsWith("packages/e2e/")) return "e2e";
  if (filePath.startsWith("apps/admin-app/")) return "admin-app";
  if (filePath.startsWith("apps/product-app/")) return "product-app";
  if (filePath.startsWith("apps/public-web/")) return "public-web";
  if (filePath.startsWith("apps/")) return "apps";
  if (filePath.startsWith("ops/")) return "ops";
  if (filePath.startsWith("tests/")) return "tests";
  if (filePath.startsWith("specs/")) return "docs";
  if (
    filePath.startsWith(".github/") ||
    filePath.startsWith(".githooks/") ||
    filePath.startsWith("tooling/") ||
    [
      "package.json",
      "bun.lock",
      ".editorconfig",
      ".gitignore",
      ".gitattributes",
      ".dockerignore",
      ".prettierrc.json",
      ".prettierignore",
      "commitlint.config.cjs",
      "lint-staged.config.mjs",
      "README.md",
      "SECURITY.md",
      "CONTRIBUTING.md",
      "CODE_OF_CONDUCT.md",
      "SUPPORT.md",
      "LICENSE",
    ].includes(filePath)
  ) {
    return "repo";
  }

  return "repo";
};

const groups = [...new Set(stagedFiles.map(classify))];
const companionGroups = new Set(["repo", "docs", "tests"]);
const primaryGroups = groups.filter((group) => !companionGroups.has(group));

if (primaryGroups.length > 1) {
  if (branchScope === "repo") {
    process.stdout.write(
      `Repo-scoped branch allows multi-area staged groups: ${groups.join(", ")}\n`,
    );
    process.exit(0);
  }

  process.stderr.write(
    [
      "Staged changes span more than one primary group.",
      `Primary groups: ${primaryGroups.join(", ")}`,
      "Split unrelated changes into separate commits.",
    ].join("\n") + "\n",
  );
  process.exit(1);
}

process.stdout.write(`Staged groups are valid: ${groups.join(", ")}\n`);
