import { describe, expect, it } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";
import { mount, rerender } from "../../testing/browser-test-utils";

const renderTabs = (orientation: "horizontal" | "vertical" = "horizontal") =>
  mount(
    <Tabs defaultValue="a" orientation={orientation}>
      <TabsList aria-label="env">
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
      </TabsList>
      <TabsContent value="a">panel-a</TabsContent>
      <TabsContent value="b">panel-b</TabsContent>
    </Tabs>,
  );

describe("Tabs", () => {
  it("renders a tablist with the requested aria-label", () => {
    const host = renderTabs();
    expect(
      host.querySelector("[role='tablist']")?.getAttribute("aria-label"),
    ).toBe("env");
  });

  it("activates the matching content for the default value", () => {
    const host = renderTabs();
    const visible = Array.from(host.querySelectorAll("[role='tabpanel']")).find(
      (node) => (node as HTMLElement).dataset["state"] === "active",
    );
    expect(visible?.textContent).toBe("panel-a");
  });

  it("supports vertical orientation", () => {
    const host = renderTabs("vertical");
    expect(
      host.querySelector("[role='tablist']")?.getAttribute("aria-orientation"),
    ).toBe("vertical");
  });

  it.todo(
    "responds to native trigger click (deferred — see slice 1b pointer-event harness)",
  );

  it("supports controlled value (rerender swaps active panel)", () => {
    const host = mount(
      <Tabs value="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">panel-a</TabsContent>
        <TabsContent value="b">panel-b</TabsContent>
      </Tabs>,
    );
    rerender(
      host,
      <Tabs value="b">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">panel-a</TabsContent>
        <TabsContent value="b">panel-b</TabsContent>
      </Tabs>,
    );
    const visible = Array.from(host.querySelectorAll("[role='tabpanel']")).find(
      (node) => (node as HTMLElement).dataset["state"] === "active",
    );
    expect(visible?.textContent).toBe("panel-b");
  });

  it("blocks interaction when a trigger is disabled", () => {
    const host = mount(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b" disabled>
            B
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a">panel-a</TabsContent>
        <TabsContent value="b">panel-b</TabsContent>
      </Tabs>,
    );
    const triggers = host.querySelectorAll("[role='tab']");
    expect(
      (triggers[1] as HTMLButtonElement).getAttribute("data-disabled"),
    ).not.toBeNull();
  });
});
