import { Outlet } from "@tanstack/react-router";
import { createAdminAppFileRoute } from "../file-route";
import {
  buildCanonicalAdminLegacyHref,
  redirectAdminLegacyHref,
} from "../lib/legacy-admin-route-redirect";

export const Route = createAdminAppFileRoute("/branding")({
  beforeLoad: ({ location }) =>
    redirectAdminLegacyHref(buildCanonicalAdminLegacyHref(location)),
  component: LegacyBrandingRoute,
});

function LegacyBrandingRoute() {
  return <Outlet />;
}
