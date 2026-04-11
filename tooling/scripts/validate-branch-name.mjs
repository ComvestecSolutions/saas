import { execFileSync } from "node:child_process";

const allowedBranches = new Set(["main", "dev"]);
const branchPattern =
  /^(feature|fix|chore|docs|refactor|test|build|ci|perf|hotfix|release)\/(repo|contracts|config|modules|platform|apps|admin-app|product-app|public-web|ops|specs|tests|e2e|security|deps|tooling)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const branchFromGit = () =>
  execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

const branch = process.argv[2] ?? process.env.BRANCH_NAME ?? branchFromGit();

if (allowedBranches.has(branch) || branchPattern.test(branch)) {
  process.stdout.write(`Branch name is valid: ${branch}\n`);
  process.exit(0);
}

process.stderr.write(
  [
    `Invalid branch name: ${branch}`,
    "Expected `main`, `dev`, or `<type>/<scope>-<slug>`.",
    "Example: feature/platform-service-name-vocabulary",
  ].join("\n") + "\n",
);
process.exit(1);
