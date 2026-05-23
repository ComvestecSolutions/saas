import { describe, expect, it } from "vitest";
import { usePinnedResources } from "./usePinnedResources";
import { click, mount } from "../testing/browser-test-utils";

const makeMemoryStorage = (): Storage => {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    key: (index) => Array.from(data.keys())[index] ?? null,
  };
  return storage;
};

describe("usePinnedResources", () => {
  it("pins and unpins resources, with isPinned reflecting state", () => {
    const storage = makeMemoryStorage();
    type Api = ReturnType<typeof usePinnedResources>;
    const captured: { current: Api | undefined } = { current: undefined };

    function Probe() {
      captured.current = usePinnedResources({ storage });
      return (
        <>
          <button
            type="button"
            data-test="pin"
            onClick={() =>
              captured.current?.pin({
                resource: "tenant",
                id: "abc",
                label: "Acme",
              })
            }
          >
            pin
          </button>
          <button
            type="button"
            data-test="unpin"
            onClick={() =>
              captured.current?.unpin({ resource: "tenant", id: "abc" })
            }
          >
            unpin
          </button>
        </>
      );
    }

    const host = mount(<Probe />);
    expect(captured.current?.pins).toHaveLength(0);

    click(host.querySelector("[data-test='pin']") as HTMLButtonElement);
    expect(captured.current?.pins).toHaveLength(1);
    expect(captured.current?.isPinned({ resource: "tenant", id: "abc" })).toBe(
      true,
    );

    // Pinning again is a no-op.
    click(host.querySelector("[data-test='pin']") as HTMLButtonElement);
    expect(captured.current?.pins).toHaveLength(1);

    click(host.querySelector("[data-test='unpin']") as HTMLButtonElement);
    expect(captured.current?.pins).toHaveLength(0);
  });

  it("hydrates from storage on mount", () => {
    const storage = makeMemoryStorage();
    storage.setItem(
      "ops-desk:pinned-resources@v1",
      JSON.stringify([{ resource: "runs", label: "Runs" }]),
    );

    type Api = ReturnType<typeof usePinnedResources>;
    const captured: { current: Api | undefined } = { current: undefined };
    function Probe() {
      captured.current = usePinnedResources({ storage });
      return null;
    }
    mount(<Probe />);
    expect(captured.current?.pins[0]?.resource).toBe("runs");
  });
});
