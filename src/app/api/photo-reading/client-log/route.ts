import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";

/** Client-side error breadcrumbs for photo recognize debugging. */
export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    console.error("[photo-recognize-client]", {
      userId: auth.sub,
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
    console.error("[photo-recognize-client] invalid payload", { userId: auth.sub });
  }

  return NextResponse.json({ ok: true });
}
