import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import {
  confirmClientConsent,
  getClient,
  softDeleteClient,
  updateClient,
} from "@/modules/pro/db/clients";
import { listCases } from "@/modules/pro/db/cases";
import { geocodeAdapter } from "@/modules/pro/adapters";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const { id } = await ctx.params;
  const client = await getClient(prac.ctx.account.id, id);
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const cases = await listCases(prac.ctx.account.id, {
    clientId: id,
    includeArchived: true,
  });
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
  let birthPlace =
    typeof body.birthPlace === "string" ? body.birthPlace : undefined;
  let birthLat: number | null | undefined =
    typeof body.birthLat === "number" ? body.birthLat : undefined;
  let birthLon: number | null | undefined =
    typeof body.birthLon === "number" ? body.birthLon : undefined;
  let birthTz: string | null | undefined =
    typeof body.birthTz === "string" ? body.birthTz : undefined;
  if (birthPlace && (birthLat == null || birthLon == null || !birthTz)) {
    const place = await geocodeAdapter.resolve(birthPlace);
    if (place) {
      birthPlace = place.label || birthPlace;
      birthLat = place.latitude;
      birthLon = place.longitude;
      birthTz = place.timezone || birthTz;
    } else {
      // Do not keep stale Moscow coords under a new unresolved label.
      birthLat = null;
      birthLon = null;
      birthTz = null;
    }
  }
  const client = await updateClient(prac.ctx.account.id, id, {
    alias: typeof body.alias === "string" ? body.alias : undefined,
    fullName: typeof body.fullName === "string" ? body.fullName : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    birthDate: typeof body.birthDate === "string" ? body.birthDate : undefined,
    birthTime: typeof body.birthTime === "string" ? body.birthTime : undefined,
    birthPlace,
    birthLat,
    birthLon,
    birthTz,
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
