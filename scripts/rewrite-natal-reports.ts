/**
 * Rewrite existing natal_report_history rows with the current quality pipeline.
 * Does not charge runes; preserves charge_transaction_id / rune_cost.
 *
 * Usage (on app host):
 *   node --env-file=.env.local --import tsx scripts/rewrite-natal-reports.ts --dry-run
 *   node --env-file=.env.local --import tsx scripts/rewrite-natal-reports.ts
 *   node --env-file=.env.local --import tsx scripts/rewrite-natal-reports.ts --limit 2
 *   node --env-file=.env.local --import tsx scripts/rewrite-natal-reports.ts --only interpretation
 *   node --env-file=.env.local --import tsx scripts/rewrite-natal-reports.ts --only forecast
 */
import { ensureDb, query } from "@/lib/db";
import type { ChatMessage } from "@/lib/llm";
import {
  buildNatalEvidence,
  formatEvidencePrompt,
  formatEvidencePromptCompact,
  selectEvidenceForForecastPrompt,
  type NatalEvidence,
} from "@/lib/natal/evidence";
import { generateValidatedNatalReport } from "@/lib/natal/generate-validated-report";
import { appendNatalPersonalizationLens } from "@/lib/natal/personalization-lens";
import {
  buildNatalReportJsonInstructions,
  natalReportToPlainText,
  type NatalReport,
} from "@/lib/natal/report";
import type { NatalChartRecord, NatalTradition } from "@/lib/natal/types";
import { parseTimingHorizon, type PersonalTimingResult } from "@/lib/natal/timing";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { getOrComputeNatalChart } from "@/lib/services/natal-chart-service";
import { getOrComputePersonalTiming } from "@/lib/services/natal-timing-service";
import { getUserById } from "@/lib/users";

const INTERPRETATION_METADATA_DEFAULTS = {
  disclaimer:
    "Астрологическая трактовка является символической интерпретацией и не заменяет профессиональную консультацию.",
  methodology:
    "Отчёт построен по рассчитанным натальным положениям и аспектам. Каждый вывод связан с указанными evidence.",
};

const FORECAST_METADATA_DEFAULTS = {
  disclaimer:
    "Астрологический прогноз является символической интерпретацией вероятных тем и не гарантирует событий, не заменяет медицинскую, юридическую или финансовую консультацию.",
  methodology:
    "Прогноз построен по рассчитанным транзитам, солнечному возвращению и вторичным прогрессиям выбранного периода. Каждый вывод связан с указанными timing evidence; натальные положения используются только как дополнительный контекст.",
};

type HistoryRow = {
  id: string;
  user_id: string;
  birth_fingerprint: string;
  engine_version: string;
  ephemeris: string;
  tradition: NatalTradition;
  report_type: string;
  evidence_refs: unknown;
  created_at: Date | string;
  updated_at: Date | string;
};

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const onlyRaw = argv.find((a) => a.startsWith("--only="))?.slice("--only=".length)
    ?? (argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null);
  const only =
    onlyRaw === "interpretation" || onlyRaw === "forecast" ? onlyRaw : null;
  const limitRaw = argv.find((a) => a.startsWith("--limit="))?.slice("--limit=".length)
    ?? (argv.includes("--limit") ? argv[argv.indexOf("--limit") + 1] : null);
  const limit = limitRaw ? Math.max(1, Math.floor(Number(limitRaw))) : null;
  const idRaw = argv.find((a) => a.startsWith("--id="))?.slice("--id=".length)
    ?? (argv.includes("--id") ? argv[argv.indexOf("--id") + 1] : null);
  return { dryRun, only, limit: Number.isFinite(limit) ? limit : null, id: idRaw?.trim() || null };
}

function parseForecastReportType(
  reportType: string
): { horizon: number; windowStart: string | null } | null {
  const withWindow = /^forecast:(\d+):(\d{4}-\d{2}-\d{2})$/.exec(reportType);
  if (withWindow) {
    const horizon = Number(withWindow[1]);
    if (!Number.isFinite(horizon) || horizon <= 0) return null;
    return { horizon, windowStart: withWindow[2] };
  }
  // Legacy rows before windowStart was part of report_type.
  const horizonOnly = /^forecast:(\d+)$/.exec(reportType);
  if (!horizonOnly) return null;
  const horizon = Number(horizonOnly[1]);
  if (!Number.isFinite(horizon) || horizon <= 0) return null;
  return { horizon, windowStart: null };
}

function asEvidenceArray(raw: unknown): NatalEvidence[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.label !== "string" || typeof row.value !== "string") {
      return null;
    }
  }
  return raw as NatalEvidence[];
}

function chartMatchesRow(chart: NatalChartRecord, row: HistoryRow): boolean {
  const ephemeris =
    chart.western && typeof chart.western.ephemeris === "string"
      ? chart.western.ephemeris
      : "unknown";
  return (
    chart.birthFingerprint === row.birth_fingerprint &&
    chart.engineVersion === row.engine_version &&
    ephemeris === row.ephemeris
  );
}

async function loadRows(opts: {
  only: "interpretation" | "forecast" | null;
  limit: number | null;
  id: string | null;
}): Promise<HistoryRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts.id) {
    params.push(opts.id);
    clauses.push(`id = $${params.length}`);
  }
  if (opts.only === "interpretation") {
    clauses.push(`report_type = 'interpretation'`);
  } else if (opts.only === "forecast") {
    clauses.push(`report_type LIKE 'forecast:%'`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limitSql = opts.limit ? `LIMIT ${opts.limit}` : "";
  const { rows } = await query<HistoryRow>(
    `SELECT id, user_id, birth_fingerprint, engine_version, ephemeris, tradition,
            report_type, evidence_refs, created_at, updated_at
     FROM natal_report_history
     ${where}
     ORDER BY created_at ASC, id ASC
     ${limitSql}`,
    params
  );
  return rows;
}

async function resolveEvidence(
  row: HistoryRow,
  chart: NatalChartRecord
): Promise<{
  evidence: NatalEvidence[];
  promptEvidence: NatalEvidence[];
  timing: PersonalTimingResult | null;
  horizonDays?: number;
  windowStart?: string;
  windowEnd?: string;
}> {
  if (row.report_type === "interpretation") {
    let timing: PersonalTimingResult | null = null;
    try {
      timing = (
        await getOrComputePersonalTiming(row.user_id, 7).catch(() => null)
      )?.timing ?? null;
    } catch {
      timing = null;
    }
    const evidence = buildNatalEvidence(chart, { tradition: row.tradition, timing });
    return { evidence, promptEvidence: evidence, timing };
  }

  const parsed = parseForecastReportType(row.report_type);
  if (!parsed) throw new Error(`unsupported_report_type:${row.report_type}`);
  const horizon = parseTimingHorizon(parsed.horizon);
  if (!horizon) throw new Error(`unsupported_horizon:${parsed.horizon}`);

  const stored = asEvidenceArray(row.evidence_refs);
  const storedTiming = stored?.filter((item) => item.tradition === "timing") ?? [];
  // Prefer immutable stored evidence so historical windows stay grounded.
  if (stored && storedTiming.length > 0) {
    const promptEvidence = selectEvidenceForForecastPrompt(stored, horizon);
    return {
      evidence: stored,
      promptEvidence,
      timing: null,
      horizonDays: horizon,
      windowStart: parsed.windowStart ?? undefined,
    };
  }

  if (!parsed.windowStart) {
    throw new Error("legacy_forecast_missing_stored_timing_evidence");
  }

  const referenceDate = new Date(`${parsed.windowStart}T12:00:00.000Z`);
  const { timing } = await getOrComputePersonalTiming(row.user_id, horizon, {
    referenceDate,
    force: true,
  });
  const evidence = buildNatalEvidence(chart, { tradition: "western", timing });
  const promptEvidence = selectEvidenceForForecastPrompt(evidence, horizon);
  return {
    evidence,
    promptEvidence,
    timing,
    horizonDays: horizon,
    windowStart: timing.windowStart,
    windowEnd: timing.windowEnd,
  };
}

async function generateForRow(
  row: HistoryRow,
  chart: NatalChartRecord
): Promise<{ report: NatalReport; evidence: NatalEvidence[]; plain: string }> {
  const user = await getUserById(row.user_id).catch(() => null);
  const clientDisplayName = normalizePersonDisplayName(user?.name) || null;
  const resolved = await resolveEvidence(row, chart);

  if (row.report_type === "interpretation") {
    const evidenceIds = resolved.promptEvidence.map((item) => item.id);
    if (!evidenceIds.length) throw new Error("empty_evidence");
    const traditionLabel =
      row.tradition === "western" ? "западную тропическую" : "ведическую сидерическую";
    const systemPrompt = await appendNatalPersonalizationLens(
      await wrapSystemPrompt(`Ты — Shri Raj, мастер астрологии Zovus. Составь плотную доказуемую ${traditionLabel} натальную трактовку на русском языке.
Опирайся ТОЛЬКО на evidence ниже. Нельзя выдумывать положения, дома, даты или evidence ID.
Пиши премиально и по-человечески: коротко, без воды. Каждый вывод — из расчёта карты.
${buildNatalReportJsonInstructions(row.tradition)}
${chart.timeKnown ? "" : "Время рождения неизвестно: не заявляй дома, ASC, MC или лагну; явно отрази неопределённость."}
Координаты рождения не переданы и не нужны.
${clientDisplayName ? `Имя клиента в тексте: «${clientDisplayName}» — только кириллица, без латиницы и смешанных написаний.` : ""}

EVIDENCE:
${formatEvidencePrompt(resolved.promptEvidence)}

VALID EVIDENCE ID:
${evidenceIds.join("\n")}`),
      { profileUserId: row.user_id, user }
    );
    const generated = await generateValidatedNatalReport({
      baseMessages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Создай отчёт для ${clientDisplayName ?? "клиента"}. Верни только JSON.`,
        },
      ] satisfies ChatMessage[],
      evidence: resolved.promptEvidence,
      tradition: row.tradition,
      reportType: "interpretation",
      metadataDefaults: INTERPRETATION_METADATA_DEFAULTS,
      evidenceIdsHint: evidenceIds,
      repairHint: "Используй только ID из списка VALID EVIDENCE ID.",
      clientName: clientDisplayName ?? undefined,
    });
    if (!generated.ok) {
      throw new Error(`validation_failed:${generated.errors.slice(0, 6).join(" | ")}`);
    }
    return {
      report: generated.report,
      evidence: resolved.evidence,
      plain: natalReportToPlainText(generated.report),
    };
  }

  const horizon = resolved.horizonDays!;
  const windowStart =
    resolved.windowStart ??
    parseForecastReportType(row.report_type)?.windowStart ??
    "расчётный период";
  const windowEnd =
    resolved.windowEnd ??
    resolved.timing?.windowEnd ??
    (windowStart === "расчётный период" ? "расчётный период" : windowStart);
  const timingEvidenceIds = resolved.promptEvidence
    .filter((item) => item.tradition === "timing")
    .map((item) => item.id);
  if (!timingEvidenceIds.length) throw new Error("empty_timing_evidence");

  const systemPrompt = await appendNatalPersonalizationLens(
    await wrapSystemPrompt(`Ты — Shri Raj, мастер астрологии Zovus. Создай плотный персональный вероятностный прогноз на русском на период ${windowStart} — ${windowEnd}.
Опирайся ТОЛЬКО на evidence ниже. Не придумывай события, даты, положения или evidence ID. Конкретные даты называй только при наличии соответствующего evidence.
Пиши премиально и по-человечески: коротко, без воды и канцелярита. Каждый вывод — из расчёта, не из воздуха.
${buildNatalReportJsonInstructions("western", "forecast", horizon)}
Не используй фатальные формулировки.
Координаты, дата, время и город рождения не переданы.
${clientDisplayName ? `Имя клиента в тексте: «${clientDisplayName}» — только кириллица, без латиницы и смешанных написаний.` : ""}

EVIDENCE:
${formatEvidencePromptCompact(resolved.promptEvidence)}

TIMING EVIDENCE ID (обязательны в summary, currentPeriod, recommendations):
${timingEvidenceIds.join("\n")}`),
    {
      profileUserId: row.user_id,
      user,
      forecast: {
        horizonDays: horizon,
        windowStart,
        windowEnd,
      },
    }
  );

  const generated = await generateValidatedNatalReport({
    baseMessages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Создай прогноз для ${clientDisplayName ?? "клиента"} на ${horizon} дней. horizonDays в JSON должен быть ${horizon}. Верни только JSON.`,
      },
    ] satisfies ChatMessage[],
    evidence: resolved.promptEvidence,
    tradition: "western",
    reportType: "forecast",
    horizonDays: horizon,
    metadataDefaults: FORECAST_METADATA_DEFAULTS,
    evidenceIdsHint: timingEvidenceIds,
    repairHint:
      "В summary, currentPeriod и recommendations каждый claim должен ссылаться минимум на один timing evidence ID.",
    clientName: clientDisplayName ?? undefined,
  });
  if (!generated.ok) {
    throw new Error(`validation_failed:${generated.errors.slice(0, 6).join(" | ")}`);
  }
  return {
    report: generated.report,
    evidence: resolved.evidence,
    plain: natalReportToPlainText(generated.report),
  };
}

async function persistRewrite(
  row: HistoryRow,
  plain: string,
  report: NatalReport,
  evidence: NatalEvidence[]
): Promise<void> {
  await query(
    `UPDATE natal_report_history
     SET content = $2,
         structured_data = $3::jsonb,
         evidence_refs = $4::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [row.id, plain, JSON.stringify(report), JSON.stringify(evidence)]
  );

  if (row.report_type !== "interpretation") return;

  await query(
    `UPDATE natal_charts
     SET chart_data = (
           chart_data || jsonb_build_object(
             'interpretations',
             COALESCE(chart_data->'interpretations', '{}'::jsonb) ||
               jsonb_build_object($2::text, $3::text)
           )
         ) || jsonb_build_object(
           'interpretationClaims',
           COALESCE(chart_data->'interpretationClaims', '{}'::jsonb) - $2::text
         ),
         updated_at = NOW()
     WHERE user_id = $1
       AND chart_data->>'birthFingerprint' = $4
       AND engine_version = $5
       AND COALESCE(NULLIF(chart_data #>> '{western,ephemeris}', ''), 'unknown') = $6`,
    [
      row.user_id,
      row.tradition,
      plain,
      row.birth_fingerprint,
      row.engine_version,
      row.ephemeris,
    ]
  );
}

async function rewriteOne(row: HistoryRow, dryRun: boolean): Promise<string> {
  const chart = await getOrComputeNatalChart(row.user_id);
  if (!chart) return "skip:no_chart";
  if (!chartMatchesRow(chart, row)) {
    return `skip:chart_mismatch fp=${chart.birthFingerprint} eng=${chart.engineVersion}`;
  }
  if (row.report_type === "interpretation" && !chart[row.tradition]) {
    return `skip:missing_tradition:${row.tradition}`;
  }
  if (row.report_type.startsWith("forecast:") && !chart.western) {
    return "skip:missing_western";
  }

  if (dryRun) {
    const stored = asEvidenceArray(row.evidence_refs);
    const timingN = stored?.filter((e) => e.tradition === "timing").length ?? 0;
    return `dry-run evidence=${stored?.length ?? 0} timing=${timingN}`;
  }

  const { report, evidence, plain } = await generateForRow(row, chart);
  if (!plain.trim() || plain.trim().length < 400) {
    throw new Error(`thin_output len=${plain.trim().length}`);
  }
  await persistRewrite(row, plain, report, evidence);
  return `ok len=${plain.length} sections=${report.sections.length} evidence=${evidence.length}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!(await ensureDb())) {
    console.error("DB unavailable");
    process.exit(1);
  }

  const rows = await loadRows(opts);
  console.log(
    `rewrite-natal-reports rows=${rows.length} dryRun=${opts.dryRun} only=${opts.only ?? "all"}`
  );
  if (!rows.length) {
    console.log("nothing to rewrite");
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    const label = `${row.id.slice(0, 8)} ${row.report_type} user=${row.user_id.slice(0, 8)}`;
    try {
      console.log(`[start] ${label}`);
      const result = await rewriteOne(row, opts.dryRun);
      if (result.startsWith("skip:") || result.startsWith("dry-run")) {
        skipped += 1;
        console.log(`[skip] ${label} ${result}`);
      } else {
        ok += 1;
        console.log(`[ok] ${label} ${result}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`[fail] ${label}`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`done ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
