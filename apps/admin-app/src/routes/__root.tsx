/// <reference types="vite/client" />

import { useCallback, useEffect, type ReactNode } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import appCss from "../styles/app.css?url";
import uiCss from "@comvestec/ui/styles?url";
import { StateScreen } from "@comvestec/ui";
import {
  buildAdminShellRedirectPath,
  loadAdminShellLoaderData,
} from "../lib/admin-shell-loader";
import { isAdminAuthRoutePath } from "../auth/paths";
import { DeskShell } from "../desk/desk-shell";

type AdminShellBrowserLocation = {
  readonly pathname: string;
  readonly search: string;
};

export const resolveAdminShellCurrentLocation = (
  routerLocation: Readonly<{
    pathname: string;
    searchStr: string;
  }>,
  browserLocation:
    | Readonly<AdminShellBrowserLocation>
    | undefined = typeof window === "undefined" ? undefined : window.location,
) => ({
  pathname: browserLocation?.pathname ?? routerLocation.pathname,
  searchStr: browserLocation?.search ?? routerLocation.searchStr,
});

export const Route = createRootRoute({
  head: () => ({
    links: [
      { rel: "stylesheet", href: uiCss },
      { rel: "stylesheet", href: appCss },
    ],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Comvestec Operations" },
    ],
  }),
  shouldReload: true,
  loader: ({ location }) => loadAdminShellLoaderData(location),
  component: RootComponent,
});

function RootComponent() {
  const shellData = Route.useLoaderData() ?? ({ kind: "shell" } as const);
  const routerState = useRouterState();
  const router = useRouter();
  const invalidateBeforeRedirect = useCallback(
    () => router.invalidate({ sync: true }),
    [router],
  );
  const { pathname, searchStr } = resolveAdminShellCurrentLocation(
    routerState.location,
  );

  if (isAdminAuthRoutePath(pathname)) {
    return (
      <RootDocument>
        <Outlet />
        <TanStackRouterDevtools position="bottom-right" />
      </RootDocument>
    );
  }

  if (shellData.kind === "shell" || shellData.kind === "stale-session") {
    const redirectPath = buildAdminShellRedirectPath(
      { pathname, searchStr },
      shellData,
    );

    return (
      <RootDocument>
        <AdminAuthRedirectState
          redirectPath={redirectPath}
          invalidateBeforeRedirect={invalidateBeforeRedirect}
          htmlRedirectFallbackEnabled={false}
        />
        <TanStackRouterDevtools position="bottom-right" />
      </RootDocument>
    );
  }

  if (shellData.kind === "denied") {
    return (
      <RootDocument>
        <AdminShellBlockingState
          variant="denied"
          title="Access denied"
          description={shellData.reason}
        />
        <TanStackRouterDevtools position="bottom-right" />
      </RootDocument>
    );
  }

  if (shellData.kind === "error") {
    return (
      <RootDocument>
        <AdminShellBlockingState
          variant="5xx"
          title={shellData.title}
          description={shellData.description}
        />
        <TanStackRouterDevtools position="bottom-right" />
      </RootDocument>
    );
  }

  return (
    <RootDocument>
      <DeskShell
        profile={shellData.profile}
        currentPath={pathname}
        onNavigate={(path) => {
          void router.navigate({ href: path });
        }}
      >
        <Outlet />
      </DeskShell>
      <TanStackRouterDevtools position="bottom-right" />
    </RootDocument>
  );
}

function AdminShellBlockingState({
  variant,
  title,
  description,
}: Readonly<{
  variant: "denied" | "5xx";
  title: string;
  description: string;
}>) {
  return (
    <main
      className="ops-auth-blocking-state"
      data-shell-state={variant}
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 10,
        background:
          "linear-gradient(180deg, rgba(6,10,18,0.98) 0%, rgba(10,15,24,1) 100%)",
      }}
    >
      <div style={{ width: "min(460px, 100%)" }}>
        <StateScreen
          variant={variant}
          title={title}
          description={description}
        />
      </div>
    </main>
  );
}

export function AdminAuthRedirectState({
  redirectPath,
  invalidateBeforeRedirect,
  htmlRedirectFallbackEnabled = true,
  redirect = (path: string) => {
    window.location.replace(path);
  },
}: Readonly<{
  redirectPath: string;
  invalidateBeforeRedirect?: () => Promise<unknown> | unknown;
  htmlRedirectFallbackEnabled?: boolean;
  redirect?: (path: string) => void;
}>) {
  useEffect(() => {
    if (isAdminBrowserHarnessEnabled()) {
      return;
    }

    let cancelled = false;

    void Promise.resolve(invalidateBeforeRedirect?.())
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          redirect(redirectPath);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [invalidateBeforeRedirect, redirect, redirectPath]);

  const renderHtmlFallback =
    !isAdminBrowserHarnessEnabled() && htmlRedirectFallbackEnabled;

  return (
    <main
      className="ops-auth-redirect-state"
      aria-live="polite"
      data-redirect-path={redirectPath}
    >
      {renderHtmlFallback ? (
        <script
          data-auth-redirect-script="true"
          dangerouslySetInnerHTML={{
            __html: buildAdminAuthRedirectInlineScript(redirectPath),
          }}
        />
      ) : null}
      <p className="ops-auth-redirect-label">Redirecting to sign in…</p>
      <p className="ops-auth-redirect-copy">
        Secure access is required before the admin workspace can load.
      </p>
      <p className="ops-auth-redirect-fallback">
        If nothing happens automatically,{" "}
        <a href={redirectPath}>continue to sign in</a>.
      </p>
    </main>
  );
}

export const buildAdminAuthRedirectInlineScript = (redirectPath: string) =>
  `window.location.replace(${JSON.stringify(redirectPath)});`;

function isAdminBrowserHarnessEnabled() {
  return (
    (
      globalThis as typeof globalThis & {
        __ADMIN_BROWSER_HARNESS__?: boolean;
      }
    ).__ADMIN_BROWSER_HARNESS__ === true
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  if (isAdminBrowserHarnessEnabled()) {
    return <>{children}</>;
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
