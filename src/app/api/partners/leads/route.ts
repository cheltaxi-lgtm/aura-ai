import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { clientIp } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";
import { createPartnerLead } from "@/lib/partner-leads";
import { emailPartnerLeadCreated } from "@/lib/email/partner-notify";

export async function POST(request: NextRequest) {
  await ensureDb();

  const ip = clientIp(request);
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("partner_lead", ip),
    5,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSec },
      { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined }
    );
  }

  const body = await request.json().catch(() => ({}));

  // Honeypot — bots fill hidden fields.
  if (typeof body.website_url === "string" && body.website_url.trim()) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const recaptchaToken = typeof body.recaptchaToken === "string" ? body.recaptchaToken : undefined;
  const captchaBlock = await enforceRecaptchaScope("partners", recaptchaToken, request);
  if (captchaBlock) return captchaBlock;

  try {
    const lead = await createPartnerLead({
      contactName: typeof body.name === "string" ? body.name : "",
      phone: typeof body.phone === "string" ? body.phone : "",
      email: typeof body.email === "string" ? body.email : "",
      company: typeof body.company === "string" ? body.company : "",
      website: typeof body.website === "string" ? body.website : null,
      message: typeof body.message === "string" ? body.message : "",
    });

    void emailPartnerLeadCreated({
      leadId: lead.id,
      contactName: lead.contact_name,
      phone: lead.phone,
      email: lead.email,
      company: lead.company,
      website: lead.website,
      messagePreview: lead.message,
    });

    return NextResponse.json({ ok: true, id: lead.id }, { status: 201 });
  } catch (err) {
    const code = err instanceof Error ? err.message : "unknown";
    if (
      code === "name_required" ||
      code === "phone_invalid" ||
      code === "email_invalid" ||
      code === "company_required" ||
      code === "message_required"
    ) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    throw err;
  }
}
