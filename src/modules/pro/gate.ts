import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { isProModuleEnabled } from "./config";

/** API: when Pro is dark → 404 JSON (module invisible). */
export function requireProEnabled(): NextResponse | null {
  if (isProModuleEnabled()) return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** App Router pages: when Pro is dark → Next notFound(). */
export function requireProPage(): void {
  if (!isProModuleEnabled()) notFound();
}
