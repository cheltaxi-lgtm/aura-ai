import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { getRuneBalance } from "@/lib/rune-service";
import {
  getRitualById,
  saveRitualCards,
  ritualToClient,
  type RitualCard,
} from "@/lib/ritual-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ritual = await getRitualById(id);

  if (!ritual || ritual.user_id !== authed.profileUserId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ritual.status !== "spread") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let body: { cards?: RitualCard[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cards = body.cards ?? [];
  if (cards.length !== 5) {
    return NextResponse.json({ error: "Need 5 cards" }, { status: 400 });
  }

  const updated = await saveRitualCards(id, cards);
  if (!updated) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  const balance = await getRuneBalance(authed.profileUserId);

  return NextResponse.json({
    ritual: ritualToClient(updated),
    cost: updated.rune_cost,
    balance,
  });
}
