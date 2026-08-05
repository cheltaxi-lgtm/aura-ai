import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import {
  confirmClientConsent,
  getClient,
  softDeleteClient,
  updateClient,
} from "@/modules/pro/db/clients";
import { listCases } from "@/modules/pro/db/cases";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const { id } = await ctx.params;
  const client = await getClient(prac.ctx.account.id, id);
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const cases = await listCases(prac.ctx.account.id, { clientId: id });
  return NextResponse.json({ ok: true, client, cases });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === "consent") {
    const client = await confirmClientConsent(
      prac.ctx.account.id,
      id,
      prac.ctx.profileUserId
    );
    if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, client });
  }
  const client = await updateClient(prac.ctx.account.id, id, {
    alias: typeof body.alias === "string" ? body.alias : undefined,
    fullName: typeof body.fullName === "string" ? body.fullName : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    birthDate: typeof body.birthDate === "string" ? body.birthDate : undefined,
    birthPlace: typeof body.birthPlace === "string" ? body.birthPlace : undefined,
    tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
  });
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, client });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const { id } = await ctx.params;
  const ok = await softDeleteClient(
    prac.ctx.account.id,
    id,
    prac.ctx.profileUserId
  );
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
