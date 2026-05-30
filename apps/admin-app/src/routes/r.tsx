import { createAdminAppFileRoute } from "../file-route";
import {
  buildCanonicalAdminLegacyHref,
  redirectAdminLegacyHref,
} from "../lib/legacy-admin-route-redirect";

/**
 * `/r` remains a compatibility entrypoint during the Operator Desk
 * `/desk/*` cutover. Real navigation should target `/desk`.
 */
export const Route = createAdminAppFileRoute("/r")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyHref(
      buildCanonicalAdminLegacyHref({
        pathname: location.pathname,
        searchStr: location.searchStr,
        hash: location.hash,
      }),
    ),
  component: LegacyResourceRootRedirectRoute,
});

function LegacyResourceRootRedirectRoute() {
  return null;
}
