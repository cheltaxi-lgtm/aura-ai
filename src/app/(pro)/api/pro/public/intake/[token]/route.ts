import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireProEnabled } from "@/modules/pro/gate";
import { submitIntake } from "@/modules/pro/db/intake";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const gated = requireProEnabled();
  if (gated) return gated;
  const { token } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    alias?: string;
    question?: string;
    birthDate?: string;
    birthPlace?: string;
    birthTz?: string;
    consentPdn?: boolean;
  };
  if (!body.alias?.trim()) {
    return NextResponse.json({ error: "alias_required" }, { status: 400 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
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
        birthPlace: body.birthPlace,
        birthTz: body.birthTz,
        consentPdn: Boolean(body.consentPdn),
      },
      ipHash
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const status = (e as { status?: number }).status || 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "error" },
      { status }
    );
  }
}
