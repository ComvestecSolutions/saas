import { Schema } from "effect";

const OnboardingStepStatusConstantSchema = Schema.Struct({
  notStarted: Schema.Literal("not-started"),
  inProgress: Schema.Literal("in-progress"),
  completed: Schema.Literal("completed"),
});

export const onboardingStepStatus = Schema.validateSync(
  OnboardingStepStatusConstantSchema,
)({
  notStarted: "not-started",
  inProgress: "in-progress",
  completed: "completed",
} satisfies Schema.Schema.Type<typeof OnboardingStepStatusConstantSchema>);

export const onboardingStepStatuses = [
  onboardingStepStatus.notStarted,
  onboardingStepStatus.inProgress,
  onboardingStepStatus.completed,
] as const;

export const OnboardingStepStatusSchema = Schema.Literal(
  ...onboardingStepStatuses,
);

export type OnboardingStepStatus = Schema.Schema.Type<
  typeof OnboardingStepStatusSchema
>;
