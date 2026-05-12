type ServerMiddlewareInput = {
  readonly request: Request;
  readonly next: (options?: { readonly context?: unknown }) => Promise<unknown>;
};

type TestServerMiddleware = {
  readonly serverHandler: (input: ServerMiddlewareInput) => Promise<unknown>;
};

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

export type TanstackStartTestServerRuntime = {
  createMiddleware: () => {
    server: (handler: ServerMiddlewareInputHandler) => ServerMiddleware;
  };
  createServerFn: (options?: { readonly method?: "GET" | "POST" }) => {
    middleware: (middlewares: ReadonlyArray<ServerMiddleware>) => ServerFnChain;
  };
};

type ServerMiddlewareInputHandler = (
  input: ServerMiddlewareInput,
) => Promise<unknown>;

const createServerFetcher = <TData, TContext, TResult>(input: {
  readonly baseUrl: string;
  readonly defaultMethod: "GET" | "POST";
  readonly middlewares: ReadonlyArray<ServerMiddleware>;
  readonly validator?: (input: unknown) => TData;
  readonly handler: (
    input: ServerHandlerInput<TData, TContext>,
  ) => Promise<TResult>;
}): ServerFetcher<TResult> =>
  Object.assign(
    (..._args: any[]) =>
      Promise.reject(
        new Error(
          "Client execution is not supported in the route-boundary test runtime.",
        ),
      ),
    {
      __executeServer: async ({
        data,
        headers,
        context,
        method,
      }: {
        readonly data: unknown;
        readonly headers?: HeadersInit;
        readonly context?: unknown;
        readonly method?: string;
      }) => {
        const resolvedMethod = method ?? input.defaultMethod;
        const request = new Request(input.baseUrl, {
          method: resolvedMethod,
          ...(headers !== undefined ? { headers } : {}),
        });
        let currentContext = context ?? {};
        const validatedData = input.validator
          ? input.validator(data)
          : (data as TData);

        const runMiddleware = async (index: number): Promise<TResult> => {
          const middleware = input.middlewares[index] as
            | TestServerMiddleware
            | undefined;

          if (middleware === undefined) {
            return input.handler({
              context: currentContext as TContext,
              data: validatedData,
              method: resolvedMethod,
              serverFnMeta: { type: "route-boundary-test" },
            });
          }

          return middleware.serverHandler({
            request,
            next: async (options = {}) => {
              currentContext = options.context ?? currentContext;
              return runMiddleware(index + 1);
            },
          }) as Promise<TResult>;
        };

        return runMiddleware(0);
      },
    },
  );

export const createTanstackStartTestServerRuntime = (
  baseUrl: string,
): TanstackStartTestServerRuntime => ({
  createMiddleware: () => ({
    server: (handler) => ({ serverHandler: handler }) as TestServerMiddleware,
  }),
  createServerFn: ({ method = "GET" } = {}) => ({
    middleware: (middlewares) => ({
      handler: <TContext = unknown, TResult = unknown>(
        handler: (
          input: ServerHandlerInput<unknown, TContext>,
        ) => Promise<TResult>,
      ) =>
        createServerFetcher({
          baseUrl,
          defaultMethod: method,
          middlewares,
          handler,
        }),
      inputValidator: (validator) => ({
        handler: <TContext = unknown, TResult = unknown>(
          handler: (
            input: ServerHandlerInput<ReturnType<typeof validator>, TContext>,
          ) => Promise<TResult>,
        ) =>
          createServerFetcher({
            baseUrl,
            defaultMethod: method,
            middlewares,
            validator: validator as (
              input: unknown,
            ) => ReturnType<typeof validator>,
            handler,
          }),
      }),
    }),
  }),
});
