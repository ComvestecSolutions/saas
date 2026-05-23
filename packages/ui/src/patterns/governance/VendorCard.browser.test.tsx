import { describe, expect, it, vi } from "vitest";
import { VendorCard } from "./VendorCard";
import { click, mount } from "../../testing/browser-test-utils";

describe("VendorCard", () => {
  it("renders the service name with the requested tone data-attr", () => {
    const host = mount(
      <VendorCard service="Keycloak" tone="nominal" statusLabel="healthy" />,
    );
    const card = host.querySelector("[data-pattern='vendor-card']");
    expect(card?.getAttribute("data-tone")).toBe("nominal");
    expect(card?.textContent).toContain("Keycloak");
    expect(card?.textContent).toContain("healthy");
  });

  it("renders version and latency when supplied", () => {
    const host = mount(
      <VendorCard
        service="OpenMeter"
        tone="pending"
        version="v0.32.1"
        latencyMs={142}
      />,
    );
    expect(
      host.querySelector("[data-testid='vendor-card-version']")?.textContent,
    ).toContain("v0.32.1");
    expect(
      host.querySelector("[data-testid='vendor-card-latency']")?.textContent,
    ).toContain("142");
  });

  it("renders the governed deep-link with a real href", () => {
    const host = mount(
      <VendorCard
        service="Polar"
        tone="error"
        deepLink={{ href: "https://polar.example/dashboard", label: "Polar" }}
      />,
    );
    const link = host.querySelector(
      "[data-testid='vendor-card-deep-link']",
    ) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://polar.example/dashboard");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("invokes onOpenDetail when the open button is clicked", () => {
    const onOpenDetail = vi.fn();
    const host = mount(
      <VendorCard service="Novu" tone="drift" onOpenDetail={onOpenDetail} />,
    );
    const button = host.querySelector(
      "[data-testid='vendor-card-open']",
    ) as HTMLButtonElement;
    click(button);
    expect(onOpenDetail).toHaveBeenCalled();
  });
});
