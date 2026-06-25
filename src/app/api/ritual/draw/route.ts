import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { resolveMasterDeckSystem } from "@/lib/decks";
import { DECK_REGISTRY } from "@/lib/decks";
import { RITUAL_SPREAD_POSITIONS } from "@/lib/ritual-config";

/** Draw 5 cards for ritual spread (no billing). */
export async function GET(request: NextRequest) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const characterKey = request.nextUrl.searchParams.get("characterKey")?.trim() ?? "ragnar";
  const system = resolveMasterDeckSystem(characterKey);
  const pool = [...DECK_REGISTRY[system].symbols];
  const drawn: { name: string; position: string }[] = [];

  for (const pos of RITUAL_SPREAD_POSITIONS) {
    if (!pool.length) break;
    const idx = Math.floor(Math.random() * pool.length);
    const pick = pool.splice(idx, 1)[0];
    drawn.push({ name: pick.name, position: pos.label });
  }

  return NextResponse.json({ cards: drawn, system });
}
