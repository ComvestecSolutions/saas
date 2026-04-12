import { execFileSync } from "node:child_process";

import {
  getInvalidBranchNameMessage,
  isValidBranchName,
} from "./branch-name-rules.mjs";

const branchFromGit = () =>
  execFileSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

const branch = process.argv[2] ?? process.env.BRANCH_NAME ?? branchFromGit();

if (isValidBranchName(branch)) {
  process.stdout.write(`Branch name is valid: ${branch}\n`);
  process.exit(0);
}

process.stderr.write(`${getInvalidBranchNameMessage(branch)}\n`);
process.exit(1);
