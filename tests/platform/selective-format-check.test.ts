import {
  selectChangedFilesForFormatCheck,
  splitFilesForPrettierCheck,
  shouldRunFullFormatCheck,
  shouldSkipFormatCheck,
} from "../../tooling/scripts/validation/run-selective-format-check";

describe("selectChangedFilesForFormatCheck", () => {
  it("keeps only changed files that still exist", () => {
    expect(
      selectChangedFilesForFormatCheck(
        ["README.md", "missing-file.ts"],
        (relativePath) => relativePath !== "missing-file.ts",
      ),
    ).toEqual(["README.md"]);
  });

  it("normalizes and deduplicates changed file paths", () => {
    expect(
      selectChangedFilesForFormatCheck(
        ["README.md", ".\\README.md", "package.json"],
        () => true,
      ),
    ).toEqual(["package.json", "README.md"]);
  });
});

describe("shouldSkipFormatCheck", () => {
  it("skips when the fingerprint is already cached", () => {
    expect(
      shouldSkipFormatCheck({
        force: false,
        cachedFingerprint: "same",
        currentFingerprint: "same",
      }),
    ).toBe(true);
  });

  it("reruns when force is enabled", () => {
    expect(
      shouldSkipFormatCheck({
        force: true,
        cachedFingerprint: "same",
        currentFingerprint: "same",
      }),
    ).toBe(false);
  });
});

describe("shouldRunFullFormatCheck", () => {
  it("forces a full sweep when prettier config changes", () => {
    expect(shouldRunFullFormatCheck([".prettierrc.json"])).toBe(true);
  });

  it("forces a full sweep when prettier ignore rules change", () => {
    expect(shouldRunFullFormatCheck([".prettierignore"])).toBe(true);
  });

  it("forces a full sweep when editorconfig changes", () => {
    expect(shouldRunFullFormatCheck([".editorconfig"])).toBe(true);
  });

  it("keeps normal source edits on the selective file path", () => {
    expect(shouldRunFullFormatCheck(["tests/platform/example.test.ts"])).toBe(
      false,
    );
  });
});

describe("splitFilesForPrettierCheck", () => {
  it("keeps short file lists in a single batch", () => {
    expect(
      splitFilesForPrettierCheck(["README.md", "package.json"], 200),
    ).toEqual([["README.md", "package.json"]]);
  });

  it("splits file lists before the spawn argument length is exceeded", () => {
    const files = ["aaaa.ts", "bbbb.ts", "cccc.ts"];

    expect(splitFilesForPrettierCheck(files, 60)).toEqual([
      ["aaaa.ts"],
      ["bbbb.ts"],
      ["cccc.ts"],
    ]);
  });

  it("keeps a single oversized file in its own batch", () => {
    expect(splitFilesForPrettierCheck(["very-long-file-name.ts"], 10)).toEqual([
      ["very-long-file-name.ts"],
    ]);
  });
});
