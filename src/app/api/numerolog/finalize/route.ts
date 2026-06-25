import { NextRequest, NextResponse } from "next/server";

import { requireUserAuth } from "@/lib/require-auth";
import {
  generateNumerologFinale,
  type NumerologFinaleTopic,
} from "@/lib/numerology/numerolog-finalize";

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Требуется регистрация" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      name?: string;
      topic?: NumerologFinaleTopic;
      engineFacts?: string;
      engineBody?: string;
    };

    const name = (body.name || "друг").trim() || "друг";
    const topic = body.topic ?? "spread_opening";
    const facts = (body.engineFacts || body.engineBody || "").trim();

    const finale = await generateNumerologFinale({
      name,
      topic,
      engineFacts: facts,
    });

    return NextResponse.json({ finale });
  } catch (err) {
    console.warn("Numerolog finalize failed:", err);
    return NextResponse.json({ error: "finalize_failed" }, { status: 500 });
  }
}
