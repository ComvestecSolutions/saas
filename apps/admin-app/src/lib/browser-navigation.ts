const resolveBrowserNavigationTarget = (path: string) =>
  new URL(path, window.location.origin);

export const navigateAdminPath = (
  path: string,
  onNavigate?: (path: string) => void,
) => {
  if (typeof window === "undefined") {
    onNavigate?.(path);
    return;
  }

  const target = resolveBrowserNavigationTarget(path);
  const targetPath = `${target.pathname}${target.search}${target.hash}`;

  if (onNavigate === undefined) {
    window.location.assign(target.toString());
    return;
  }

  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  try {
    onNavigate(path);
  } catch {
    window.location.assign(target.toString());
    return;
  }

  window.setTimeout(() => {
    const nextPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextPath === currentPath && nextPath !== targetPath) {
      window.location.assign(target.toString());
    }
  }, 75);
};
