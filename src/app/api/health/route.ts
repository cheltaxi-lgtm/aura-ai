import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getLlmConcurrencyStats } from "@/lib/llm-concurrency";

export async function GET() {
  const dbOk = await ensureDb();
  const llm = getLlmConcurrencyStats();
  const healthy = dbOk && llm.active <= llm.max;

  return NextResponse.json(
    {
      ok: healthy,
      status: healthy ? "ok" : "degraded",
      db: dbOk,
      llm: { active: llm.active, max: llm.max },
    },
    { status: healthy ? 200 : 503 }
  );
}
