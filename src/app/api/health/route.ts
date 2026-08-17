import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getLlmConcurrencyStats } from "@/lib/llm-concurrency";

export async function GET() {
  const dbOk = await ensureDb();
  const llm = getLlmConcurrencyStats();
  const healthy = dbOk && llm.active <= llm.max;

  // Public payload stays opaque on purpose (guardrail): internals like db/llm
  // state must not leak — the status code alone conveys healthy/degraded.
  return NextResponse.json(
    {
      ok: healthy,
      status: healthy ? "ok" : "degraded",
    },
    { status: healthy ? 200 : 503 }
  );
}
