import { actorType } from "@comvestec/contracts";
import type { RequestContext } from "@comvestec/contracts";

export const actorSupportsPrivilegedSupportEscalation = (
  actor: RequestContext["actorType"],
) =>
  actor === actorType.supportOperator || actor === actorType.platformOperator;

const isFutureTimestamp = (timestamp: string, now: number) => {
  const parsedTimestamp = new Date(timestamp).getTime();

  return Number.isFinite(parsedTimestamp) && parsedTimestamp > now;
};

const hasNonEmptyBreakGlassReason = (requestContext: RequestContext) => {
  const reason = requestContext.breakGlass?.reason ?? requestContext.reason;

  return reason !== undefined && reason.trim().length > 0;
};

export const isFutureBreakGlassExpiry = (expiresAt: string, now = Date.now()) =>
  isFutureTimestamp(expiresAt, now);

export const hasValidBreakGlassContext = (
  requestContext: RequestContext,
  now = Date.now(),
) =>
  requestContext.breakGlass !== undefined &&
  hasNonEmptyBreakGlassReason(requestContext) &&
  isFutureTimestamp(requestContext.breakGlass.expiresAt, now);

export const hasPrivilegedBreakGlassAccess = (
  requestContext: RequestContext,
  now = Date.now(),
) =>
  actorSupportsPrivilegedSupportEscalation(requestContext.actorType) &&
  hasValidBreakGlassContext(requestContext, now);
