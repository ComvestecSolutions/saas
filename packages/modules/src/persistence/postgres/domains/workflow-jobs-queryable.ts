import { and, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import { type PlatformModuleId, workflowJobStatus } from "@comvestec/contracts";
import { workflowJobsRunningClaimTimeoutSeconds } from "@comvestec/config";
import { type WorkflowJobRecordBase } from "../../../domains/workflow-jobs";
import type { PostgresDatabase } from "../database";
import { type WorkflowJobsPostgresQueryableForRecord } from "./workflow-jobs-repository";
import { workflowJobsTable } from "./workflow-jobs";

type WorkflowJobRecordWithPayload = WorkflowJobRecordBase & {
  readonly payload: unknown;
};

const subtractWorkflowClaimTimeout = (value: Date) =>
  new Date(value.getTime() - workflowJobsRunningClaimTimeoutSeconds * 1_000);

export const buildRepairGapWorkflowJobsPredicate = (
  input: Parameters<
    WorkflowJobsPostgresQueryableForRecord<WorkflowJobRecordWithPayload>["listRepairGapWorkflowJobs"]
  >[0],
) =>
  and(
    eq(workflowJobsTable.sourceModuleId, input.sourceModuleId),
    ...(input.tenantScope === undefined
      ? []
      : [eq(workflowJobsTable.tenantScope, input.tenantScope)]),
    ...(input.tenantScopeId === undefined
      ? []
      : [eq(workflowJobsTable.tenantScopeId, input.tenantScopeId)]),
    or(
      and(
        isNotNull(workflowJobsTable.gapReason),
        or(
          eq(workflowJobsTable.status, workflowJobStatus.scheduled),
          eq(workflowJobsTable.status, workflowJobStatus.blocked),
        ),
      ),
      and(
        eq(workflowJobsTable.status, workflowJobStatus.running),
        lte(
          workflowJobsTable.updatedAt,
          subtractWorkflowClaimTimeout(new Date()),
        ),
      ),
    ),
  );

export const buildRepairGapWorkflowJobsListQuery = (
  database: PostgresDatabase,
  input: Parameters<
    WorkflowJobsPostgresQueryableForRecord<WorkflowJobRecordWithPayload>["listRepairGapWorkflowJobs"]
  >[0],
) =>
  database
    .select()
    .from(workflowJobsTable)
    .where(buildRepairGapWorkflowJobsPredicate(input));

export const buildWorkflowJobsPostgresQueryable = <
  TWorkflowJobRecord extends WorkflowJobRecordWithPayload,
>(
  database: PostgresDatabase,
): WorkflowJobsPostgresQueryableForRecord<TWorkflowJobRecord> => ({
  getWorkflowJobById: async (jobId) => {
    const rows = await database
      .select()
      .from(workflowJobsTable)
      .where(eq(workflowJobsTable.jobId, jobId));

    return rows[0];
  },
  claimScheduledWorkflowJob: async (jobId, now) => {
    const staleRunningBefore = subtractWorkflowClaimTimeout(now);
    const rows = await database
      .update(workflowJobsTable)
      .set({
        status: workflowJobStatus.running,
        attempts: sql`${workflowJobsTable.attempts} + 1`,
        completedAt: null,
        gapReason: null,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(workflowJobsTable.jobId, jobId),
          or(
            and(
              eq(workflowJobsTable.status, workflowJobStatus.scheduled),
              lte(workflowJobsTable.scheduledAt, now),
            ),
            and(
              eq(workflowJobsTable.status, workflowJobStatus.running),
              lte(workflowJobsTable.updatedAt, staleRunningBefore),
            ),
          ),
        ),
      )
      .returning();

    return rows[0];
  },
  restoreWorkflowJobIfUpdatedAtMatches: async (
    jobId,
    expectedUpdatedAt,
    record,
  ) => {
    const rows = await database
      .update(workflowJobsTable)
      .set({
        runtime: record.runtime,
        sourceModuleId: record.sourceModuleId,
        kind: record.kind,
        trigger: record.trigger,
        status: record.status,
        tenantScope: record.tenantScope,
        tenantScopeId: record.tenantScopeId,
        attempts: record.attempts,
        scheduledAt: new Date(record.scheduledAt),
        completedAt:
          record.completedAt === undefined
            ? null
            : new Date(record.completedAt),
        lastError: record.lastError ?? null,
        gapReason: record.gapReason ?? null,
        payload: record.payload,
        updatedAt: new Date(record.updatedAt),
      })
      .where(
        and(
          eq(workflowJobsTable.jobId, jobId),
          eq(workflowJobsTable.status, workflowJobStatus.scheduled),
          eq(workflowJobsTable.updatedAt, expectedUpdatedAt),
        ),
      )
      .returning();

    return rows[0];
  },
  cancelWorkflowJobIfUpdatedAtMatches: async (
    jobId,
    expectedUpdatedAt,
    canceledAt,
  ) => {
    const rows = await database
      .update(workflowJobsTable)
      .set({
        status: workflowJobStatus.canceled,
        completedAt: canceledAt,
        updatedAt: canceledAt,
      })
      .where(
        and(
          eq(workflowJobsTable.jobId, jobId),
          eq(workflowJobsTable.updatedAt, expectedUpdatedAt),
        ),
      )
      .returning();

    return rows[0];
  },
  listDueWorkflowJobs: async (sourceModuleId, scheduledBefore) => {
    const rows = await database
      .select()
      .from(workflowJobsTable)
      .where(
        and(
          eq(workflowJobsTable.sourceModuleId, sourceModuleId),
          or(
            and(
              eq(workflowJobsTable.status, workflowJobStatus.scheduled),
              lte(workflowJobsTable.scheduledAt, scheduledBefore),
            ),
            and(
              eq(workflowJobsTable.status, workflowJobStatus.running),
              lte(
                workflowJobsTable.updatedAt,
                subtractWorkflowClaimTimeout(scheduledBefore),
              ),
            ),
          ),
        ),
      );

    return [...rows].sort(
      (left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime(),
    );
  },
  listRepairGapWorkflowJobs: async (input) => {
    const rows = await buildRepairGapWorkflowJobsListQuery(database, input);

    return [...rows].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
    );
  },
});
