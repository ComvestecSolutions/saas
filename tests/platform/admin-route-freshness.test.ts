import { createAdminAppFileRoute } from "../../apps/admin-app/src/file-route";
import { Route as AdminRootRoute } from "../../apps/admin-app/src/routes/__root";

describe("admin route freshness", () => {
  it("forces admin file routes to reload trusted route data", () => {
    const deskRoute = createAdminAppFileRoute("/desk")({
      component: () => null,
    });

    expect(deskRoute.options.shouldReload).toBe(true);
  });

  it("enforces shouldReload even when the caller explicitly passes false", () => {
    const route = createAdminAppFileRoute("/desk")({
      // A callsite that copies a non-admin pattern and sets shouldReload: false
      // must still be overridden — the wrapper is an invariant, not a default.
      shouldReload: false,
      component: () => null,
    });

    expect(route.options.shouldReload).toBe(true);
  });

  it("forces the root admin shell route to reload trusted route data", () => {
    expect(AdminRootRoute.options.shouldReload).toBe(true);
  });
});
