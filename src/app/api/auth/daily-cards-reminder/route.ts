import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  getAccountDailyCardsReminder,
  setAccountDailyCardsReminder,
} from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

function parseEnabled(body: unknown): boolean | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { dailyCardsReminder?: unknown }).dailyCardsReminder;
  return typeof raw === "boolean" ? raw : null;
}

export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dailyCardsReminder = await getAccountDailyCardsReminder(auth.sub);
  return NextResponse.json({ dailyCardsReminder });
}

async function writePreference(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const enabled = parseEnabled(body);
  if (enabled == null) {
    return NextResponse.json({ error: "dailyCardsReminder_required" }, { status: 400 });
  }
  const dailyCardsReminder = await setAccountDailyCardsReminder(auth.sub, enabled);
  return NextResponse.json({ dailyCardsReminder });
}

export async function PATCH(request: NextRequest) {
  return writePreference(request);
}

export async function POST(request: NextRequest) {
  return writePreference(request);
}
