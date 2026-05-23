import { useCallback, useMemo } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import type { PanesRouterAdapter } from "@comvestec/ui";

/**
 * TanStack Router-backed implementation of the `PanesRouterAdapter`
 * contract exposed by `@comvestec/ui`'s `useUrlPanes` hook (slice 1b
 * desk shell). The adapter keeps the workbench's `?panes=` query
 * string in lock-step with the active TanStack Router location so
 * deep links, back/forward navigation, and shareable URLs round-trip
 * the Operator Desk layout faithfully.
 */
const PANES_QUERY_KEY = "panes";

const buildNextSearchParams = (
  current: string,
  next: string,
): URLSearchParams => {
  const params = new URLSearchParams(current);
  if (next.length === 0) {
    params.delete(PANES_QUERY_KEY);
  } else {
    params.set(PANES_QUERY_KEY, next);
  }
  return params;
};

export const useTanStackRouterPanesAdapter = (): PanesRouterAdapter => {
  const router = useRouter();
  const searchStr = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const read = useCallback(() => {
    const params = new URLSearchParams(searchStr);
    return params.get(PANES_QUERY_KEY);
  }, [searchStr]);

  const write = useCallback(
    (next: string) => {
      const params = buildNextSearchParams(searchStr, next);
      const searchEntries = Object.fromEntries(params.entries());
      router.navigate({
        to: pathname,
        search: () => searchEntries,
        replace: false,
      });
    },
    [router, searchStr, pathname],
  );

  return useMemo<PanesRouterAdapter>(() => ({ read, write }), [read, write]);
};
