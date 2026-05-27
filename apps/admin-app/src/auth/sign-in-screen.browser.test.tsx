import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { AdminSignInScreen } from "./sign-in-screen";

describe("admin sign-in screen", () => {
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

  it("renders the governed redirect handoff instead of a local credential form", async () => {
    await act(async () => {
      root.render(
        <AdminSignInScreen reason="stale-session" returnTo="/r/config" />,
      );
    });

    expect(container.textContent).toContain("Comvestec Operations");
    expect(container.textContent).toContain("Sign in to the admin workspace");
    expect(container.textContent).toContain("Session expired");
    expect(container.textContent).toContain(
      "After sign-in, you will be returned to the page you were trying to open.",
    );
    expect(container.textContent).not.toContain("Passphrase");
    expect(container.textContent).not.toContain("Keycloak");
    expect(container.textContent).not.toContain("/r/config");

    const continueLink = container.querySelector(
      'a[href="/auth/start?returnTo=%2Fr%2Fconfig"]',
    );

    expect(continueLink).not.toBeNull();
    expect(continueLink?.textContent).toContain("Continue to sign in");
  });

  it("renders callback-expired recovery copy without exposing backend transport details", async () => {
    await act(async () => {
      root.render(
        <AdminSignInScreen reason="callback-expired" returnTo="/r/access" />,
      );
    });

    expect(container.textContent).toContain("Sign-in window expired");
    expect(container.textContent).toContain(
      "The previous sign-in attempt took too long or sat idle. Start sign-in again to continue.",
    );
    expect(container.textContent).not.toContain("callback state");

    const continueLink = container.querySelector(
      'a[href="/auth/start?returnTo=%2Fr%2Faccess"]',
    );

    expect(continueLink).not.toBeNull();
  });
});
