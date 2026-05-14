const forbiddenCopilotCoauthorTrailer =
  "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>";

const commitMessagePath = process.argv[2];

if (!commitMessagePath) {
  process.stderr.write("Expected a commit message file path.\n");
  process.exit(1);
}

const originalMessage = await Bun.file(commitMessagePath).text();
const newline = originalMessage.includes("\r\n") ? "\r\n" : "\n";
const hasTrailingNewline = /\r?\n$/.test(originalMessage);
const originalLines = originalMessage.split(/\r?\n/);
const sanitizedLines = originalLines.filter(
  (line) => line !== forbiddenCopilotCoauthorTrailer,
);

if (sanitizedLines.length === originalLines.length) {
  process.exit(0);
}

while (sanitizedLines.length > 0 && sanitizedLines.at(-1) === "") {
  sanitizedLines.pop();
}

const sanitizedMessage =
  sanitizedLines.join(newline) + (hasTrailingNewline ? newline : "");

await Bun.write(commitMessagePath, sanitizedMessage);
