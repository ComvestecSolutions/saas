export const allowedBranches = new Set(["main", "dev"]);

export const branchPattern =
  /^(feature|fix|chore|docs|refactor|test|build|ci|perf|hotfix|release)\/(repo|contracts|config|modules|platform|apps|admin-app|product-app|public-web|ops|specs|tests|e2e|security|deps|tooling)-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidBranchName = (branch) =>
  allowedBranches.has(branch) || branchPattern.test(branch);

export const getInvalidBranchNameMessage = (branch) =>
  [
    `Invalid branch name: ${branch}`,
    "Expected `main`, `dev`, or `<type>/<scope>-<slug>`.",
    "Example: feature/platform-service-name-vocabulary",
  ].join("\n");
