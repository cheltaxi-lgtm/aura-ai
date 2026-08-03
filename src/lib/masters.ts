import { query } from "./db";
import { getAiMasters, type ShowcaseMaster } from "./showcase-masters";

const HUMAN_THEMES = [
  {
    gradient: "from-rose-950 via-fuchsia-950 to-purple-950",
    glowColor: "rgba(236, 72, 153, 0.45)",
    borderColor: "border-rose-500/40",
  },
  {
    gradient: "from-cyan-950 via-blue-950 to-indigo-950",
    glowColor: "rgba(34, 211, 238, 0.45)",
    borderColor: "border-cyan-500/40",
  },
  {
    gradient: "from-amber-950 via-orange-950 to-red-950",
    glowColor: "rgba(251, 191, 36, 0.45)",
    borderColor: "border-amber-500/40",
  },
  {
    gradient: "from-teal-950 via-emerald-950 to-green-950",
    glowColor: "rgba(52, 211, 153, 0.45)",
    borderColor: "border-teal-500/40",
  },
];

function humanTheme(index: number) {
  return HUMAN_THEMES[index % HUMAN_THEMES.length];
}

export async function listHumanMasters(): Promise<ShowcaseMaster[]> {
  const { rows } = await query<{
    slug: string;
    display_name: string;
    title: string | null;
    style_notes: string | null;
    emoji: string | null;
    sessions_count: string;
  }>(
    `SELECT b.slug, b.display_name, b.title, b.style_notes, b.emoji,
            (SELECT COUNT(*)::text FROM sessions s WHERE s.referrer_slug = b.slug) AS sessions_count
     FROM bloggers b
     WHERE b.is_active = TRUE
       AND b.slug NOT IN ('ragnar', 'veronika', 'agafya', 'shri-raj', 'numerolog')
     ORDER BY b.created_at DESC`
  );

  return rows.map((row, index) => {
    const theme = humanTheme(index);
    const sessions = parseInt(row.sessions_count ?? "0", 10);
    const isMarina = row.slug === "gadalka_marina";
    const titleParts = row.title?.split("·").map((p) => p.trim()) ?? [];
    const specialtyRaw = titleParts[0]?.replace(/^Taro$/i, "Таро") || "Авторские расклады";

    return {
      id: row.slug,
      slug: row.slug,
      kind: "human" as const,
      name: isMarina ? "Marina" : row.display_name,
      title: isMarina ? "Таро" : (row.title ?? "Эксперт Zovus"),
      specialty: isMarina
        ? "Расклады · Ритуалы"
        : specialtyRaw,
      style: row.style_notes?.slice(0, 48) || "ИИ-наставник в авторском образе",
      emoji: row.emoji ?? "🌟",
      gradient: theme.gradient,
      glowColor: theme.glowColor,
      borderColor: theme.borderColor,
      priceFrom: "по тарифу ᚢ",
      ...(sessions > 0 ? { sessions: `${sessions} сеансов` } : {}),
      styleNotes: row.style_notes ?? undefined,
      profilePath: `/master/${row.slug}`,
      system: row.slug === "gadalka_marina" ? "tarot-marina" : "tarot-veronika",
    };
  });
}

export async function listShowcaseMasters(): Promise<ShowcaseMaster[]> {
  const ai = getAiMasters();
  try {
    const humans = await listHumanMasters();
    return [...ai, ...humans];
  } catch {
    return ai;
  }
}

export type { ShowcaseMaster, MasterKind } from "./showcase-masters";
export { getAiMasters, isAiMasterId } from "./showcase-masters";
