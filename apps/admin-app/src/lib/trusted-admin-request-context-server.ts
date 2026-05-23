import { Effect } from "effect";
import type { RequestContext } from "@comvestec/contracts";

export const resolveAdminSessionIdFromRequest = async (
  request: Request,
): Promise<string> => {
  const { extractRequiredSubscriberJourneySessionId } =
    await import("@comvestec/platform");

  return Effect.runPromise(extractRequiredSubscriberJourneySessionId(request));
};

export const resolveTrustedAdminRequestContextFromRequest = async (
  request: Request,
  environment: unknown = process.env,
): Promise<RequestContext> => {
  const { resolveTrustedRequestContextFromSessionId } =
    await import("@comvestec/platform");
  const sessionId = await resolveAdminSessionIdFromRequest(request);

  return Effect.runPromise(
    resolveTrustedRequestContextFromSessionId(environment, sessionId),
  );
};

export const buildAdminActionReason = (
  reasonId: string,
  note: string,
): string => {
  const trimmedNote = note.trim();
  return trimmedNote.length === 0 ? reasonId : `${reasonId}: ${trimmedNote}`;
};
