import { NextRequest, NextResponse } from "next/server";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { runSeoLandingAudit } from "@/modules/ads/organic/audit";
import { decideExperiment, listSeoExperiments } from "@/modules/ads/organic/seo-rules";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const audit = request.nextUrl.searchParams.get("audit") === "1";
  try {
    const experiments = await listSeoExperiments(150);
    const report = audit ? await runSeoLandingAudit() : null;
    return NextResponse.json({ ok: true, experiments, audit: report });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        experiments: [],
        audit: null,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;
  const body = (await req.json().catch(() => ({}))) as {
    experimentId?: string;
    result?: "KEEP" | "ROLLBACK" | "NEXT";
  };
  if (!body.experimentId || !body.result) {
    return NextResponse.json({ error: "experimentId_and_result_required" }, { status: 400 });
  }
  try {
    await decideExperiment(body.experimentId, body.result);
    await writeAdsAdminAction({
      adminId: auth.sub,
      action: "seo_experiment_result",
      payload: body,
      entityType: "ads_seo_experiment",
      entityId: body.experimentId,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
