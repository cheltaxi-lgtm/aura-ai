import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import { createCase, listCases } from "@/modules/pro/db/cases";
import type { ProCaseType } from "@/modules/pro/domain/types";

export async function GET(req: Request) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const sp = new URL(req.url).searchParams;
  const cases = await listCases(prac.ctx.account.id, {
    status: sp.get("status") || undefined,
    clientId: sp.get("clientId") || undefined,
  });
  return NextResponse.json({ ok: true, cases });
}

export async function POST(req: Request) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const body = (await req.json().catch(() => ({}))) as {
    clientId?: string;
    type?: ProCaseType;
    question?: string;
    practitionerContext?: string;
  };
  if (!body.clientId || !body.type) {
    return NextResponse.json({ error: "clientId_and_type_required" }, { status: 400 });
  }
  try {
    const c = await createCase(
      prac.ctx.account.id,
      {
        clientId: body.clientId,
        type: body.type,
        question: body.question ?? null,
        practitionerContext: body.practitionerContext ?? null,
      },
      prac.ctx.profileUserId
    );
    return NextResponse.json({ ok: true, case: c });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status }
    );
  }
}
