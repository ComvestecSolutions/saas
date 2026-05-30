import { createAdminAppFileRoute } from "../../file-route";
import {
  buildCanonicalAdminLegacyHref,
  redirectAdminLegacyHref,
} from "../../lib/legacy-admin-route-redirect";

/**
 * `/r/*` remains a compatibility redirect namespace during the
 * Operator Desk `/desk/*` cutover. Canonical operator URLs should
 * never stay on this legacy prefix.
 */
export const Route = createAdminAppFileRoute("/r/$")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyHref(
      buildCanonicalAdminLegacyHref({
        pathname: location.pathname,
        searchStr: location.searchStr,
        hash: location.hash,
      }),
    ),
  component: LegacyResourceRedirectRoute,
});

function LegacyResourceRedirectRoute() {
  return null;
}
