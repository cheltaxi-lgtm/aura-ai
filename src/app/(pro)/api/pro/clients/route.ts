import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import { createClient, listClients } from "@/modules/pro/db/clients";
import { geocodeAdapter } from "@/modules/pro/adapters";

export async function GET(req: Request) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const q = new URL(req.url).searchParams.get("q") || undefined;
  const clients = await listClients(prac.ctx.account.id, q);
  return NextResponse.json({ ok: true, clients });
}

export async function POST(req: Request) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const alias = String(body.alias || "").trim();
  if (!alias) {
    return NextResponse.json({ error: "alias_required" }, { status: 400 });
  }

  let birthLat = typeof body.birthLat === "number" ? body.birthLat : null;
  let birthLon = typeof body.birthLon === "number" ? body.birthLon : null;
  let birthTz = typeof body.birthTz === "string" ? body.birthTz : null;
  const birthPlace = typeof body.birthPlace === "string" ? body.birthPlace : null;
  if (birthPlace && geocodeAdapter.isAvailable() && (birthLat == null || birthLon == null)) {
    const place = await geocodeAdapter.resolve(birthPlace);
    if (place) {
      birthLat = place.latitude;
      birthLon = place.longitude;
      birthTz = place.timezone || birthTz;
    }
  }

  try {
    const client = await createClient(
      prac.ctx.account.id,
      {
        alias,
        fullName: typeof body.fullName === "string" ? body.fullName : null,
        email: typeof body.email === "string" ? body.email : null,
        phone: typeof body.phone === "string" ? body.phone : null,
        birthDate: typeof body.birthDate === "string" ? body.birthDate : null,
        birthTime: typeof body.birthTime === "string" ? body.birthTime : null,
        birthPlace,
        birthLat,
        birthLon,
        birthTz,
        gender: typeof body.gender === "string" ? body.gender : null,
        tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
        notes: typeof body.notes === "string" ? body.notes : null,
        consentConfirmed: Boolean(body.consentConfirmed),
      },
      prac.ctx.profileUserId
    );
    return NextResponse.json({ ok: true, client });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status }
    );
  }
}
