import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { resolveCurrentSsrRequestContextRequest } from "./ssr-request-context";

export {
  resolveCurrentSsrRequestContextRequest,
  resolveSsrRequestContextRequest,
} from "./ssr-request-context";

/**
 * Wraps a server-function handler so that `context.request` is back-filled
 * from the h3 event store when it is absent during SSR loader execution.
 *
 * This is needed because the TanStack Start Vite plugin cannot recognise
 * server functions declared inside factory functions (the callee root resolves
 * to the factory variable rather than `createServerFn`). The handler therefore
 * runs via the "client" middleware path where the server-only middleware that
 * normally injects `context.request` is never invoked.
 */
const withSsrRequestFallback =
  <TData, TContext, TResult>(
    handler: (input: ServerHandlerInput<TData, TContext>) => Promise<TResult>,
  ) =>
  (input: ServerHandlerInput<TData, TContext>): Promise<TResult> => {
    const ctx = (input.context ?? {}) as Record<string, unknown>;
    const contextRequest =
      ctx["request"] instanceof Request ? ctx["request"] : undefined;
    const fallbackRequest =
      resolveCurrentSsrRequestContextRequest(contextRequest);

    if (fallbackRequest != null && fallbackRequest !== ctx["request"]) {
      return handler({
        ...input,
        context: { ...ctx, request: fallbackRequest } as unknown as TContext,
      });
    }
    return handler(input);
  };

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
        ) =>
          serverFnChain.handler(
            withSsrRequestFallback(handler) as any,
          ) as ServerFetcher<TResult>,
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
                withSsrRequestFallback(handler) as any,
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
