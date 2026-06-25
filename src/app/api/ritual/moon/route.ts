import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { getMoonPhase } from "@/lib/moon";

export async function GET() {
  await ensureDb();
  const moon = getMoonPhase();
  return NextResponse.json(moon);
}
