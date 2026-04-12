import { Schema } from "effect";

const UsageQuotaPeriodConstantSchema = Schema.Struct({
  minute: Schema.Literal("minute"),
  hour: Schema.Literal("hour"),
  day: Schema.Literal("day"),
  month: Schema.Literal("month"),
});

export const usageQuotaPeriod = Schema.validateSync(
  UsageQuotaPeriodConstantSchema,
)({
  minute: "minute",
  hour: "hour",
  day: "day",
  month: "month",
} satisfies Schema.Schema.Type<typeof UsageQuotaPeriodConstantSchema>);

export const usageQuotaPeriods = [
  usageQuotaPeriod.minute,
  usageQuotaPeriod.hour,
  usageQuotaPeriod.day,
  usageQuotaPeriod.month,
] as const;

export const UsageQuotaPeriodSchema = Schema.Literal(...usageQuotaPeriods);

export type UsageQuotaPeriod = Schema.Schema.Type<
  typeof UsageQuotaPeriodSchema
>;
