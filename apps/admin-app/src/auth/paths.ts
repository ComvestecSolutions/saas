import { Schema } from "effect";
import { FirstPartyAppPostAuthRedirectPathSchema } from "@comvestec/contracts";
import { buildCanonicalAdminLegacyHref } from "../lib/legacy-admin-route-redirect";

const AdminAuthRoutePathSchema = Schema.Struct({
  signIn: Schema.Literal("/sign-in"),
  legacySignIn: Schema.Literal("/auth/sign-in"),
  start: Schema.Literal("/auth/start"),
  callback: Schema.Literal("/auth/callback"),
  logout: Schema.Literal("/auth/logout"),
  staleSession: Schema.Literal("/auth/stale-session"),
});

export const adminAuthRoutePath = Schema.validateSync(AdminAuthRoutePathSchema)(
  {
    signIn: "/sign-in",
    legacySignIn: "/auth/sign-in",
    start: "/auth/start",
    callback: "/auth/callback",
    logout: "/auth/logout",
    staleSession: "/auth/stale-session",
  },
);

const AdminAuthSignInReasonSchema = Schema.Literal(
  "stale-session",
  "signed-out",
  "callback-expired",
  "restart-sign-in",
  "access-denied",
  "sign-in-unavailable",
);

export type AdminAuthSignInReason = Schema.Schema.Type<
  typeof AdminAuthSignInReasonSchema
>;

const isAdminAuthSignInReason = Schema.is(AdminAuthSignInReasonSchema);
const isFirstPartyAppPostAuthRedirectPath = Schema.is(
  FirstPartyAppPostAuthRedirectPathSchema,
);

const canonicalizeAdminAuthReturnTo = (value: string) => {
  const returnToUrl = new URL(value, "https://admin.internal");

  return buildCanonicalAdminLegacyHref({
    pathname: returnToUrl.pathname,
    searchStr: returnToUrl.search,
    hash: returnToUrl.hash,
  });
};

const adminAuthRoutePaths = [
  adminAuthRoutePath.signIn,
  adminAuthRoutePath.legacySignIn,
  adminAuthRoutePath.start,
  adminAuthRoutePath.callback,
  adminAuthRoutePath.logout,
  adminAuthRoutePath.staleSession,
] as const;

export const isAdminAuthRoutePath = (pathname: string) =>
  adminAuthRoutePaths.some((path) => path === pathname);

export const sanitizeAdminAuthReturnTo = (value: string | null | undefined) => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (!isFirstPartyAppPostAuthRedirectPath(value)) {
    return undefined;
  }

  const canonicalReturnTo = canonicalizeAdminAuthReturnTo(value);
  return isFirstPartyAppPostAuthRedirectPath(canonicalReturnTo)
    ? canonicalReturnTo
    : undefined;
};

export const sanitizeAdminAuthSignInReason = (
  value: string | null | undefined,
) => {
  if (value === null || value === undefined) {
    return undefined;
  }

  return isAdminAuthSignInReason(value) ? value : undefined;
};

type BuildAdminAuthRoutePathInput = {
  readonly returnTo?: string;
  readonly reason?: AdminAuthSignInReason;
};

type AdminAuthLocation = {
  readonly pathname: string;
  readonly searchStr: string;
};

export const buildAdminAuthReturnTo = ({
  pathname,
  searchStr,
}: Readonly<AdminAuthLocation>) =>
  buildCanonicalAdminLegacyHref({ pathname, searchStr });

export const buildAdminSignInPath = (
  input: BuildAdminAuthRoutePathInput = {},
) => {
  const search = new URLSearchParams();
  const returnTo = sanitizeAdminAuthReturnTo(input.returnTo);

  if (returnTo !== undefined) {
    search.set("returnTo", returnTo);
  }

  if (input.reason !== undefined) {
    search.set("reason", input.reason);
  }

  const query = search.toString();
  return query.length === 0
    ? adminAuthRoutePath.signIn
    : `${adminAuthRoutePath.signIn}?${query}`;
};

export const buildAdminAuthStartPath = (
  input: Pick<BuildAdminAuthRoutePathInput, "returnTo"> = {},
) => {
  const returnTo = sanitizeAdminAuthReturnTo(input.returnTo);

  if (returnTo === undefined) {
    return adminAuthRoutePath.start;
  }

  const search = new URLSearchParams({
    returnTo,
  });

  return `${adminAuthRoutePath.start}?${search.toString()}`;
};

export const buildAdminStaleSessionPath = (
  input: Pick<BuildAdminAuthRoutePathInput, "returnTo"> = {},
) => {
  const returnTo = sanitizeAdminAuthReturnTo(input.returnTo);

  if (returnTo === undefined) {
    return adminAuthRoutePath.staleSession;
  }

  const search = new URLSearchParams({
    returnTo,
  });

  return `${adminAuthRoutePath.staleSession}?${search.toString()}`;
};

export const parseAdminAuthSearch = (search: string) => {
  const parameters = new URLSearchParams(search);

  return {
    returnTo: sanitizeAdminAuthReturnTo(parameters.get("returnTo")),
    reason: sanitizeAdminAuthSignInReason(parameters.get("reason")),
  } as const;
};
