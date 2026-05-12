import { Schema } from "effect";
import { PlatformScopeSchema } from "../access/platform-scopes";
import { IsoTimestampSchema } from "./timestamps";

export const supportOperationsCaseStatus = {
  open: "open",
  escalated: "escalated",
  resolved: "resolved",
} as const;

export const SupportOperationsCaseStatusSchema = Schema.Literal(
  supportOperationsCaseStatus.open,
  supportOperationsCaseStatus.escalated,
  supportOperationsCaseStatus.resolved,
);

export type SupportOperationsCaseStatus = Schema.Schema.Type<
  typeof SupportOperationsCaseStatusSchema
>;

export const supportOperationsCasePriority = {
  low: "low",
  normal: "normal",
  high: "high",
} as const;

export const SupportOperationsCasePrioritySchema = Schema.Literal(
  supportOperationsCasePriority.low,
  supportOperationsCasePriority.normal,
  supportOperationsCasePriority.high,
);

export type SupportOperationsCasePriority = Schema.Schema.Type<
  typeof SupportOperationsCasePrioritySchema
>;

export const SupportOperationsCaseSupportViewSchema = Schema.Struct({
  caseId: Schema.NonEmptyString,
  supportAgent: Schema.NonEmptyString,
  tenantScope: PlatformScopeSchema,
  tenantScopeId: Schema.NonEmptyString,
  summary: Schema.NonEmptyString,
  status: SupportOperationsCaseStatusSchema,
  priority: SupportOperationsCasePrioritySchema,
  startedAt: IsoTimestampSchema,
  lastUpdatedAt: IsoTimestampSchema,
});

export type SupportOperationsCaseSupportView = Schema.Schema.Type<
  typeof SupportOperationsCaseSupportViewSchema
>;

export const SupportOperationsCaseSupportViewListSchema = Schema.Array(
  SupportOperationsCaseSupportViewSchema,
);
