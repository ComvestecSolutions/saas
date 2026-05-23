import { describe, expect, it, vi } from "vitest";
import {
  HighRiskActionGuard,
  type HighRiskReason,
} from "./HighRiskActionGuard";
import { click, mount } from "../../testing/browser-test-utils";

type Row = { readonly id: string };

const reasons: readonly HighRiskReason[] = [
  { id: "ops.routine", label: "Routine maintenance" },
  {
    id: "ops.incident",
    label: "Incident remediation",
    description: "open INC",
  },
];

const selection: readonly Row[] = [{ id: "r1" }, { id: "r2" }];

describe("HighRiskActionGuard", () => {
  it("renders the guard with the action label and selection count", () => {
    const host = mount(
      <HighRiskActionGuard
        action={{ id: "purge", label: "Purge tenants" }}
        selection={selection}
        reasons={reasons}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    void host;
    const node = document.querySelector(
      "[data-pattern='high-risk-action-guard']",
    );
    expect(node?.textContent).toContain("Purge tenants");
    const dialog = document.querySelector("[role='dialog']") as HTMLElement;
    expect(dialog.textContent).toContain("Selection: 2 items");
  });

  it("requires a reason and a second confirmation before onConfirm fires", () => {
    const onConfirm = vi.fn();
    mount(
      <HighRiskActionGuard
        action={{ id: "purge", label: "Purge" }}
        selection={selection}
        reasons={reasons}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );
    const arm = document.querySelector(
      "[data-testid='high-risk-arm']",
    ) as HTMLButtonElement;
    expect(arm.getAttribute("aria-disabled")).toBe("true");
    const radios = document.querySelectorAll("input[type='radio']");
    click(radios[0]!);
    const armEnabled = document.querySelector(
      "[data-testid='high-risk-arm']",
    ) as HTMLButtonElement;
    expect(armEnabled.disabled).toBe(false);
    click(armEnabled);
    expect(
      document.querySelector("[data-testid='high-risk-armed-banner']"),
    ).not.toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
    const confirm = document.querySelector(
      "[data-testid='high-risk-confirm-final']",
    ) as HTMLButtonElement;
    click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toEqual({
      reasonId: "ops.routine",
      note: "",
    });
  });

  it("invokes onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    mount(
      <HighRiskActionGuard
        action={{ id: "purge", label: "Purge" }}
        selection={selection}
        reasons={reasons}
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );
    const cancel = document.querySelector(
      "[data-testid='high-risk-cancel']",
    ) as HTMLButtonElement;
    click(cancel);
    expect(onCancel).toHaveBeenCalled();
  });
});
