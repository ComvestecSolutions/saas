import { spawnSync } from "child_process";

const runSupportOperationsQueryBoundaryProbe = () => {
  const proc = spawnSync(
    "bun",
    [
      "-e",
      `import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { platformModuleId, platformScope } from '@comvestec/contracts';
import { buildRepairGapWorkflowJobsPredicate } from './packages/modules/src/persistence/postgres/domains/workflow-jobs-queryable.ts';
import { buildSupportOperationsCaseListPredicate } from './packages/platform/src/services/governance/support-operations.ts';

const bunPackageStore = join(process.cwd(), 'node_modules', '.bun');
const drizzlePackageDir = readdirSync(bunPackageStore).find((entry) =>
  entry.startsWith('drizzle-orm@'),
);

if (drizzlePackageDir === undefined) {
  throw new Error('Could not resolve the installed drizzle-orm package from the Bun package store.');
}

const { PgDialect } = await import(
  pathToFileURL(
    join(
      bunPackageStore,
      drizzlePackageDir,
      'node_modules',
      'drizzle-orm',
      'pg-core',
      'dialect.js',
    ),
  ).href,
);

const dialect = new PgDialect();
const supportCaseQuery = dialect.sqlToQuery(
  buildSupportOperationsCaseListPredicate({
    tenantScope: platformScope.organization,
    tenantScopeId: 'org_1',
  }),
);
const repairGapQuery = dialect.sqlToQuery(
  buildRepairGapWorkflowJobsPredicate({
    sourceModuleId: platformModuleId.billingAndMetering,
    tenantScope: platformScope.organization,
    tenantScopeId: 'org_1',
  }),
);

console.log(
  JSON.stringify({
    supportCaseSql: supportCaseQuery.sql,
    supportCaseParams: supportCaseQuery.params,
    repairGapSql: repairGapQuery.sql,
    repairGapParams: repairGapQuery.params,
  }),
);`,
    ],
    {
      cwd: process.cwd(),
    },
  );

  if (proc.status !== 0) {
    throw new Error(
      `Bun runtime probe failed:\n${(proc.stderr ?? "").toString()}`,
    );
  }

  return JSON.parse((proc.stdout ?? "").toString()) as {
    readonly supportCaseSql: string;
    readonly supportCaseParams: readonly unknown[];
    readonly repairGapSql: string;
    readonly repairGapParams: readonly unknown[];
  };
};

describe("platform support-operations query boundary", () => {
  it("renders tenant filters into the concrete support-case and repair-gap SQL predicates", () => {
    const probe = runSupportOperationsQueryBoundaryProbe();

    expect(probe.supportCaseSql).toContain(
      '"support_operations_cases"."tenant_scope"',
    );
    expect(probe.supportCaseSql).toContain(
      '"support_operations_cases"."tenant_scope_id"',
    );
    expect(probe.supportCaseParams).toEqual(
      expect.arrayContaining(["organization", "org_1"]),
    );
    expect(probe.repairGapSql).toContain('"workflow_jobs"."tenant_scope"');
    expect(probe.repairGapSql).toContain('"workflow_jobs"."tenant_scope_id"');
    expect(probe.repairGapParams).toEqual(
      expect.arrayContaining(["billing-and-metering", "organization", "org_1"]),
    );
  }, 30_000);
});
