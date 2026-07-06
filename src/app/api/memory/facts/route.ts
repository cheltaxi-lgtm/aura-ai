import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { sanitizeTextField } from "@/lib/chat-sanitize";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { validateUserSubmittedFact } from "@/lib/memory/user-fact-input";
import { deleteFact, listFacts, searchFacts, upsertFact } from "@/lib/memory/user-facts";

/**
 * Cap for user-submitted (manually entered) facts specifically, distinct from
 * the global auto-extracted fact cap in lib/memory/user-facts.ts.
 */
const MAX_MANUAL_FACTS_PER_USER = 100;

function mapFact(f: {
  id: string;
  fact: string;
  category: string | null;
  eventDate: string | null;
  salience: number;
}) {
  return {
    id: f.id,
    fact: f.fact,
    category: f.category,
    eventDate: f.eventDate,
    salience: f.salience,
  };
}

/** List, add, or delete the authenticated user's long-term memory facts. */
export async function GET() {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }

  const facts = await listFacts(profileUserId, MAX_MANUAL_FACTS_PER_USER);
  return NextResponse.json({
    facts: facts.map(mapFact),
    count: facts.length,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }

  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("memory_fact_add", auth.sub),
    20,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", retryAfterSec, message: "Слишком много добавлений. Попробуйте позже." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (body.pdConsent !== true) {
    return NextResponse.json(
      {
        error: "consent_required",
        message: "Требуется согласие на обработку персональных данных.",
      },
      { status: 422 }
    );
  }

  const factText = sanitizeTextField(body.fact, 400);
  if (!factText || factText.length < 6) {
    return NextResponse.json(
      { error: "invalid_fact", message: "Напишите факт подробнее (от 6 символов)." },
      { status: 422 }
    );
  }

  const category = sanitizeTextField(body.category, 20) ?? null;
  const eventDate = sanitizeTextField(body.eventDate, 10) ?? null;

  const input = validateUserSubmittedFact(factText, category, eventDate);
  if (!input) {
    return NextResponse.json(
      {
        error: "invalid_fact",
        message:
          "Не удалось сохранить: нужен факт о вашей жизни по-русски, без карт/гаданий и общих фраз.",
      },
      { status: 422 }
    );
  }

  const existing = await listFacts(profileUserId, MAX_MANUAL_FACTS_PER_USER + 1);
  if (existing.length >= MAX_MANUAL_FACTS_PER_USER) {
    return NextResponse.json(
      {
        error: "limit_reached",
        message: `Достигнут лимит ${MAX_MANUAL_FACTS_PER_USER} фактов. Удалите старые, чтобы добавить новые.`,
      },
      { status: 409 }
    );
  }

  await upsertFact(profileUserId, input);

  const matched = await searchFacts(profileUserId, input.fact, { topK: 1 });
  const created = matched[0] ?? existing.find((f) => f.fact === input.fact);

  return NextResponse.json({
    ok: true,
    fact: created ? mapFact(created) : { fact: input.fact, category: input.category, salience: input.salience },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }

  const factId = request.nextUrl.searchParams.get("factId")?.trim();
  if (!factId) {
    return NextResponse.json({ error: "factId_required" }, { status: 400 });
  }

  const ok = await deleteFact(profileUserId, factId);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: 1 });
}
