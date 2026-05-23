import {
  selectAffectedTypecheckSuites,
  shouldSkipTypecheckSuite,
  typecheckSuiteId,
} from "../../tooling/scripts/validation/run-selective-typecheck";

describe("selectAffectedTypecheckSuites", () => {
  it("routes admin app browser-harness changes to coverage, workspace, and tests typecheck", () => {
    expect(
      selectAffectedTypecheckSuites([
        "apps/admin-app/src/testing/admin-browser-fixtures.ts",
      ]).map((suite) => suite.id),
    ).toEqual([
      typecheckSuiteId.coverage,
      typecheckSuiteId.workspace,
      typecheckSuiteId.tests,
    ]);
  });

  it("routes tooling changes to coverage, tooling, and tests typecheck", () => {
    expect(
      selectAffectedTypecheckSuites([
        "tooling/scripts/tests/run-selective-tests.ts",
      ]).map((suite) => suite.id),
    ).toEqual([
      typecheckSuiteId.coverage,
      typecheckSuiteId.tooling,
      typecheckSuiteId.tests,
    ]);
  });

  it("routes convex changes to coverage, convex, and tests typecheck", () => {
    expect(
      selectAffectedTypecheckSuites(["convex/http.ts"]).map(
        (suite) => suite.id,
      ),
    ).toEqual([
      typecheckSuiteId.coverage,
      typecheckSuiteId.convex,
      typecheckSuiteId.tests,
    ]);
  });

  it("skips docs-only changes", () => {
    expect(selectAffectedTypecheckSuites(["README.md"])).toEqual([]);
  });

  it("fans root dependency changes out to every typecheck suite", () => {
    expect(
      selectAffectedTypecheckSuites(["bun.lock"]).map((suite) => suite.id),
    ).toEqual([
      typecheckSuiteId.coverage,
      typecheckSuiteId.workspace,
      typecheckSuiteId.convex,
      typecheckSuiteId.tooling,
      typecheckSuiteId.tests,
    ]);
  });

  it("fans base tsconfig changes out to every dependent typecheck suite", () => {
    expect(
      selectAffectedTypecheckSuites(["tsconfig.base.json"]).map(
        (suite) => suite.id,
      ),
    ).toEqual([
      typecheckSuiteId.coverage,
      typecheckSuiteId.workspace,
      typecheckSuiteId.convex,
      typecheckSuiteId.tooling,
      typecheckSuiteId.tests,
    ]);
  });

  it("routes vitest config changes to tooling typecheck", () => {
    expect(
      selectAffectedTypecheckSuites(["vitest.config.ts"]).map(
        (suite) => suite.id,
      ),
    ).toEqual([typecheckSuiteId.tooling]);
  });
});

describe("shouldSkipTypecheckSuite", () => {
  it("skips a suite when the cached fingerprint still matches", () => {
    expect(
      shouldSkipTypecheckSuite({
        force: false,
        cachedFingerprint: "same",
        currentFingerprint: "same",
      }),
    ).toBe(true);
  });

  it("reruns a suite when force is enabled", () => {
    expect(
      shouldSkipTypecheckSuite({
        force: true,
        cachedFingerprint: "same",
        currentFingerprint: "same",
      }),
    ).toBe(false);
  });
});
