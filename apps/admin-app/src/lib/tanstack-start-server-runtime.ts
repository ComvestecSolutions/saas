import { createMiddleware, createServerFn } from "@tanstack/react-start";

type ServerMiddlewareInput = {
  readonly request: Request;
  readonly next: (options?: { readonly context?: unknown }) => Promise<unknown>;
};

type ServerMiddlewareInputHandler = (
  input: ServerMiddlewareInput,
) => Promise<unknown>;

type ServerMiddleware = unknown;

type ServerHandlerInput<TData = unknown, TContext = unknown> = {
  readonly context: TContext;
  readonly data: TData;
  readonly method: string;
  readonly serverFnMeta: unknown;
};

type ServerFetcher<TResult> = ((...args: any[]) => Promise<TResult>) & {
  __executeServer: (input: {
    readonly data: unknown;
    readonly headers?: HeadersInit;
    readonly context?: unknown;
    readonly method?: string;
  }) => Promise<TResult>;
};

type ServerFnChain = {
  handler: <TContext = unknown, TResult = unknown>(
    handler: (input: ServerHandlerInput<unknown, TContext>) => Promise<TResult>,
  ) => ServerFetcher<TResult>;
  inputValidator: <TInput, TOutput = TInput>(
    validator: (input: TInput) => TOutput,
  ) => {
    handler: <TContext = unknown, TResult = unknown>(
      handler: (
        input: ServerHandlerInput<TOutput, TContext>,
      ) => Promise<TResult>,
    ) => ServerFetcher<TResult>;
  };
};

export type TanstackStartServerRuntime = {
  createMiddleware: () => {
    server: (handler: ServerMiddlewareInputHandler) => ServerMiddleware;
  };
  createServerFn: (options?: { readonly method?: "GET" | "POST" }) => {
    middleware: (middlewares: ReadonlyArray<ServerMiddleware>) => ServerFnChain;
  };
};

const createTanstackStartMiddlewareRuntime = () => {
  const middlewareBuilder = createMiddleware();

  return {
    server: (handler: ServerMiddlewareInputHandler) =>
      middlewareBuilder.server(
        (options) =>
          handler({
            request: options.request,
            next: async (nextOptions = {}) =>
              Promise.resolve(options.next(nextOptions)),
          }) as any,
      ) as ServerMiddleware,
  };
};

const createTanstackStartServerFnRuntime = (options?: {
  readonly method?: "GET" | "POST";
}) => {
  const serverFnBuilder = createServerFn(options);

  return {
    middleware: (
      middlewares: ReadonlyArray<ServerMiddleware>,
    ): ServerFnChain => {
      const serverFnChain = serverFnBuilder.middleware(middlewares as any);

      return {
        handler: <TContext = unknown, TResult = unknown>(
          handler: (
            input: ServerHandlerInput<unknown, TContext>,
          ) => Promise<TResult>,
        ) => serverFnChain.handler(handler as any) as ServerFetcher<TResult>,
        inputValidator: <TInput, TOutput = TInput>(
          validator: (input: TInput) => TOutput,
        ) => {
          const validatedServerFnChain = serverFnChain.inputValidator(
            validator as any,
          );

          return {
            handler: <TContext = unknown, TResult = unknown>(
              handler: (
                input: ServerHandlerInput<TOutput, TContext>,
              ) => Promise<TResult>,
            ) =>
              validatedServerFnChain.handler(
                handler as any,
              ) as ServerFetcher<TResult>,
          };
        },
      };
    },
  };
};

export const tanstackStartServerRuntime: TanstackStartServerRuntime = {
  createMiddleware: createTanstackStartMiddlewareRuntime,
  createServerFn: createTanstackStartServerFnRuntime,
};
