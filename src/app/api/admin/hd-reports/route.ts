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
  approveHdReportManually,
  beginHdReportQualityResume,
  beginHdReportRewrite,
  completeHdReport,
  failHdReport,
  getHdChartById,
  getHdReportAdminDetail,
  HD_UUID_RE,
  listHdReportsForAdminQa,
  markHdReportNeedsRegeneration,
  restoreHdReportDone,
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
    if (body.action === "regenerate_section" && !row.chartSnapshot) {
      return NextResponse.json({ error: "Для старого отчёта без снимка карты доступна только полная перегенерация." }, { status: 409 });
    }
    const sectionTitle =
      typeof body.sectionTitle === "string" ? body.sectionTitle.trim() : "";
    const onlyTitles =
      body.action === "regenerate_section" && sectionTitle
        ? [sectionTitle]
        : null;

    if (body.action === "regenerate_section" && !sectionTitle) {
      return NextResponse.json({ error: "section_required" }, { status: 400 });
    }

    const chartRow = body.action === "regenerate_section" ? row.chartSnapshot : await getHdChartById(row.chartId);
    if (!chartRow) return NextResponse.json({ error: "chart_missing" }, { status: 404 });

    const rewritingDoneReport = row.status === "done";
    const claimed = rewritingDoneReport
      ? await beginHdReportRewrite(reportId).catch(() => false)
      : await beginHdReportQualityResume(reportId).catch(() => false);
    if (!claimed) {
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
        });

        if (!generated.text) {
          if (rewritingDoneReport) {
            await restoreHdReportDone(reportId).catch(() => undefined);
          } else {
            await failHdReport(reportId, "generation_failed").catch(() => undefined);
          }
          return;
        }

        if (generated.needsRegeneration) {
          if (rewritingDoneReport) {
            await restoreHdReportDone(reportId);
          } else {
            await markHdReportNeedsRegeneration(
              reportId,
              sanitizeHdReportText(generated.text),
              generated.quality.findings,
              chartRow
            );
          }
          return;
        }

        const saved = await completeHdReport(
          reportId,
          sanitizeHdReportText(generated.text),
          generated.modelId || "openrouter",
          {
            chartSnapshot: chartRow,
            costRub: generated.costRub,
            llmCalls: generated.llmCalls,
            tokenUsage: generated.usage,
            qualityFindings: [],
          }
        );
        if (!saved && rewritingDoneReport) {
          await restoreHdReportDone(reportId).catch(() => undefined);
        }
      } catch (e) {
        console.error("[admin/hd-reports] regenerate failed", e);
        if (rewritingDoneReport) {
          await restoreHdReportDone(reportId).catch(() => undefined);
        } else {
          await failHdReport(reportId, "generation_exception").catch(() => undefined);
        }
      }
    });
    return NextResponse.json({ ok: true, started: true }, { status: 202 });
  }

  if (body.action === "validate") {
    const row = await getHdReportAdminDetail(reportId);
    if (!row?.reportText) return NextResponse.json({ error: "no_text" }, { status: 404 });
    const chartRow = row.chartSnapshot;
    const contract = chartRow
      ? buildHdLockedContract(chartRow.chart, { placeLabel: chartRow.placeName })
      : null;
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
