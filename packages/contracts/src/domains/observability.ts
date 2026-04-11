import { Schema } from "effect";

const TelemetryKindConstantSchema = Schema.Struct({
  log: Schema.Literal("log"),
  metric: Schema.Literal("metric"),
  trace: Schema.Literal("trace"),
  audit: Schema.Literal("audit"),
  businessEvent: Schema.Literal("business-event"),
});

export const telemetryKind = Schema.validateSync(TelemetryKindConstantSchema)({
  log: "log",
  metric: "metric",
  trace: "trace",
  audit: "audit",
  businessEvent: "business-event",
} satisfies Schema.Schema.Type<typeof TelemetryKindConstantSchema>);

export const telemetryKinds = [
  telemetryKind.log,
  telemetryKind.metric,
  telemetryKind.trace,
  telemetryKind.audit,
  telemetryKind.businessEvent,
] as const;

export const TelemetryKindSchema = Schema.Literal(...telemetryKinds);

export type TelemetryKind = Schema.Schema.Type<typeof TelemetryKindSchema>;
