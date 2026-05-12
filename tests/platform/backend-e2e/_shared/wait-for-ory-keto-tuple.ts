import { Effect } from "effect";
import type { OryKetoAdapterService, OryKetoTuple } from "@comvestec/platform";

export const waitForOryKetoTuple = async (input: {
  readonly oryKeto: OryKetoAdapterService;
  readonly tuple: OryKetoTuple;
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}) => {
  const timeoutMs = input.timeoutMs ?? 10_000;
  const intervalMs = input.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const check = await Effect.runPromiseExit(input.oryKeto.check(input.tuple));

    if (check._tag === "Success" && check.value.allowed) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  throw new Error(
    `Timed out waiting for Ory Keto tuple ${input.tuple.namespace}:${input.tuple.object}#${input.tuple.relation}@${input.tuple.subject}.`,
  );
};
