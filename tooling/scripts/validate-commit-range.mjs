import { execFileSync } from "node:child_process";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
  stdio: "pipe",
}).trim();

const runGit = (args) =>
  execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

const baseRef = process.argv[2] ?? process.env.BASE_REF;
const headRef = process.argv[3] ?? process.env.HEAD_REF;

if (!baseRef || !headRef) {
  process.stderr.write(
    "Expected base and head revisions. Example: node tooling/scripts/validate-commit-range.mjs origin/dev HEAD\n",
  );
  process.exit(1);
}

const commitIds = runGit(["rev-list", "--reverse", `${baseRef}..${headRef}`])
  .split(/\r?\n/)
  .map((commitId) => commitId.trim())
  .filter(Boolean);

if (commitIds.length === 0) {
  process.stdout.write(`No commits found between ${baseRef} and ${headRef}.\n`);
  process.exit(0);
}

const failures = [];

for (const commitId of commitIds) {
  const message = runGit(["log", "-1", "--format=%B", commitId]);
  const subject = message.split(/\r?\n/, 1)[0] ?? commitId;

  try {
    execFileSync("bun", ["x", "commitlint"], {
      cwd: repoRoot,
      encoding: "utf8",
      input: message,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();

    failures.push({
      commitId,
      output,
      subject,
    });
  }
}

if (failures.length > 0) {
  process.stderr.write(
    "Commit history validation failed for one or more commits.\n\n",
  );

  for (const failure of failures) {
    process.stderr.write(
      [
        `Commit ${failure.commitId.slice(0, 7)}: ${failure.subject}`,
        failure.output || "commitlint rejected the message.",
      ].join("\n") + "\n\n",
    );
  }

  process.exit(1);
}

process.stdout.write(
  `Validated ${commitIds.length} commit message(s) between ${baseRef} and ${headRef}.\n`,
);
