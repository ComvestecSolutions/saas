import { execFileSync } from "node:child_process";

import {
  getInvalidBranchNameMessage,
  isValidBranchName,
} from "./branch-name-rules.mjs";

const branchRefPrefix = "refs/heads/";
const zeroObjectIdPattern = /^0+$/;

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

const readPushRefs = async () => {
  let input = "";

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);

      return {
        localRef,
        localSha,
        remoteRef,
        remoteSha,
      };
    });
};

const isZeroObjectId = (value) => zeroObjectIdPattern.test(value);

const toBranchName = (ref) => ref.slice(branchRefPrefix.length);

const isBranchRef = (ref) => ref.startsWith(branchRefPrefix);

const validateBranchRefs = (pushRefs) => {
  const invalidBranches = [];
  const seenBranches = new Set();

  for (const pushRef of pushRefs) {
    if (isZeroObjectId(pushRef.localSha)) {
      continue;
    }

    for (const ref of [pushRef.localRef, pushRef.remoteRef]) {
      if (!isBranchRef(ref)) {
        continue;
      }

      const branchName = toBranchName(ref);

      if (seenBranches.has(branchName)) {
        continue;
      }

      seenBranches.add(branchName);

      if (!isValidBranchName(branchName)) {
        invalidBranches.push(branchName);
      }
    }
  }

  if (invalidBranches.length === 0) {
    return;
  }

  process.stderr.write(
    invalidBranches
      .map((branchName) => getInvalidBranchNameMessage(branchName))
      .join("\n\n") + "\n",
  );
  process.exit(1);
};

const collectOutgoingCommitIds = (pushRefs) => {
  const commitIds = [];
  const seenCommitIds = new Set();

  for (const pushRef of pushRefs) {
    if (isZeroObjectId(pushRef.localSha)) {
      continue;
    }

    if (!isBranchRef(pushRef.localRef) && !isBranchRef(pushRef.remoteRef)) {
      continue;
    }

    const revListArgs = isZeroObjectId(pushRef.remoteSha)
      ? ["rev-list", "--reverse", pushRef.localSha, "--not", "--remotes"]
      : ["rev-list", "--reverse", `${pushRef.remoteSha}..${pushRef.localSha}`];

    const commits = runGit(revListArgs)
      .split(/\r?\n/)
      .map((commitId) => commitId.trim())
      .filter(Boolean);

    for (const commitId of commits) {
      if (seenCommitIds.has(commitId)) {
        continue;
      }

      seenCommitIds.add(commitId);
      commitIds.push(commitId);
    }
  }

  return commitIds;
};

const validateCommitMessages = (commitIds) => {
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

  if (failures.length === 0) {
    return;
  }

  process.stderr.write(
    "Push rejected because one or more commit messages are invalid.\n\n",
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
};

const pushRefs = await readPushRefs();

if (pushRefs.length === 0) {
  process.stdout.write("No refs received for pre-push validation.\n");
  process.exit(0);
}

validateBranchRefs(pushRefs);

const outgoingCommitIds = collectOutgoingCommitIds(pushRefs);

validateCommitMessages(outgoingCommitIds);

process.stdout.write(
  `Validated ${pushRefs.length} push ref(s) and ${outgoingCommitIds.length} outbound commit message(s).\n`,
);
