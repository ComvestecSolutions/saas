import { Effect } from "effect";

export const loadRuntimeModule = <Module, E>(input: {
  readonly load: () => Promise<Module>;
  readonly mapError: (cause: unknown) => E;
}) =>
  Effect.tryPromise({
    try: input.load,
    catch: input.mapError,
  });

export const loadRuntimeModuleOrDie = <Module>(load: () => Promise<Module>) =>
  loadRuntimeModule({
    load,
    mapError: (cause) => cause,
  }).pipe(Effect.orDie);
