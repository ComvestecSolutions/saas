import { Effect } from "effect";

export const subscriberJourneySessionHeaderName = "x-comvestec-session-id";

export const subscriberJourneySessionCookieName = "comvestec_session";

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

export const extractSubscriberJourneySessionId = (
  request: Request,
): Effect.Effect<string | undefined, never> => {
  const headerSessionId = request.headers
    .get(subscriberJourneySessionHeaderName)
    ?.trim();

  if (headerSessionId !== undefined && headerSessionId.length > 0) {
    return Effect.succeed<string | undefined>(headerSessionId);
  }

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

export const buildSubscriberJourneySessionCookieHeader = (
  sessionId: string,
  options?: {
    readonly secure?: boolean;
  },
) =>
  `${subscriberJourneySessionCookieName}=${encodeURIComponent(sessionId)}; ${subscriberJourneySessionCookieAttributes}${options?.secure === true ? "; Secure" : ""}`;
