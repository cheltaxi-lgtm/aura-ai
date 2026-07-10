import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";

/**
 * Client-side error breadcrumbs for photo recognize debugging.
 * Deliberately does NOT require auth: the camera/upload button is reachable
 * before login, and a diagnostic breadcrumb is more useful landing as
 * "anonymous" than being silently dropped with a 401.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();

  try {
    const body = await request.json();
    console.error("[photo-recognize-client]", {
      userId: auth?.sub ?? "anonymous",
      phase: body.phase,
      error: body.error,
      bytes: body.bytes,
      blobBytes: body.blobBytes,
      originalBytes: body.originalBytes,
      name: body.name,
      source: body.source,
      transport: body.transport,
    });
  } catch {
    console.error("[photo-recognize-client] invalid payload", { userId: auth?.sub ?? "anonymous" });
  }

  return NextResponse.json({ ok: true });
}
