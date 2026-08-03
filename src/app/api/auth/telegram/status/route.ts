import { NextResponse } from "next/server";
import { authRequiredResponse, requireUserAuth } from "@/lib/require-auth";
import { getTelegramStatusForAccount } from "@/lib/telegram/accounts";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUserAuth();
  if (!auth) return authRequiredResponse();
  const status = await getTelegramStatusForAccount(auth.sub);
  return NextResponse.json(status);
}
