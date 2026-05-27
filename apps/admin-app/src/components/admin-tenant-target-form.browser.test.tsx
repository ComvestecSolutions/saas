import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { platformScope } from "@comvestec/contracts";
import { buildAdminTenantTargetOptions } from "../lib/admin-tenant-target-options";
import { AdminTenantTargetForm } from "./admin-tenant-target-form";

describe("admin tenant target form", () => {
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

  it("waits for explicit submit and submits a named tenant suggestion", async () => {
    const onSubmit = vi.fn();
    const targetOptions = buildAdminTenantTargetOptions([
      {
        displayName: "Acme Co.",
        target: {
          scope: platformScope.organization,
          scopeId: "org_demo",
        },
        environment: "production",
        status: "active",
        approvalsOpen: 0,
      },
    ]);

    await act(async () => {
      root.render(
        <AdminTenantTargetForm
          initialScope={platformScope.organization}
          submitLabel="Open workspace"
          targetOptions={targetOptions}
          onSubmit={onSubmit}
        />,
      );
    });

    const targetButton = container.querySelector<HTMLButtonElement>(
      '[data-target-option="organization:org_demo"]',
    );
    const submitElement = container.querySelector('button[type="submit"]');

    if (
      !(targetButton instanceof HTMLButtonElement) ||
      !(submitElement instanceof HTMLButtonElement)
    ) {
      throw new TypeError("Expected tenant target form controls to render.");
    }

    await act(async () => {
      targetButton.click();
    });

    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => {
      submitElement.click();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      scope: platformScope.organization,
      scopeId: "org_demo",
    });
  });

  it("keeps exact scope lookup hidden by default", async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(
        <AdminTenantTargetForm
          initialScope={platformScope.organization}
          submitLabel="Open workspace"
          targetOptions={[]}
          onSubmit={onSubmit}
        />,
      );
    });

    expect(container.querySelector("summary")).toBeNull();
    expect(
      container.textContent?.includes("Use exact scope lookup") ?? false,
    ).toBe(false);
    expect(
      container.textContent?.includes("Search the shared operator catalog") ??
        false,
    ).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("trims exact scope lookup submissions only when the governed fallback is explicitly enabled", async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(
        <AdminTenantTargetForm
          initialScope={platformScope.organization}
          allowExactScopeLookup
          submitLabel="Open workspace"
          targetOptions={[]}
          onSubmit={onSubmit}
        />,
      );
    });

    const disclosure = container.querySelector("summary");
    const selectElement = container.querySelector("select");
    const inputElement = container.querySelector(
      'input[type="text"][placeholder*="internal scope ID" i]',
    );
    const submitElement = container.querySelector('button[type="submit"]');
    const selectValueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    const inputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;

    if (
      !(disclosure instanceof HTMLElement) ||
      !(selectElement instanceof HTMLSelectElement) ||
      !(inputElement instanceof HTMLInputElement) ||
      !(submitElement instanceof HTMLButtonElement) ||
      selectValueSetter === undefined ||
      inputValueSetter === undefined
    ) {
      throw new TypeError("Expected manual tenant lookup controls to render.");
    }

    await act(async () => {
      disclosure.click();
      selectValueSetter.call(selectElement, platformScope.enterprise);
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));
      inputValueSetter.call(inputElement, "  ent_demo  ");
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      inputElement.dispatchEvent(new Event("blur", { bubbles: true }));
      submitElement.click();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      scope: platformScope.enterprise,
      scopeId: "ent_demo",
    });
  });
});
