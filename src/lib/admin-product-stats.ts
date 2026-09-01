import { query } from "@/lib/db";
import { RUNE_ACTION_LABELS, type RuneActionType } from "@/lib/rune-costs";

export type ProductSectionId =
  | "aura"
  | "palm"
  | "photo"
  | "natal"
  | "matrix"
  | "hd"
  | "tarot"
  | "joint"
  | "daily"
  | "other";

export type ProductSectionStats = {
  id: ProductSectionId;
  label: string;
  spend7d: number;
  spend30d: number;
  spendAll: number;
  runes7d: number;
  runes30d: number;
  runesAll: number;
  refunds30d: number;
  jobsPending: number;
  jobsFailed30d: number;
  extras: { label: string; value: number }[];
};

const SECTION_ACTIONS: { id: ProductSectionId; label: string; actions: RuneActionType[] }[] = [
  { id: "aura", label: "Аура по фото", actions: ["AURA_READING"] },
  { id: "palm", label: "Гадание по ладони", actions: ["PALM_READING"] },
  { id: "photo", label: "Фото-расклад", actions: ["VISION_ANALYSIS"] },
  {
    id: "natal",
    label: "Натальная карта",
    actions: ["NATAL_READING", "FORECAST_REPORT", "SYNASTRY_REPORT"],
  },
  {
    id: "matrix",
    label: "Матрица судьбы",
    actions: [
      "NUMEROLOGY_SESSION",
      "MATRIX_SUBJECT_REPORT",
      "CHILD_MATRIX_REPORT",
      "MATRIX_PAIR_REPORT",
      "MATRIX_YEAR_FORECAST",
    ],
  },
  { id: "hd", label: "Дизайн человека", actions: ["HD_REPORT", "HD_COMPOSITE_REPORT", "HD_ASK"] },
  {
    id: "tarot",
    label: "Таро и чат",
    actions: [
      "QUESTION",
      "READING",
      "INTENTION_SPREAD",
      "DESTINY_CARD",
      "SCENE_ILLUSTRATION",
      "TAROT_ATMOSPHERE",
      "FINAL_REPORT",
    ],
  },
  { id: "joint", label: "Совместные расклады", actions: ["JOINT_READING"] },
  { id: "daily", label: "Карта дня", actions: ["DAILY_AMULET", "DAILY_EXTENDED"] },
];

const JOB_KINDS: Record<ProductSectionId, string[]> = {
  aura: ["aura_reading"],
  palm: ["palm_reading"],
  photo: ["photo_reading"],
  natal: ["natal_interpretation", "natal_forecast", "natal_compatibility"],
  matrix: ["numerology_reading"],
  hd: ["hd_report", "hd_composite_report"],
  tarot: ["reading", "intention_spread"],
  joint: ["joint_reading", "joint_combined"],
  daily: ["daily_reading", "daily_extended"],
  other: [],
};

function actionToSection(action: string): ProductSectionId {
  for (const section of SECTION_ACTIONS) {
    if ((section.actions as string[]).includes(action)) return section.id;
  }
  return "other";
}

function emptySection(id: ProductSectionId, label: string): ProductSectionStats {
  return {
    id,
    label,
    spend7d: 0,
    spend30d: 0,
    spendAll: 0,
    runes7d: 0,
    runes30d: 0,
    runesAll: 0,
    refunds30d: 0,
    jobsPending: 0,
    jobsFailed30d: 0,
    extras: [],
  };
}

export async function getProductSectionStats(): Promise<{
  sections: ProductSectionStats[];
  actions: {
    action: string;
    label: string;
    spend30d: number;
    runes30d: number;
  }[];
}> {
  const [spend, jobs, snapshots, history] = await Promise.all([
    query<{
      action_type: string;
      type: string;
      n7: string;
      n30: string;
      nall: string;
      r7: string;
      r30: string;
      rall: string;
    }>(`
      SELECT
        COALESCE(action_type, '') AS action_type,
        type,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS n7,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS n30,
        COUNT(*)::text AS nall,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::text AS r7,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0)::text AS r30,
        COALESCE(SUM(ABS(amount)), 0)::text AS rall
      FROM rune_transactions
      WHERE type IN ('spend', 'refund')
        AND action_type IS NOT NULL
        AND action_type <> ''
      GROUP BY action_type, type
    `),
    query<{ kind: string; pending: string; failed30: string }>(`
      SELECT
        kind,
        COUNT(*) FILTER (WHERE status IN ('pending', 'running'))::text AS pending,
        COUNT(*) FILTER (
          WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '30 days'
        )::text AS failed30
      FROM async_jobs
      GROUP BY kind
    `).catch(() => ({ rows: [] as { kind: string; pending: string; failed30: string }[] })),
    query<{ all: string; claimed: string; d30: string }>(`
      SELECT
        COUNT(*)::text AS all,
        COUNT(*) FILTER (WHERE claimed_user_id IS NOT NULL)::text AS claimed,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS d30
      FROM aura_guest_snapshots
    `).catch(() => ({ rows: [{ all: "0", claimed: "0", d30: "0" }] })),
    query<{ typ: string; n30: string }>(`
      SELECT
        COALESCE(context_data->>'type', '') AS typ,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS n30
      FROM history
      WHERE context_data->>'type' IS NOT NULL
      GROUP BY 1
    `).catch(() => ({ rows: [] as { typ: string; n30: string }[] })),
  ]);

  const byId = new Map<ProductSectionId, ProductSectionStats>();
  for (const spec of SECTION_ACTIONS) {
    byId.set(spec.id, emptySection(spec.id, spec.label));
  }
  byId.set("other", emptySection("other", "Прочее"));

  const actionRows: {
    action: string;
    label: string;
    spend30d: number;
    runes30d: number;
  }[] = [];

  for (const row of spend.rows) {
    const section = byId.get(actionToSection(row.action_type));
    if (!section) continue;
    const n7 = parseInt(row.n7, 10) || 0;
    const n30 = parseInt(row.n30, 10) || 0;
    const nall = parseInt(row.nall, 10) || 0;
    const r7 = parseInt(row.r7, 10) || 0;
    const r30 = parseInt(row.r30, 10) || 0;
    const rall = parseInt(row.rall, 10) || 0;
    if (row.type === "refund") {
      section.refunds30d += n30;
      continue;
    }
    section.spend7d += n7;
    section.spend30d += n30;
    section.spendAll += nall;
    section.runes7d += r7;
    section.runes30d += r30;
    section.runesAll += rall;
    actionRows.push({
      action: row.action_type,
      label: RUNE_ACTION_LABELS[row.action_type as RuneActionType] ?? row.action_type,
      spend30d: n30,
      runes30d: r30,
    });
  }

  for (const row of jobs.rows) {
    const pending = parseInt(row.pending, 10) || 0;
    const failed = parseInt(row.failed30, 10) || 0;
    let placed = false;
    for (const [id, kinds] of Object.entries(JOB_KINDS) as [ProductSectionId, string[]][]) {
      if (!kinds.includes(row.kind)) continue;
      const section = byId.get(id);
      if (!section) continue;
      section.jobsPending += pending;
      section.jobsFailed30d += failed;
      placed = true;
    }
    if (!placed) {
      const other = byId.get("other");
      if (other) {
        other.jobsPending += pending;
        other.jobsFailed30d += failed;
      }
    }
  }

  const snap = snapshots.rows[0];
  const aura = byId.get("aura");
  if (aura && snap) {
    aura.extras.push(
      { label: "Снимки поля за 30 дней", value: parseInt(snap.d30, 10) || 0 },
      { label: "Снимков всего", value: parseInt(snap.all, 10) || 0 },
      { label: "Привязано к аккаунту", value: parseInt(snap.claimed, 10) || 0 }
    );
  }

  for (const row of history.rows) {
    if (row.typ === "aura_reading") {
      aura?.extras.push({
        label: "Записей в истории за 30 дней",
        value: parseInt(row.n30, 10) || 0,
      });
    }
    if (row.typ === "palm_reading") {
      byId.get("palm")?.extras.push({
        label: "Записей в истории за 30 дней",
        value: parseInt(row.n30, 10) || 0,
      });
    }
  }

  const sections = [...SECTION_ACTIONS.map((s) => byId.get(s.id)!), byId.get("other")!].filter(
    (s) => s.spendAll > 0 || s.jobsPending > 0 || s.extras.some((e) => e.value > 0)
  );

  actionRows.sort((a, b) => b.runes30d - a.runes30d);

  return { sections, actions: actionRows };
}
