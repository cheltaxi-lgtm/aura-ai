import { after, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sanitizeHdReportText } from "@/lib/human-design";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { buildHdLockedContract } from "@/lib/hd-report-pipeline/contract";
import { generateHdReportSectional } from "@/lib/hd-report-pipeline/generate";
import { HD_PIPELINE_SECTIONS } from "@/lib/hd-report-pipeline/sections";
import { validateHdReportText } from "@/lib/hd-report-quality/validator";
import { isOpenRouterConfigured } from "@/lib/llm";
import {
  getHdChartById,
  getHdReportAdminDetail,
  HD_UUID_RE,
  listHdReportsForAdminQa,
} from "@/lib/services/human-design-service";

import { acquireHdAdminGeneration, assertHdGenerationCurrent, restoreHdGeneration, saveHdGeneration } from '@/lib/services/hd-generation-service';

export const maxDuration = 800;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    if (!HD_UUID_RE.test(id)) {
      return NextResponse.json({ error: "bad_id" }, { status: 400 });
    }
    const row = await getHdReportAdminDetail(id);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({
      report: row,
      sections: [...HD_PIPELINE_SECTIONS],
    });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
  const items = await listHdReportsForAdminQa(limit);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    reportId?: string;
    sectionTitle?: string;
  };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({error:'bad_request'},{status:400});
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  if (!HD_UUID_RE.test(reportId)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  if (body.action === "approve") {
    const row = await getHdReportAdminDetail(reportId);
    if (!row || row.status !== "needs_regeneration" || !row.reportText || !row.chartSnapshot) return NextResponse.json({ ok: false }, { status: 409 });
    const quality = validateHdReportText(row.reportText, { contract: buildHdLockedContract(row.chartSnapshot.chart) });
    if (!quality.ok) return NextResponse.json({ ok: false, qualityFindings: quality.findings }, { status: 409 });
    const guard = await acquireHdAdminGeneration(reportId, row.userId).catch(() => null);
    if (!guard) return NextResponse.json({ ok: false }, { status: 409 });
    try {
      const saved = await saveHdGeneration(guard, row.reportText, row.model ?? "manual", [row.chartSnapshot]);
      return NextResponse.json({ ok: Boolean(saved) }, { status: saved ? 200 : 409 });
    } catch {
      await restoreHdGeneration(guard);
      return NextResponse.json({ ok: false }, { status: 409 });
    }
  }

  if (body.action === "regenerate" || body.action === "regenerate_section") {
    if (!isOpenRouterConfigured()) {
      return NextResponse.json({ error: "llm_unavailable" }, { status: 503 });
    }
    const row = await getHdReportAdminDetail(reportId);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (body.action === "regenerate_section" && !row.chartSnapshot) {
      return NextResponse.json({ error: "Для старого отчёта без снимка карты доступна только полная перегенерация." }, { status: 409 });
    }
    const sectionTitle =
      typeof body.sectionTitle === "string" ? body.sectionTitle.trim() : "";
    const onlyTitles =
      body.action === "regenerate_section" && sectionTitle
        ? [sectionTitle]
        : null;

    if (body.action === "regenerate_section" && (!sectionTitle || !HD_PIPELINE_SECTIONS.some(t => t === sectionTitle))) {
      return NextResponse.json({ error: "section_required" }, { status: 400 });
    }

    const chartRow = body.action === "regenerate_section" ? row.chartSnapshot : await getHdChartById(row.chartId);
    if (!chartRow) return NextResponse.json({ error: "chart_missing" }, { status: 404 });

    const guard = await acquireHdAdminGeneration(reportId,row.userId).catch(() => null);
    const claimed=Boolean(guard);
    if (!claimed || !guard) {
      return NextResponse.json(
        { error: "report_state_changed", message: "Статус отчёта уже изменился. Обновите список и повторите попытку." },
        { status: 409 }
      );
    }

    const chart =
      chartRow.chart ||
      calculateHdChart({
        birthDate: chartRow.birthDate,
        birthTime: chartRow.birthTime,
        timezone: chartRow.timezone,
      });

    // Generation takes 6–13 min — run it after the response instead of
    // holding the admin browser fetch open. UI polls report status.
    after(async () => {
      try {
        const generated = await generateHdReportSectional({
          chart,
          clientName: chartRow.subjectName,
          aboutOther: chartRow.subjectKind === "other",
          placeLabel: chartRow.placeName,
          maxSectionRetries: 2,
          onlyTitles,
          priorText: onlyTitles ? row.reportText : null,
          beforeRequest: () => assertHdGenerationCurrent(guard),
          gender:chartRow.gender,
        });

        if (!generated.text || generated.needsRegeneration) {
          await restoreHdGeneration(guard);
          return;
        }
        const saved = await saveHdGeneration(guard,sanitizeHdReportText(generated.text),generated.modelId,[chartRow],
          {costRub:generated.costRub,usage:generated.usage,calls:generated.llmCalls});
        if (!saved) await restoreHdGeneration(guard);
      } catch (e) {
        console.error("[admin/hd-reports] regenerate failed", e);
        await restoreHdGeneration(guard).catch(() => undefined);
      }
    });
    return NextResponse.json({ok:true,started:true},{status:202});
  }
  if (body.action === "validate") {
    const row = await getHdReportAdminDetail(reportId);
    if (!row?.reportText) return NextResponse.json({error:"no_text"},{status:404});
    return NextResponse.json({quality:validateHdReportText(row.reportText,{contract:row.chartSnapshot ? buildHdLockedContract(row.chartSnapshot.chart) : null})});
  }
  return NextResponse.json({error:"unknown_action"},{status:400});
}
