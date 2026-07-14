/** Client router registered by AppShellBridge — soft navigation without full reload on web. */
let pushRoute: ((path: string) => void) | null = null;

export function registerAppShellRouter(next: (path: string) => void): () => void {
  pushRoute = next;
  return () => {
    if (pushRoute === next) pushRoute = null;
  };
}

export function pushAppShellRoute(path: string): boolean {
  if (!pushRoute) return false;
  pushRoute(path);
  return true;
}
