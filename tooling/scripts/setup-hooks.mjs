import { execFileSync } from "node:child_process";

const run = (command, args) =>
  execFileSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
  }).trim();

try {
  run("git", ["rev-parse", "--is-inside-work-tree"]);
  run("git", ["config", "core.hooksPath", ".githooks"]);
  process.stdout.write("Configured git hooks to use .githooks\n");
} catch {
  process.stdout.write(
    "Skipped hook installation because this is not a git worktree.\n",
  );
}
