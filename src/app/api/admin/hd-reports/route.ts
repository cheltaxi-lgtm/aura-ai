import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { sanitizeHdReportText } from "@/lib/human-design";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { buildHdLockedContract } from "@/lib/hd-report-pipeline/contract";
import { generateHdReportSectional } from "@/lib/hd-report-pipeline/generate";
import { HD_PIPELINE_SECTIONS } from "@/lib/hd-report-pipeline/sections";
import { validateHdReportText } from "@/lib/hd-report-quality/validator";
import { isOpenRouterConfigured } from "@/lib/llm";
import {
  approveHdReportManually,
  beginHdReportQualityResume,
  completeHdReport,
  getHdChartById,
  getHdReportAdminDetail,
  HD_UUID_RE,
  listHdReportsForAdminQa,
  markHdReportNeedsRegeneration,
} from "@/lib/services/human-design-service";

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
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  if (!HD_UUID_RE.test(reportId)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }

  if (body.action === "approve") {
    const ok = await approveHdReportManually(reportId);
    return NextResponse.json({ ok });
  }

  if (body.action === "regenerate" || body.action === "regenerate_section") {
    if (!isOpenRouterConfigured()) {
      return NextResponse.json({ error: "llm_unavailable" }, { status: 503 });
    }
    const row = await getHdReportAdminDetail(reportId);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const chartRow = await getHdChartById(row.chartId);
    if (!chartRow) return NextResponse.json({ error: "chart_missing" }, { status: 404 });

    await beginHdReportQualityResume(reportId).catch(() => false);

    const chart =
      chartRow.chart ||
      calculateHdChart({
        birthDate: chartRow.birthDate,
        birthTime: chartRow.birthTime,
        timezone: chartRow.timezone,
      });

    const sectionTitle =
      typeof body.sectionTitle === "string" ? body.sectionTitle.trim() : "";
    const onlyTitles =
      body.action === "regenerate_section" && sectionTitle
        ? [sectionTitle]
        : null;

    if (body.action === "regenerate_section" && !sectionTitle) {
      return NextResponse.json({ error: "section_required" }, { status: 400 });
    }

    const generated = await generateHdReportSectional({
      chart,
      clientName: chartRow.subjectName,
      aboutOther: chartRow.subjectKind === "other",
      maxSectionRetries: 2,
      onlyTitles,
      priorText: onlyTitles ? row.reportText : null,
    });

    if (!generated.text) {
      return NextResponse.json({ error: "generation_failed" }, { status: 502 });
    }

    if (generated.needsRegeneration) {
      await markHdReportNeedsRegeneration(
        reportId,
        sanitizeHdReportText(generated.text),
        generated.quality.findings
      );
      return NextResponse.json({
        ok: false,
        needsRegeneration: true,
        findings: generated.quality.findings,
        costRub: generated.costRub,
        llmCalls: generated.llmCalls,
      });
    }

    await completeHdReport(
      reportId,
      sanitizeHdReportText(generated.text),
      generated.modelId || "openrouter",
      {
        costRub: generated.costRub,
        llmCalls: generated.llmCalls,
        tokenUsage: generated.usage,
        qualityFindings: [],
      }
    );
    return NextResponse.json({
      ok: true,
      needsRegeneration: false,
      costRub: generated.costRub,
      llmCalls: generated.llmCalls,
    });
  }

  if (body.action === "validate") {
    const row = await getHdReportAdminDetail(reportId);
    if (!row?.reportText) return NextResponse.json({ error: "no_text" }, { status: 404 });
    const chartRow = await getHdChartById(row.chartId);
    const contract = chartRow ? buildHdLockedContract(chartRow.chart) : null;
    const quality = validateHdReportText(row.reportText, {
      engineTypeRu: contract?.typeRu ?? null,
      motorCount: contract?.motorCentersDefinedRu.length ?? null,
      contract,
      requireFocusAnswer: true,
    });
    return NextResponse.json({ quality });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
