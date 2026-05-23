import { existsSync, readFileSync } from "node:fs";
import {
  buildPrePushValidationCommands,
  pushRefsFileEnvironmentVariableName,
  withTemporaryPushRefsFile,
} from "../../tooling/scripts/tests/run-pre-push-validation";

describe("withTemporaryPushRefsFile", () => {
  it("writes and later removes the temporary push refs file", async () => {
    let capturedPushRefsFilePath: string | undefined;

    await withTemporaryPushRefsFile(
      "refs/heads/feat/tooling abc123 refs/heads/feat/tooling 0000000000000000000000000000000000000000\n",
      async (pushRefsFilePath) => {
        capturedPushRefsFilePath = pushRefsFilePath;
        expect(existsSync(pushRefsFilePath)).toBe(true);
        expect(readFileSync(pushRefsFilePath, "utf8")).toContain(
          "refs/heads/feat/tooling",
        );
      },
    );

    if (capturedPushRefsFilePath === undefined) {
      throw new TypeError("Expected a temporary push refs file path.");
    }

    expect(existsSync(capturedPushRefsFilePath)).toBe(false);
  });
});

describe("buildPrePushValidationCommands", () => {
  it("passes push refs through stdin for ref validation and through env for format, typecheck, and test", () => {
    const commands = buildPrePushValidationCommands({
      pushRefs:
        "refs/heads/feat/tooling abc123 refs/heads/feat/tooling 0000000000000000000000000000000000000000\n",
      pushRefsFilePath: "C:\\temp\\push-refs.txt",
    });

    expect(commands).toHaveLength(4);
    expect(commands[0]).toEqual({
      command: ["bun", "run", "tooling/scripts/validate-pre-push.mjs"],
      input:
        "refs/heads/feat/tooling abc123 refs/heads/feat/tooling 0000000000000000000000000000000000000000\n",
    });
    expect(commands[1]).toEqual({
      command: ["bun", "run", "format:check"],
      environmentOverrides: {
        [pushRefsFileEnvironmentVariableName]: "C:\\temp\\push-refs.txt",
      },
    });
    expect(commands[2]).toEqual({
      command: ["bun", "run", "typecheck"],
      environmentOverrides: {
        [pushRefsFileEnvironmentVariableName]: "C:\\temp\\push-refs.txt",
      },
    });
    expect(commands[3]).toEqual({
      command: ["bun", "run", "test"],
      environmentOverrides: {
        [pushRefsFileEnvironmentVariableName]: "C:\\temp\\push-refs.txt",
      },
    });
  });
});
