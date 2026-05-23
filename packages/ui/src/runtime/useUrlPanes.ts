import { useCallback, useMemo } from "react";

/**
 * Shape of an Operator Desk pane in the URL (`/desk?panes=...`).
 *
 * The string form is:
 *   `<resource>:<id>[?k=v&k=v]`
 * Multiple panes are joined by `|`.
 *
 * Examples:
 *   tenant:abc
 *   audit?actor=abc&t=24h
 *   config:identity/session.idleMinutes
 *
 * The exact `panes` query-string parser/serializer is reused by the
 * `Workbench` pattern and any first-party route loader that needs to
 * inspect or rewrite the current workbench layout.
 */
export type WorkbenchPaneDescriptor = {
  readonly resource: string;
  readonly id?: string;
  readonly params: Readonly<Record<string, string>>;
};

const PANE_SEPARATOR = "|";

const parsePaneToken = (token: string): WorkbenchPaneDescriptor | undefined => {
  const trimmed = token.trim();
  if (trimmed.length === 0) return undefined;
  const [head, query] = trimmed.split("?", 2);
  const headPart = head ?? "";
  const colonIndex = headPart.indexOf(":");
  const resource = colonIndex === -1 ? headPart : headPart.slice(0, colonIndex);
  const id = colonIndex === -1 ? undefined : headPart.slice(colonIndex + 1);
  if (resource.length === 0) return undefined;
  const params: Record<string, string> = {};
  if (query !== undefined && query.length > 0) {
    for (const segment of query.split("&")) {
      if (segment.length === 0) continue;
      const equalsIndex = segment.indexOf("=");
      if (equalsIndex === -1) {
        params[decodeURIComponent(segment)] = "";
      } else {
        const key = decodeURIComponent(segment.slice(0, equalsIndex));
        const value = decodeURIComponent(segment.slice(equalsIndex + 1));
        params[key] = value;
      }
    }
  }
  const descriptor: WorkbenchPaneDescriptor =
    id === undefined
      ? { resource, params: Object.freeze(params) }
      : { resource, id, params: Object.freeze(params) };
  return descriptor;
};

export const parsePanesParam = (
  raw: string | null | undefined,
): readonly WorkbenchPaneDescriptor[] => {
  if (raw === null || raw === undefined || raw.length === 0) return [];
  const panes: WorkbenchPaneDescriptor[] = [];
  for (const token of raw.split(PANE_SEPARATOR)) {
    const parsed = parsePaneToken(token);
    if (parsed !== undefined) panes.push(parsed);
  }
  return panes;
};

const serializePane = (pane: WorkbenchPaneDescriptor): string => {
  const head =
    pane.id === undefined ? pane.resource : `${pane.resource}:${pane.id}`;
  const keys = Object.keys(pane.params);
  if (keys.length === 0) return head;
  const query = keys
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(pane.params[key] ?? "")}`,
    )
    .join("&");
  return `${head}?${query}`;
};

export const serializePanesParam = (
  panes: readonly WorkbenchPaneDescriptor[],
): string => panes.map(serializePane).join(PANE_SEPARATOR);

/**
 * Router-adapter contract: keeps the hook independent of TanStack
 * Router. The desk-app composes a `TanStackRouterPanesAdapter` that
 * implements this interface; tests pass a fake adapter.
 */
export type PanesRouterAdapter = {
  readonly read: () => string | null;
  readonly write: (next: string) => void;
};

export type UseUrlPanesResult = {
  readonly panes: readonly WorkbenchPaneDescriptor[];
  readonly setPanes: (next: readonly WorkbenchPaneDescriptor[]) => void;
};

/**
 * URL-driven workbench layout state. The shell is the sole owner of
 * pane composition; every other surface (rail clicks, omnibar
 * commands, deep-links) writes through this hook to stay in sync
 * across the workbench, the back button, and shareable links.
 */
export const useUrlPanes = (
  routerAdapter: PanesRouterAdapter,
): UseUrlPanesResult => {
  const raw = routerAdapter.read();
  const panes = useMemo(() => parsePanesParam(raw), [raw]);
  const setPanes = useCallback(
    (next: readonly WorkbenchPaneDescriptor[]) => {
      routerAdapter.write(serializePanesParam(next));
    },
    [routerAdapter],
  );
  return { panes, setPanes };
};
