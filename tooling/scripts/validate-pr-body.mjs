const body = process.env.PR_BODY ?? "";
const trimmed = body.replace(/^\s+/, "");
const requiredHeadings = [
  "# Pull Request",
  "## What Does This PR Do?",
  "## Why Is This Needed?",
  "## What Changed?",
  "## Testing Notes",
  "## Screenshots/Demo (If Applicable)",
  "## Review Notes",
  "## Checklist",
];

if (!trimmed.startsWith("# Pull Request")) {
  process.stderr.write(
    "Pull request body must begin with `# Pull Request` and must not have extra text before the template.\n",
  );
  process.exit(1);
}

for (const heading of requiredHeadings) {
  if (!trimmed.includes(heading)) {
    process.stderr.write(
      `Pull request body is missing required heading: ${heading}\n`,
    );
    process.exit(1);
  }
}

process.stdout.write(
  "Pull request body matches the required template headings.\n",
);
