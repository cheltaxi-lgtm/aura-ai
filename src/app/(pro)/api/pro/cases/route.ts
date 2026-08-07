import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import { createCase, listCases, setCaseInput } from "@/modules/pro/db/cases";
import { getClient } from "@/modules/pro/db/clients";
import { casePayloadFromClientBirth } from "@/modules/pro/adapters/client-birth";
import type { ProCaseType } from "@/modules/pro/domain/types";

export async function GET(req: Request) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const sp = new URL(req.url).searchParams;
  const cases = await listCases(prac.ctx.account.id, {
    status: sp.get("status") || undefined,
    clientId: sp.get("clientId") || undefined,
    includeArchived: sp.get("includeArchived") === "1",
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
    const client = await getClient(prac.ctx.account.id, body.clientId);
    if (!client) {
      return NextResponse.json({ error: "client_not_found" }, { status: 404 });
    }
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
    // Prefill case input from client birth card (natal / matrix / hd).
    if (body.type === "natal" || body.type === "matrix" || body.type === "hd") {
      const seed = casePayloadFromClientBirth(client);
      if (seed) {
        await setCaseInput(prac.ctx.account.id, c.id, seed);
      }
    }
    return NextResponse.json({ ok: true, case: c });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status }
    );
  }
}
