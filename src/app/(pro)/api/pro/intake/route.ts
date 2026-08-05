import { NextResponse } from "next/server";
import { requireProPractitioner } from "@/modules/pro/auth";
import { createIntakeLink } from "@/modules/pro/db/intake";

export async function POST(req: Request) {
  const prac = await requireProPractitioner();
  if (!prac.ok) return prac.response;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const link = await createIntakeLink(
    prac.ctx.account.id,
    prac.ctx.profileUserId,
    body.name || "Бриф клиента"
  );
  return NextResponse.json({
    ok: true,
    formId: link.formId,
    url: `/pro/f/${link.rawToken}`,
    token: link.rawToken,
  });
}
