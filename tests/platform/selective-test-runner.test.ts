import {
  parsePushRefs,
  resolveSuiteRelatedFiles,
  selectAffectedTestSuites,
  selectiveTestSuiteId,
  selectiveTestSuites,
  shouldRunFullSuiteForSuiteChanges,
  shouldSkipSuiteFromCache,
  shouldUseSelectiveCache,
  suiteRequiresFullRun,
} from "../../tooling/scripts/tests/run-selective-tests";

describe("selectAffectedTestSuites", () => {
  it("runs admin browser only for admin browser harness fixture changes", () => {
    expect(
      selectAffectedTestSuites([
        "apps/admin-app/src/testing/admin-browser-fixtures.ts",
      ]).map((suite) => suite.id),
    ).toEqual([selectiveTestSuiteId.adminBrowser]);
  });

  it("runs backend and admin browser suites for admin shared lib changes", () => {
    expect(
      selectAffectedTestSuites([
        "apps/admin-app/src/lib/tenant-workspace-index-route-data.ts",
      ]).map((suite) => suite.id),
    ).toEqual([
      selectiveTestSuiteId.backend,
      selectiveTestSuiteId.adminBrowser,
    ]);
  });

  it("fans shared platform changes out to backend and every browser suite", () => {
    expect(
      selectAffectedTestSuites([
        "packages/platform/src/services/access/admin-operator-management.ts",
      ]).map((suite) => suite.id),
    ).toEqual([
      selectiveTestSuiteId.backend,
      selectiveTestSuiteId.adminBrowser,
      selectiveTestSuiteId.productBrowser,
      selectiveTestSuiteId.publicWebBrowser,
    ]);
  });

  it("keeps module-only backend changes off the browser suites", () => {
    expect(
      selectAffectedTestSuites([
        "packages/modules/src/access/identity-session.ts",
      ]).map((suite) => suite.id),
    ).toEqual([selectiveTestSuiteId.backend]);
  });

  it("skips docs-only changes", () => {
    expect(selectAffectedTestSuites(["README.md"])).toEqual([]);
  });

  it("treats root test config changes as a full fanout", () => {
    expect(
      selectAffectedTestSuites(["bun.lock"]).map((suite) => suite.id),
    ).toEqual([
      selectiveTestSuiteId.backend,
      selectiveTestSuiteId.uiBrowser,
      selectiveTestSuiteId.adminBrowser,
      selectiveTestSuiteId.productBrowser,
      selectiveTestSuiteId.publicWebBrowser,
    ]);
  });

  it("fans root workflow package changes out to backend and browser suites", () => {
    expect(
      selectAffectedTestSuites(["package.json"]).map((suite) => suite.id),
    ).toEqual([
      selectiveTestSuiteId.backend,
      selectiveTestSuiteId.uiBrowser,
      selectiveTestSuiteId.adminBrowser,
      selectiveTestSuiteId.productBrowser,
      selectiveTestSuiteId.publicWebBrowser,
    ]);
  });
});

describe("suiteRequiresFullRun", () => {
  const backendSuite = selectiveTestSuites[0];
  const adminBrowserSuite = selectiveTestSuites[1];

  it("keeps backend tooling changes on related mode", () => {
    expect(
      suiteRequiresFullRun(backendSuite, [
        "tooling/scripts/tests/run-selective-tests.ts",
        "tests/platform/selective-test-runner.test.ts",
      ]),
    ).toBe(false);
  });

  it("forces a full run for root lockfile changes", () => {
    expect(suiteRequiresFullRun(adminBrowserSuite, ["bun.lock"])).toBe(true);
  });

  it("forces a full run for app package metadata changes", () => {
    expect(
      suiteRequiresFullRun(adminBrowserSuite, ["apps/admin-app/package.json"]),
    ).toBe(true);
  });
});

describe("shouldRunFullSuiteForSuiteChanges", () => {
  const backendSuite = selectiveTestSuites[0];
  const adminBrowserSuite = selectiveTestSuites[2];

  it("forces the backend suite onto full-run mode when related mode is disabled", () => {
    expect(
      shouldRunFullSuiteForSuiteChanges(
        backendSuite,
        ["packages/modules/src/access/identity-session.ts"],
        () => true,
      ),
    ).toBe(true);
  });

  it("keeps admin browser changes on related mode when the suite supports it", () => {
    expect(
      shouldRunFullSuiteForSuiteChanges(
        adminBrowserSuite,
        ["apps/admin-app/src/lib/tenant-workspace-index-route-data.ts"],
        () => true,
      ),
    ).toBe(false);
  });

  it("forces a full run when a changed file no longer exists on disk", () => {
    expect(
      shouldRunFullSuiteForSuiteChanges(
        adminBrowserSuite,
        ["apps/admin-app/src/lib/tenant-workspace-index-route-data.ts"],
        () => false,
      ),
    ).toBe(true);
  });
});

describe("resolveSuiteRelatedFiles", () => {
  const backendSuite = selectiveTestSuites[0];

  it("keeps direct ts changes as related inputs", () => {
    expect(
      resolveSuiteRelatedFiles(backendSuite, [
        "tooling/scripts/tests/run-selective-tests.ts",
      ]),
    ).toEqual(["tooling/scripts/tests/run-selective-tests.ts"]);
  });

  it("maps workflow-only changes to the selective runner regression test", () => {
    expect(
      resolveSuiteRelatedFiles(backendSuite, [
        ".githooks/pre-push",
        "package.json",
      ]),
    ).toEqual([
      "tests/platform/pre-push-validation.test.ts",
      "tests/platform/selective-test-runner.test.ts",
    ]);
  });

  it("keeps direct ts inputs and workflow fallbacks in the same related run", () => {
    expect(
      resolveSuiteRelatedFiles(backendSuite, [
        ".githooks/pre-push",
        "tooling/scripts/validation/shared.ts",
      ]),
    ).toEqual([
      "tests/platform/pre-push-validation.test.ts",
      "tooling/scripts/validation/shared.ts",
    ]);
  });
});

describe("shouldSkipSuiteFromCache", () => {
  it("skips a suite when the cached fingerprint still matches", () => {
    expect(
      shouldSkipSuiteFromCache({
        force: false,
        cachedFingerprint: "same",
        currentFingerprint: "same",
      }),
    ).toBe(true);
  });

  it("reruns a suite when force is enabled", () => {
    expect(
      shouldSkipSuiteFromCache({
        force: true,
        cachedFingerprint: "same",
        currentFingerprint: "same",
      }),
    ).toBe(false);
  });
});

describe("parsePushRefs", () => {
  it("parses outbound push refs line by line", () => {
    expect(
      parsePushRefs(
        [
          "refs/heads/feat/tooling abc123 refs/heads/feat/tooling 0000000000000000000000000000000000000000",
          "refs/heads/dev def456 refs/heads/dev fedcba",
        ].join("\n"),
      ),
    ).toEqual([
      {
        localRef: "refs/heads/feat/tooling",
        localSha: "abc123",
        remoteRef: "refs/heads/feat/tooling",
        remoteSha: "0000000000000000000000000000000000000000",
      },
      {
        localRef: "refs/heads/dev",
        localSha: "def456",
        remoteRef: "refs/heads/dev",
        remoteSha: "fedcba",
      },
    ]);
  });
});

describe("shouldUseSelectiveCache", () => {
  it("uses the cache for working-tree comparisons", () => {
    expect(
      shouldUseSelectiveCache({
        base: undefined,
        pushRefsFilePath: undefined,
      }),
    ).toBe(true);
  });

  it("disables the cache for outbound push refs", () => {
    expect(
      shouldUseSelectiveCache({
        base: undefined,
        pushRefsFilePath: "C:\\temp\\push-refs.txt",
      }),
    ).toBe(false);
  });

  it("disables the cache for explicit base-ref comparisons", () => {
    expect(
      shouldUseSelectiveCache({
        base: "origin/dev",
        pushRefsFilePath: undefined,
      }),
    ).toBe(false);
  });
});
