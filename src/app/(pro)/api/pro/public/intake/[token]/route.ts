import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireProEnabled } from "@/modules/pro/gate";
import { getIntakeFormPublicMeta, submitIntake } from "@/modules/pro/db/intake";
import { getAccountById } from "@/modules/pro/db/accounts";
import { geocodeAdapter } from "@/modules/pro/adapters";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { notifyProIntakeSubmitted } from "@/lib/email/pro-notify";

type Ctx = { params: Promise<{ token: string }> };

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    ""
  );
}

function rateLimited(retryAfterSec?: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limit", retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 60) } }
  );
}

/** Public form meta so the page can validate the link before the user fills it. */
export async function GET(req: Request, ctx: Ctx) {
  const gated = requireProEnabled();
  if (gated) return gated;
  const ip = clientIp(req) || "unknown";
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("pro_intake_meta", ip),
    30,
    60_000
  );
  if (!allowed) return rateLimited(retryAfterSec);

  const { token } = await ctx.params;
  const meta = await getIntakeFormPublicMeta(token);
  if (!meta) {
    return NextResponse.json({ error: "intake_not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, name: meta.name, practitionerName: meta.practitionerName });
}

export async function POST(req: Request, ctx: Ctx) {
  const gated = requireProEnabled();
  if (gated) return gated;
  const { token } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    alias?: string;
    question?: string;
    birthDate?: string;
    birthPlace?: string;
    birthTime?: string;
    birthTz?: string;
    caseType?: string;
    consentPdn?: boolean;
    website?: string; // honeypot — humans never fill it
  };

  // Honeypot: pretend success, store nothing.
  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ ok: true });
  }

  const ip = clientIp(req);
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("pro_intake_submit", ip || "unknown"),
    10,
    600_000
  );
  if (!allowed) return rateLimited(retryAfterSec);

  if (!body.alias?.trim()) {
    return NextResponse.json({ error: "alias_required" }, { status: 400 });
  }

  // Best-effort geocoding so the practitioner gets lat/lon/tz, not raw text.
  let geo: { lat: number; lon: number; tz: string } | null = null;
  const birthPlace = body.birthPlace?.trim();
  if (birthPlace && !body.birthTz?.trim()) {
    try {
      const place = await geocodeAdapter.resolve(birthPlace);
      if (place) {
        geo = { lat: place.latitude, lon: place.longitude, tz: place.timezone };
      }
    } catch {
      geo = null;
    }
  }

  const ipHash = ip
    ? createHash("sha256").update(ip).digest("hex").slice(0, 32)
    : null;
  try {
    const result = await submitIntake(
      token,
      {
        alias: body.alias.trim(),
        question: body.question,
        birthDate: body.birthDate,
        birthPlace,
        birthTime: body.birthTime,
        birthTz: body.birthTz ?? geo?.tz,
        birthLat: geo?.lat ?? null,
        birthLon: geo?.lon ?? null,
        caseType: body.caseType,
        consentPdn: Boolean(body.consentPdn),
      },
      ipHash
    );
    void (async () => {
      const account = await getAccountById(result.accountId);
      if (account) {
        await notifyProIntakeSubmitted({
          profileUserId: account.user_id,
          alias: body.alias!.trim(),
          caseId: result.caseId,
        });
      }
    })().catch(() => {});
    return NextResponse.json({ ok: true, clientId: result.clientId, caseId: result.caseId });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status }
    );
  }
}
