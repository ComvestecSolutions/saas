import { describe, expect, it } from "vitest";
import {
  parsePanesParam,
  serializePanesParam,
  useUrlPanes,
  type PanesRouterAdapter,
  type WorkbenchPaneDescriptor,
} from "./useUrlPanes";
import { mount, click } from "../testing/browser-test-utils";

describe("parsePanesParam", () => {
  it("returns an empty list for null/empty input", () => {
    expect(parsePanesParam(null)).toEqual([]);
    expect(parsePanesParam("")).toEqual([]);
    expect(parsePanesParam(undefined)).toEqual([]);
  });

  it("parses a single resource:id pane", () => {
    const panes = parsePanesParam("tenant:abc");
    expect(panes).toHaveLength(1);
    expect(panes[0]?.resource).toBe("tenant");
    expect(panes[0]?.id).toBe("abc");
    expect(panes[0]?.params).toEqual({});
  });

  it("parses resource panes without an id and a query string", () => {
    const panes = parsePanesParam("audit?actor=abc&t=24h");
    expect(panes[0]?.resource).toBe("audit");
    expect(panes[0]?.id).toBeUndefined();
    expect(panes[0]?.params).toEqual({ actor: "abc", t: "24h" });
  });

  it("parses pipe-separated multiple panes", () => {
    const panes = parsePanesParam(
      "tenant:abc|audit?actor=abc|config:identity/session.idleMinutes",
    );
    expect(panes.map((pane) => pane.resource)).toEqual([
      "tenant",
      "audit",
      "config",
    ]);
    expect(panes[2]?.id).toBe("identity/session.idleMinutes");
  });

  it("ignores empty tokens between separators", () => {
    expect(parsePanesParam("|tenant:abc||")).toHaveLength(1);
  });
});

describe("serializePanesParam", () => {
  it("round-trips through parsePanesParam", () => {
    const original = "tenant:abc|audit?actor=abc&t=24h|runs";
    const panes = parsePanesParam(original);
    expect(serializePanesParam(panes)).toBe(original);
  });

  it("URI-encodes query values", () => {
    const panes: readonly WorkbenchPaneDescriptor[] = [
      { resource: "audit", params: { q: "a b/c" } },
    ];
    expect(serializePanesParam(panes)).toBe("audit?q=a%20b%2Fc");
  });
});

describe("useUrlPanes", () => {
  it("reads the panes string through the adapter and writes back on setPanes", () => {
    let stored = "tenant:abc";
    const adapter: PanesRouterAdapter = {
      read: () => stored,
      write: (next) => {
        stored = next;
      },
    };

    type Captured = {
      panes: readonly WorkbenchPaneDescriptor[];
      setPanes: (next: readonly WorkbenchPaneDescriptor[]) => void;
    };
    const captured: { current: Captured | undefined } = { current: undefined };

    function Probe() {
      const result = useUrlPanes(adapter);
      captured.current = result;
      return (
        <button
          type="button"
          onClick={() =>
            result.setPanes([
              { resource: "audit", params: { t: "24h" } },
              { resource: "tenant", id: "xyz", params: {} },
            ])
          }
        >
          replace
        </button>
      );
    }

    const host = mount(<Probe />);
    expect(captured.current?.panes[0]?.resource).toBe("tenant");
    const button = host.querySelector("button") as HTMLButtonElement;
    click(button);
    expect(stored).toBe("audit?t=24h|tenant:xyz");
  });
});
