"use client";

import AppShellUpdateCta from "@/components/AppShellUpdateCta";

export { APP_UPDATE_RECHECK_EVENT, useAppShellVersion } from "@/hooks/useAppShellVersion";

export function AppShellVersionBar() {
  return <AppShellUpdateCta variant="bar" />;
}

/** @deprecated Use AppShellUpdateCta in AppShellBridge. */
export default function AppShellVersionFooter() {
  return <AppShellUpdateCta variant="bar" />;
}
