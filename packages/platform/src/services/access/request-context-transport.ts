import { Effect } from "effect";

export const subscriberJourneySessionHeaderName = "x-comvestec-session-id";

export const subscriberJourneySessionCookieName = "comvestec_session";

export type SubscriberJourneySessionIdMissingError = {
  readonly _tag: "SubscriberJourneySessionIdMissingError";
};

export type BearerTokenMissingError = {
  readonly _tag: "BearerTokenMissingError";
};

export type AuthenticatedWorkflowExecutionContext = {
  readonly sessionId: string;
  readonly convexAuthToken: string;
};

const subscriberJourneySessionCookieAttributes =
  "Path=/; HttpOnly; SameSite=Lax";

const parseCookieHeader = (cookieHeader: string) =>
  cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");

      return separatorIndex === -1
        ? [entry, ""]
        : [
            entry.slice(0, separatorIndex).trim(),
            entry.slice(separatorIndex + 1).trim(),
          ];
    });

const decodeSessionCookie = (
  sessionCookie: string,
): Effect.Effect<string, never> =>
  Effect.try({
    try: () => decodeURIComponent(sessionCookie),
    catch: () => sessionCookie,
  }).pipe(
    Effect.catchAll((fallbackSessionCookie) =>
      Effect.succeed(fallbackSessionCookie),
    ),
  );

const readSubscriberJourneySessionIdFromHeader = (request: Request) => {
  const headerSessionId = request.headers
    .get(subscriberJourneySessionHeaderName)
    ?.trim();

  return headerSessionId !== undefined && headerSessionId.length > 0
    ? headerSessionId
    : undefined;
};

const failMissingSubscriberJourneySessionId = () =>
  Effect.fail({
    _tag: "SubscriberJourneySessionIdMissingError",
  } satisfies SubscriberJourneySessionIdMissingError);

const requireSubscriberJourneySessionId = (
  sessionIdEffect: Effect.Effect<string | undefined, never>,
) =>
  sessionIdEffect.pipe(
    Effect.flatMap((sessionId) =>
      sessionId === undefined
        ? failMissingSubscriberJourneySessionId()
        : Effect.succeed(sessionId),
    ),
  );

const readSubscriberJourneySessionIdFromCookie = (
  request: Request,
): Effect.Effect<string | undefined, never> => {
  const cookieHeader = request.headers.get("cookie");

  if (cookieHeader === null) {
    return Effect.succeed<string | undefined>(undefined);
  }

  const sessionCookie = parseCookieHeader(cookieHeader).find(
    ([name]) => name === subscriberJourneySessionCookieName,
  )?.[1];

  if (sessionCookie === undefined || sessionCookie.length === 0) {
    return Effect.succeed<string | undefined>(undefined);
  }

  return decodeSessionCookie(sessionCookie);
};

export const extractSubscriberJourneySessionIdFromHeader = (
  request: Request,
): Effect.Effect<string | undefined, never> => {
  const headerSessionId = readSubscriberJourneySessionIdFromHeader(request);

  if (headerSessionId !== undefined) {
    return Effect.succeed<string | undefined>(headerSessionId);
  }

  return Effect.succeed<string | undefined>(undefined);
};

export const extractRequiredSubscriberJourneySessionIdFromHeader = (
  request: Request,
) =>
  requireSubscriberJourneySessionId(
    extractSubscriberJourneySessionIdFromHeader(request),
  );

export const extractSubscriberJourneySessionId = (
  request: Request,
): Effect.Effect<string | undefined, never> => {
  const headerSessionId = readSubscriberJourneySessionIdFromHeader(request);

  if (headerSessionId !== undefined) {
    return Effect.succeed<string | undefined>(headerSessionId);
  }

  return readSubscriberJourneySessionIdFromCookie(request);
};

export const extractRequiredSubscriberJourneySessionId = (request: Request) =>
  requireSubscriberJourneySessionId(extractSubscriberJourneySessionId(request));

export const extractBearerToken = (
  request: Request,
): Effect.Effect<string | undefined, never> => {
  const authorizationHeader = request.headers.get("authorization")?.trim();

  if (authorizationHeader === undefined) {
    return Effect.succeed<string | undefined>(undefined);
  }

  const [scheme, ...tokenSegments] = authorizationHeader.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer") {
    return Effect.succeed<string | undefined>(undefined);
  }

  const token = tokenSegments.join(" ").trim();

  return Effect.succeed<string | undefined>(
    token.length === 0 ? undefined : token,
  );
};

export const extractRequiredBearerToken = (request: Request) =>
  extractBearerToken(request).pipe(
    Effect.flatMap((token) =>
      token === undefined
        ? Effect.fail({
            _tag: "BearerTokenMissingError",
          } satisfies BearerTokenMissingError)
        : Effect.succeed(token),
    ),
  );

export const extractAuthenticatedWorkflowExecutionContext = (
  request: Request,
) =>
  Effect.all({
    sessionId: extractRequiredSubscriberJourneySessionId(request),
    convexAuthToken: extractRequiredBearerToken(request),
  }) as Effect.Effect<
    AuthenticatedWorkflowExecutionContext,
    SubscriberJourneySessionIdMissingError | BearerTokenMissingError
  >;

export const extractAuthenticatedWorkflowExecutionContextFromHeaders = (
  request: Request,
) =>
  Effect.all({
    sessionId: extractRequiredSubscriberJourneySessionIdFromHeader(request),
    convexAuthToken: extractRequiredBearerToken(request),
  }) as Effect.Effect<
    AuthenticatedWorkflowExecutionContext,
    SubscriberJourneySessionIdMissingError | BearerTokenMissingError
  >;

export const buildSubscriberJourneySessionCookieHeader = (
  sessionId: string,
  options?: {
    readonly secure?: boolean;
  },
) =>
  `${subscriberJourneySessionCookieName}=${encodeURIComponent(sessionId)}; ${subscriberJourneySessionCookieAttributes}${options?.secure === true ? "; Secure" : ""}`;

export const buildClearedSubscriberJourneySessionCookieHeader = (options?: {
  readonly secure?: boolean;
}) =>
  `${subscriberJourneySessionCookieName}=; ${subscriberJourneySessionCookieAttributes}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${options?.secure === true ? "; Secure" : ""}`;
