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
  spend90d: number;
  spendAll: number;
  spendPrev30d: number;
  runes7d: number;
  runes30d: number;
  runes90d: number;
  runesAll: number;
  runesPrev30d: number;
  users7d: number;
  users30d: number;
  users90d: number;
  usersAll: number;
  repeatUsers30d: number;
  onceUsers30d: number;
  refunds30d: number;
  avgCheck30d: number;
  shareSpend30d: number;
  shareRunes30d: number;
  jobsPending: number;
  jobsFailed30d: number;
  jobsCompleted30d: number;
  extras: { label: string; value: number }[];
};

export type ProductActionStats = {
  action: string;
  label: string;
  sectionId: ProductSectionId;
  spend7d: number;
  spend30d: number;
  spend90d: number;
  spendAll: number;
  runes7d: number;
  runes30d: number;
  runes90d: number;
  runesAll: number;
  users30d: number;
  refunds30d: number;
  avgCheck30d: number;
};

export type ProductDailyPoint = {
  day: string;
  spend: number;
  runes: number;
};

export type ProductHistoryRow = {
  type: string;
  n7: number;
  n30: number;
  n90: number;
  nall: number;
};

export type ProductJobRow = {
  kind: string;
  pending: number;
  failed30d: number;
  completed30d: number;
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

const HISTORY_LABELS: Record<string, { section: ProductSectionId; label: string }> = {
  aura_reading: { section: "aura", label: "Записей в истории за 30 дней" },
  palm_reading: { section: "palm", label: "Записей в истории за 30 дней" },
  photo_reading: { section: "photo", label: "Записей в истории за 30 дней" },
  intention_spread: { section: "tarot", label: "Раскладов на тему за 30 дней" },
  reading: { section: "tarot", label: "Расшифровок 3 карт за 30 дней" },
  daily_triplet: { section: "daily", label: "Карт дня в истории за 30 дней" },
  joint_reading: { section: "joint", label: "Совместных в истории за 30 дней" },
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
    spend90d: 0,
    spendAll: 0,
    spendPrev30d: 0,
    runes7d: 0,
    runes30d: 0,
    runes90d: 0,
    runesAll: 0,
    runesPrev30d: 0,
    users7d: 0,
    users30d: 0,
    users90d: 0,
    usersAll: 0,
    repeatUsers30d: 0,
    onceUsers30d: 0,
    refunds30d: 0,
    avgCheck30d: 0,
    shareSpend30d: 0,
    shareRunes30d: 0,
    jobsPending: 0,
    jobsFailed30d: 0,
    jobsCompleted30d: 0,
    extras: [],
  };
}

function n(value: string | null | undefined): number {
  return Number.parseInt(value ?? "0", 10) || 0;
}

export async function getProductSectionStats(): Promise<{
  sections: ProductSectionStats[];
  actions: ProductActionStats[];
  daily: ProductDailyPoint[];
  history: ProductHistoryRow[];
  jobs: ProductJobRow[];
  totals: {
    spend7d: number;
    spend30d: number;
    spend90d: number;
    spendAll: number;
    runes7d: number;
    runes30d: number;
    runes90d: number;
    runesAll: number;
    users30d: number;
    refunds30d: number;
    jobsPending: number;
  };
}> {
  const [spend, users, repeats, daily, jobs, auraSnaps, palmSnaps, history] = await Promise.all([
    query<{
      action_type: string;
      type: string;
      n7: string;
      n30: string;
      n90: string;
      nall: string;
      nprev: string;
      u30: string;
      r7: string;
      r30: string;
      r90: string;
      rall: string;
      rprev: string;
    }>(`
      SELECT
        COALESCE(action_type, '') AS action_type,
        type,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS n7,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS n30,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days')::text AS n90,
        COUNT(*)::text AS nall,
        COUNT(*) FILTER (
          WHERE created_at >= NOW() - INTERVAL '60 days'
            AND created_at < NOW() - INTERVAL '30 days'
        )::text AS nprev,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS u30,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0)::text AS r7,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0)::text AS r30,
        COALESCE(SUM(ABS(amount)) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days'), 0)::text AS r90,
        COALESCE(SUM(ABS(amount)), 0)::text AS rall,
        COALESCE(SUM(ABS(amount)) FILTER (
          WHERE created_at >= NOW() - INTERVAL '60 days'
            AND created_at < NOW() - INTERVAL '30 days'
        ), 0)::text AS rprev
      FROM rune_transactions
      WHERE type IN ('spend', 'refund')
        AND action_type IS NOT NULL
        AND action_type <> ''
      GROUP BY action_type, type
    `),
    query<{
      section: string;
      u7: string;
      u30: string;
      u90: string;
      uall: string;
    }>(`
      SELECT
        CASE
          WHEN action_type = 'AURA_READING' THEN 'aura'
          WHEN action_type = 'PALM_READING' THEN 'palm'
          WHEN action_type = 'VISION_ANALYSIS' THEN 'photo'
          WHEN action_type IN ('NATAL_READING', 'FORECAST_REPORT', 'SYNASTRY_REPORT') THEN 'natal'
          WHEN action_type IN (
            'NUMEROLOGY_SESSION', 'MATRIX_SUBJECT_REPORT', 'CHILD_MATRIX_REPORT',
            'MATRIX_PAIR_REPORT', 'MATRIX_YEAR_FORECAST'
          ) THEN 'matrix'
          WHEN action_type IN ('HD_REPORT', 'HD_COMPOSITE_REPORT', 'HD_ASK') THEN 'hd'
          WHEN action_type IN (
            'QUESTION', 'READING', 'INTENTION_SPREAD', 'DESTINY_CARD',
            'SCENE_ILLUSTRATION', 'TAROT_ATMOSPHERE', 'FINAL_REPORT'
          ) THEN 'tarot'
          WHEN action_type = 'JOINT_READING' THEN 'joint'
          WHEN action_type IN ('DAILY_AMULET', 'DAILY_EXTENDED') THEN 'daily'
          ELSE 'other'
        END AS section,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS u7,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS u30,
        COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days')::text AS u90,
        COUNT(DISTINCT user_id)::text AS uall
      FROM rune_transactions
      WHERE type = 'spend'
        AND action_type IS NOT NULL
        AND action_type <> ''
      GROUP BY 1
    `),
    query<{ section: string; once_users: string; repeat_users: string }>(`
      SELECT
        section,
        COUNT(*) FILTER (WHERE c = 1)::text AS once_users,
        COUNT(*) FILTER (WHERE c >= 2)::text AS repeat_users
      FROM (
        SELECT
          CASE
            WHEN action_type = 'AURA_READING' THEN 'aura'
            WHEN action_type = 'PALM_READING' THEN 'palm'
            WHEN action_type = 'VISION_ANALYSIS' THEN 'photo'
            WHEN action_type IN ('NATAL_READING', 'FORECAST_REPORT', 'SYNASTRY_REPORT') THEN 'natal'
            WHEN action_type IN (
              'NUMEROLOGY_SESSION', 'MATRIX_SUBJECT_REPORT', 'CHILD_MATRIX_REPORT',
              'MATRIX_PAIR_REPORT', 'MATRIX_YEAR_FORECAST'
            ) THEN 'matrix'
            WHEN action_type IN ('HD_REPORT', 'HD_COMPOSITE_REPORT', 'HD_ASK') THEN 'hd'
            WHEN action_type IN (
              'QUESTION', 'READING', 'INTENTION_SPREAD', 'DESTINY_CARD',
              'SCENE_ILLUSTRATION', 'TAROT_ATMOSPHERE', 'FINAL_REPORT'
            ) THEN 'tarot'
            WHEN action_type = 'JOINT_READING' THEN 'joint'
            WHEN action_type IN ('DAILY_AMULET', 'DAILY_EXTENDED') THEN 'daily'
            ELSE 'other'
          END AS section,
          user_id,
          COUNT(*) AS c
        FROM rune_transactions
        WHERE type = 'spend'
          AND action_type IS NOT NULL
          AND action_type <> ''
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1, user_id
      ) t
      GROUP BY section
    `),
    query<{ day: string; n: string; runes: string }>(`
      SELECT
        to_char((created_at AT TIME ZONE 'Europe/Moscow')::date, 'YYYY-MM-DD') AS day,
        COUNT(*)::text AS n,
        COALESCE(SUM(ABS(amount)), 0)::text AS runes
      FROM rune_transactions
      WHERE type = 'spend'
        AND action_type IS NOT NULL
        AND action_type <> ''
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `),
    query<{ kind: string; pending: string; failed30: string; completed30: string }>(`
      SELECT
        kind,
        COUNT(*) FILTER (WHERE status IN ('pending', 'running'))::text AS pending,
        COUNT(*) FILTER (
          WHERE status = 'failed' AND updated_at >= NOW() - INTERVAL '30 days'
        )::text AS failed30,
        COUNT(*) FILTER (
          WHERE status = 'completed' AND updated_at >= NOW() - INTERVAL '30 days'
        )::text AS completed30
      FROM async_jobs
      GROUP BY kind
    `).catch(() => ({
      rows: [] as { kind: string; pending: string; failed30: string; completed30: string }[],
    })),
    query<{ all: string; claimed: string; d30: string }>(`
      SELECT
        COUNT(*)::text AS all,
        COUNT(*) FILTER (WHERE claimed_user_id IS NOT NULL)::text AS claimed,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS d30
      FROM aura_guest_snapshots
    `).catch(() => ({ rows: [{ all: "0", claimed: "0", d30: "0" }] })),
    query<{ all: string; claimed: string; d30: string }>(`
      SELECT
        COUNT(*)::text AS all,
        COUNT(*) FILTER (WHERE claimed_user_id IS NOT NULL)::text AS claimed,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS d30
      FROM palm_guest_snapshots
    `).catch(() => ({ rows: [{ all: "0", claimed: "0", d30: "0" }] })),
    query<{ typ: string; n7: string; n30: string; n90: string; nall: string }>(`
      SELECT
        COALESCE(context_data->>'type', '') AS typ,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::text AS n7,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::text AS n30,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days')::text AS n90,
        COUNT(*)::text AS nall
      FROM history
      WHERE context_data->>'type' IS NOT NULL
        AND context_data->>'type' <> ''
      GROUP BY 1
    `).catch(() => ({ rows: [] as { typ: string; n7: string; n30: string; n90: string; nall: string }[] })),
  ]);

  const byId = new Map<ProductSectionId, ProductSectionStats>();
  for (const spec of SECTION_ACTIONS) {
    byId.set(spec.id, emptySection(spec.id, spec.label));
  }
  byId.set("other", emptySection("other", "Прочее"));

  const actionMap = new Map<string, ProductActionStats>();

  for (const row of spend.rows) {
    const sectionId = actionToSection(row.action_type);
    const section = byId.get(sectionId);
    if (!section) continue;
    const n7 = n(row.n7);
    const n30 = n(row.n30);
    const n90 = n(row.n90);
    const nall = n(row.nall);
    const nprev = n(row.nprev);
    const r7 = n(row.r7);
    const r30 = n(row.r30);
    const r90 = n(row.r90);
    const rall = n(row.rall);
    const rprev = n(row.rprev);
    if (row.type === "refund") {
      section.refunds30d += n30;
      const existing = actionMap.get(row.action_type);
      if (existing) existing.refunds30d += n30;
      continue;
    }
    section.spend7d += n7;
    section.spend30d += n30;
    section.spend90d += n90;
    section.spendAll += nall;
    section.spendPrev30d += nprev;
    section.runes7d += r7;
    section.runes30d += r30;
    section.runes90d += r90;
    section.runesAll += rall;
    section.runesPrev30d += rprev;
    const prev = actionMap.get(row.action_type);
    if (prev) {
      prev.spend7d += n7;
      prev.spend30d += n30;
      prev.spend90d += n90;
      prev.spendAll += nall;
      prev.runes7d += r7;
      prev.runes30d += r30;
      prev.runes90d += r90;
      prev.runesAll += rall;
    } else {
      actionMap.set(row.action_type, {
        action: row.action_type,
        label: RUNE_ACTION_LABELS[row.action_type as RuneActionType] ?? row.action_type,
        sectionId,
        spend7d: n7,
        spend30d: n30,
        spend90d: n90,
        spendAll: nall,
        runes7d: r7,
        runes30d: r30,
        runes90d: r90,
        runesAll: rall,
        users30d: n(row.u30),
        refunds30d: 0,
        avgCheck30d: n30 > 0 ? Math.round(r30 / n30) : 0,
      });
    }
  }

  for (const row of users.rows) {
    const section = byId.get(row.section as ProductSectionId);
    if (!section) continue;
    section.users7d = n(row.u7);
    section.users30d = n(row.u30);
    section.users90d = n(row.u90);
    section.usersAll = n(row.uall);
  }

  for (const row of repeats.rows) {
    const section = byId.get(row.section as ProductSectionId);
    if (!section) continue;
    section.onceUsers30d = n(row.once_users);
    section.repeatUsers30d = n(row.repeat_users);
  }

  const jobRows: ProductJobRow[] = jobs.rows.map((row) => ({
    kind: row.kind,
    pending: n(row.pending),
    failed30d: n(row.failed30),
    completed30d: n(row.completed30),
  }));

  for (const row of jobRows) {
    let placed = false;
    for (const [id, kinds] of Object.entries(JOB_KINDS) as [ProductSectionId, string[]][]) {
      if (!kinds.includes(row.kind)) continue;
      const section = byId.get(id);
      if (!section) continue;
      section.jobsPending += row.pending;
      section.jobsFailed30d += row.failed30d;
      section.jobsCompleted30d += row.completed30d;
      placed = true;
    }
    if (!placed) {
      const other = byId.get("other");
      if (other) {
        other.jobsPending += row.pending;
        other.jobsFailed30d += row.failed30d;
        other.jobsCompleted30d += row.completed30d;
      }
    }
  }

  const auraSnap = auraSnaps.rows[0];
  const aura = byId.get("aura");
  if (aura && auraSnap) {
    aura.extras.push(
      { label: "Снимки поля за 30 дней", value: n(auraSnap.d30) },
      { label: "Снимков всего", value: n(auraSnap.all) },
      { label: "Привязано к аккаунту", value: n(auraSnap.claimed) }
    );
  }

  const palmSnap = palmSnaps.rows[0];
  const palm = byId.get("palm");
  if (palm && palmSnap) {
    palm.extras.push(
      { label: "Снимки ладони за 30 дней", value: n(palmSnap.d30) },
      { label: "Снимков всего", value: n(palmSnap.all) },
      { label: "Привязано к аккаунту", value: n(palmSnap.claimed) }
    );
  }

  const historyRows: ProductHistoryRow[] = history.rows
    .filter((row) => row.typ)
    .map((row) => ({
      type: row.typ,
      n7: n(row.n7),
      n30: n(row.n30),
      n90: n(row.n90),
      nall: n(row.nall),
    }))
    .sort((a, b) => b.n30 - a.n30);

  for (const row of historyRows) {
    const mapped = HISTORY_LABELS[row.type];
    if (!mapped) continue;
    byId.get(mapped.section)?.extras.push({ label: mapped.label, value: row.n30 });
  }

  const sectionsAll = [...SECTION_ACTIONS.map((s) => byId.get(s.id)!), byId.get("other")!];
  const spend30Total = sectionsAll.reduce((sum, s) => sum + s.spend30d, 0);
  const runes30Total = sectionsAll.reduce((sum, s) => sum + s.runes30d, 0);

  for (const section of sectionsAll) {
    section.avgCheck30d = section.spend30d > 0 ? Math.round(section.runes30d / section.spend30d) : 0;
    section.shareSpend30d = spend30Total > 0 ? Math.round((section.spend30d / spend30Total) * 1000) / 10 : 0;
    section.shareRunes30d = runes30Total > 0 ? Math.round((section.runes30d / runes30Total) * 1000) / 10 : 0;
  }

  const sections = sectionsAll
    .filter((s) => s.spendAll > 0 || s.jobsPending > 0 || s.extras.some((e) => e.value > 0))
    .sort((a, b) => b.spend30d - a.spend30d || b.runes30d - a.runes30d);

  const actions = [...actionMap.values()].map((row) => ({
    ...row,
    avgCheck30d: row.spend30d > 0 ? Math.round(row.runes30d / row.spend30d) : 0,
  }));
  actions.sort((a, b) => b.spend30d - a.spend30d || b.runes30d - a.runes30d);

  const dailyPoints: ProductDailyPoint[] = daily.rows.map((row) => ({
    day: row.day,
    spend: n(row.n),
    runes: n(row.runes),
  }));

  const users30d = sectionsAll.reduce((sum, s) => sum + s.users30d, 0);

  return {
    sections,
    actions,
    daily: dailyPoints,
    history: historyRows,
    jobs: jobRows.sort((a, b) => b.completed30d - a.completed30d),
    totals: {
      spend7d: sectionsAll.reduce((sum, s) => sum + s.spend7d, 0),
      spend30d: spend30Total,
      spend90d: sectionsAll.reduce((sum, s) => sum + s.spend90d, 0),
      spendAll: sectionsAll.reduce((sum, s) => sum + s.spendAll, 0),
      runes7d: sectionsAll.reduce((sum, s) => sum + s.runes7d, 0),
      runes30d: runes30Total,
      runes90d: sectionsAll.reduce((sum, s) => sum + s.runes90d, 0),
      runesAll: sectionsAll.reduce((sum, s) => sum + s.runesAll, 0),
      users30d,
      refunds30d: sectionsAll.reduce((sum, s) => sum + s.refunds30d, 0),
      jobsPending: sectionsAll.reduce((sum, s) => sum + s.jobsPending, 0),
    },
  };
}
