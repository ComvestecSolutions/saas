const forbiddenCopilotCoauthorTrailer =
  "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>";

module.exports = {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "no-copilot-coauthor-trailer": (parsed) => {
          const rawMessage =
            parsed.raw ??
            [parsed.header, parsed.body, parsed.footer]
              .filter(Boolean)
              .join("\n\n");

          return [
            !rawMessage.includes(forbiddenCopilotCoauthorTrailer),
            `commit messages must not include "${forbiddenCopilotCoauthorTrailer}".`,
          ];
        },
      },
    },
  ],
  rules: {
    "header-max-length": [2, "always", 100],
    "no-copilot-coauthor-trailer": [2, "always"],
    "scope-empty": [2, "never"],
    "scope-enum": [
      2,
      "always",
      [
        "repo",
        "contracts",
        "config",
        "modules",
        "platform",
        "apps",
        "admin-app",
        "product-app",
        "public-web",
        "ops",
        "specs",
        "tests",
        "e2e",
        "security",
        "deps",
        "tooling",
        "docs",
        "ci",
      ],
    ],
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
  },
};
