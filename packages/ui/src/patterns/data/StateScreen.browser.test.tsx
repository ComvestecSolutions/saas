import { describe, expect, it } from "vitest";
import { StateScreen } from "./StateScreen";
import { mount } from "../../testing/browser-test-utils";

describe("StateScreen", () => {
  it("renders the empty variant with the default title", () => {
    const host = mount(<StateScreen variant="empty" />);
    const card = host.querySelector("[data-pattern='state-screen']");
    expect(card?.getAttribute("data-variant")).toBe("empty");
    expect(card?.textContent).toContain("Nothing to show");
  });

  it("renders the loading variant with a status role and live polite announce", () => {
    const host = mount(<StateScreen variant="loading" />);
    const card = host.querySelector(
      "[data-pattern='state-screen']",
    ) as HTMLElement;
    expect(card.getAttribute("role")).toBe("status");
    expect(card.getAttribute("aria-live")).toBe("polite");
  });

  it("renders the denied variant with the alert role and custom description", () => {
    const host = mount(
      <StateScreen variant="denied" description="break-glass grant expired" />,
    );
    const card = host.querySelector(
      "[data-pattern='state-screen']",
    ) as HTMLElement;
    expect(card.getAttribute("role")).toBe("alert");
    expect(card.textContent).toContain("Access denied");
    expect(card.textContent).toContain("break-glass grant expired");
  });

  it("surfaces the correlationId when provided", () => {
    const host = mount(
      <StateScreen variant="5xx" correlationId="corr-12345" />,
    );
    const node = host.querySelector("[data-testid='state-screen-correlation']");
    expect(node?.textContent).toContain("corr-12345");
  });

  it("renders 404 and stale variants with distinct data-variant attrs", () => {
    const host = mount(
      <>
        <StateScreen variant="404" />
        <StateScreen variant="stale" />
      </>,
    );
    expect(host.querySelector("[data-variant='404']")?.textContent).toContain(
      "Resource not found",
    );
    expect(host.querySelector("[data-variant='stale']")?.textContent).toContain(
      "stale",
    );
  });
});
