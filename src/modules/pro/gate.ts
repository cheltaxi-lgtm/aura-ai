import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { isProModuleEnabled, isProPortalEnabled } from "./config";

/** API: when Pro is dark → 404 JSON (module invisible). */
export function requireProEnabled(): NextResponse | null {
  if (isProModuleEnabled()) return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** API: mini-landing portal (module + PRO_PORTAL_ENABLED). */
export function requireProPortalEnabled(): NextResponse | null {
  if (isProPortalEnabled()) return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** App Router pages: when Pro is dark → Next notFound(). */
export function requireProPage(): void {
  if (!isProModuleEnabled()) notFound();
}

/** Public /p/[slug] pages — need portal flag too. */
export function requireProPortalPage(): void {
  if (!isProPortalEnabled()) notFound();
}
