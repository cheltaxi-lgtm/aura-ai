import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { RITUAL_TYPES } from "@/lib/ritual-config";
import {
  appendRitualAnswer,
  getRitualById,
  ritualToClient,
} from "@/lib/ritual-service";

const MAX_ANSWER_LENGTH = 800;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(
    authed.auth.sub,
    "ritual_answer"
  );
  if (rateLimited) return rateLimited;

  const { id } = await context.params;
  const ritual = await getRitualById(id);

  if (!ritual || ritual.user_id !== authed.profileUserId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ritual.status !== "questions") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  let body: { answer?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const answer = body.answer?.trim();
  if (!answer) {
    return NextResponse.json({ error: "Empty answer" }, { status: 400 });
  }
  if (answer.length > MAX_ANSWER_LENGTH) {
    return NextResponse.json(
      { error: `Answer too long (max ${MAX_ANSWER_LENGTH})` },
      { status: 400 }
    );
  }

  const questions = RITUAL_TYPES[ritual.ritual_type].questions;
  const newAnswers = [...ritual.answers, answer];
  const readyForSpread = newAnswers.length >= questions.length;

  const updated = await appendRitualAnswer(
    id,
    newAnswers,
    readyForSpread ? "spread" : undefined
  );

  if (!updated) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  const nextQuestion = readyForSpread
    ? undefined
    : questions[newAnswers.length];

  return NextResponse.json({
    ritual: ritualToClient(updated),
    nextQuestion,
    readyForSpread,
  });
}
