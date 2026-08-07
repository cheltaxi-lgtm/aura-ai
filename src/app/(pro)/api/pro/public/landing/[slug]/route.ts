import { NextResponse } from "next/server";
import { requireProPortalEnabled } from "@/modules/pro/gate";
import { getPublishedLandingBySlug } from "@/modules/pro/db/landings";

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const portalOff = requireProPortalEnabled();
  if (portalOff) return portalOff;

  const { slug } = await context.params;
  const landing = await getPublishedLandingBySlug(slug ?? "");
  if (!landing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(
    { ok: true, landing },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
}
