import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { adminRoutePath } from "@comvestec/contracts";
import { buildAdminAuthReturnTo } from "../auth/paths";

const mockedLocation = vi.hoisted(() => ({
  pathname: "/tenants/acme",
  searchStr: "?tab=members&view=audit",
  search: {
    tab: "members",
    view: "audit",
    [Symbol.toPrimitive]: () => {
      throw new TypeError("location.search should not be stringified");
    },
  },
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );

  return {
    ...actual,
    useRouterState: ({
      select,
    }: {
      readonly select?: (state: {
        readonly location: typeof mockedLocation;
      }) => unknown;
    } = {}) =>
      select === undefined
        ? { location: mockedLocation }
        : select({ location: mockedLocation }),
  };
});

import { AdminSessionRequiredState } from "./admin-session-required-state";

describe("admin session required return path", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("uses the pathname when there is no search string", () => {
    expect(
      buildAdminAuthReturnTo({
        pathname: "/governance/runtime-config",
        searchStr: "",
      }),
    ).toBe(adminRoutePath.runtimeConfig);
  });

  it("preserves the search string when rebuilding the return path", () => {
    expect(
      buildAdminAuthReturnTo({
        pathname: "/tenants/acme",
        searchStr: "?tab=members&view=audit",
      }),
    ).toBe("/tenants/acme?tab=members&view=audit");
  });

  it("renders a sign-in link without coercing the parsed search object", async () => {
    await act(async () => {
      root.render(
        createElement(AdminSessionRequiredState, {
          title: "Operator session required",
          description: "Sign in to continue.",
        }),
      );
    });

    const continueLink = container.querySelector(
      'a[href="/sign-in?returnTo=%2Ftenants%2Facme%3Ftab%3Dmembers%26view%3Daudit"]',
    );

    expect(continueLink).not.toBeNull();
    expect(continueLink?.textContent).toContain("Sign in to continue");
  });

  it("routes stale sessions through the recovery endpoint before sign-in", async () => {
    await act(async () => {
      root.render(
        createElement(AdminSessionRequiredState, {
          title: "Session refresh required",
          description: "Sign in again to continue.",
          stale: true,
        }),
      );
    });

    const continueLink = container.querySelector(
      'a[href="/auth/stale-session?returnTo=%2Ftenants%2Facme%3Ftab%3Dmembers%26view%3Daudit"]',
    );

    expect(continueLink).not.toBeNull();
    expect(continueLink?.textContent).toContain("Refresh operator session");
  });
});
