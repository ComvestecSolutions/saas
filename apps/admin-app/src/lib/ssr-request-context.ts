const subscriberJourneySessionCookieName = "comvestec_session";

/**
 * During SSR loader execution, server functions created through the
 * `serverRuntime.createServerFn(...)` factory pattern are not recognised by
 * the TanStack Start Vite plugin (which requires direct `createServerFn` calls
 * at the top level of a module). As a result they execute via the "client"
 * middleware path instead of `__executeServer`, so `context.request` is never
 * populated by the server-only middleware chain.
 *
 * This helper reads the current HTTP request from the h3 event-storage
 * AsyncLocalStorage (set by `requestHandler` in `start-server-core`) as a
 * fallback when `context.request` is absent during server-side execution. It
 * only touches the `Symbol.for` global storage key so it stays safe in browser
 * bundles and simply returns `undefined` outside the server runtime.
 */
const getH3EventStorageRequest = (): Request | undefined => {
  if (typeof window !== "undefined") {
    return undefined;
  }

  try {
    const key = Symbol.for("tanstack-start:event-storage");
    const storage = (
      globalThis as Record<
        symbol,
        | {
            getStore():
              | { readonly h3Event: { readonly req: Request } }
              | undefined;
          }
        | undefined
      >
    )[key];

    return storage?.getStore()?.h3Event?.req;
  } catch {
    return undefined;
  }
};

const hasSubscriberJourneySessionCookie = (request: Request | undefined) => {
  const cookieHeader = request?.headers.get("cookie")?.trim();

  if (cookieHeader === undefined || cookieHeader.length === 0) {
    return false;
  }

  return cookieHeader.split(";").some((entry) => {
    const separatorIndex = entry.indexOf("=");
    const cookieName =
      separatorIndex === -1
        ? entry.trim()
        : entry.slice(0, separatorIndex).trim();

    return cookieName === subscriberJourneySessionCookieName;
  });
};

export const resolveSsrRequestContextRequest = (input: {
  readonly contextRequest?: Request;
  readonly h3EventRequest?: Request;
}) => {
  if (input.contextRequest === undefined) {
    return input.h3EventRequest;
  }

  const contextHasSessionCookie = hasSubscriberJourneySessionCookie(
    input.contextRequest,
  );
  const h3EventHasSessionCookie = hasSubscriberJourneySessionCookie(
    input.h3EventRequest,
  );

  return !contextHasSessionCookie && h3EventHasSessionCookie
    ? input.h3EventRequest
    : input.contextRequest;
};

export const resolveCurrentSsrRequestContextRequest = (
  contextRequest?: Request,
) => {
  const h3EventRequest =
    typeof window === "undefined" ? getH3EventStorageRequest() : undefined;

  return contextRequest !== undefined || h3EventRequest !== undefined
    ? resolveSsrRequestContextRequest({
        ...(contextRequest !== undefined ? { contextRequest } : {}),
        ...(h3EventRequest !== undefined ? { h3EventRequest } : {}),
      })
    : undefined;
};
