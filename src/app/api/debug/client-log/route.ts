import { appendFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const SESSION_ID = "5da396";

export async function POST(request: NextRequest) {
  const allow =
    process.env.NODE_ENV !== "production" || process.env.DEBUG_CLIENT_LOG === "1";
  if (!allow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.sessionId && body.sessionId !== SESSION_ID) {
      return NextResponse.json({ ok: true });
    }
    const line =
      JSON.stringify({
        sessionId: SESSION_ID,
        ...body,
        timestamp: typeof body.timestamp === "number" ? body.timestamp : Date.now(),
      }) + "\n";
    await appendFile(path.join(process.cwd(), `debug-${SESSION_ID}.log`), line, "utf8");
  } catch {
    // best-effort
  }

  return NextResponse.json({ ok: true });
}
