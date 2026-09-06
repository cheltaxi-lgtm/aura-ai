import { query } from "@/lib/db";
import { masterDisplay } from "@/lib/cabinet-utils";
import { getRitualById } from "@/lib/ritual-service";
import { RITUAL_TYPES } from "@/lib/ritual-config";

export type SavedReadingDocument = {
  title: string; body: string; date: string; master: string; question?: string;
  kind: string; printPath?: string; snapshot?: Record<string, unknown>; cards?: string[];
};
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const cardLabel = (value: unknown): string => {
  if (typeof value === "string") return value;
  const c = record(value); if (!c || !text(c.name)) return "";
  const position = text(c.position) || text(c.positionLabel) || (typeof c.position === "number" ? `Позиция ${c.position + 1}` : "");
  return [position, text(c.name) + (c.reversed === true || c.isReversed === true ? " (перевёрнутая)" : "")].filter(Boolean).join(": ");
};
const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : value;

export function historyToDocument(row: { context_data: Record<string, unknown>; created_at: Date | string; character_name: string }): SavedReadingDocument | null {
  const c = row.context_data;
  const body = [c.report, c.reading, c.interpretation, c.analysis].map(text).find(Boolean);
  if (!body) return null;
  const kind = text(c.type);
  let title = ({ aura_reading: "Ваш портрет ауры", palm_reading: "Карта вашей ладони", photo_reading: "Расклад по фотографии", intention_spread: "Ваш персональный расклад" } as Record<string, string>)[kind] ?? "Ваш персональный разбор";
  if (kind === "aura_reading" && c.subjectKind === "other") title = `Портрет ауры: ${text(c.subjectName) || "другой человек"}`;
  const cards = Array.isArray(c.tarotCards) ? c.tarotCards.flatMap(value => {
    const label = cardLabel(value); return label ? [label] : [];
  }) : undefined;
  return { title, body, kind, date: iso(row.created_at), master: masterDisplay(row.character_name).name,
    question: text(c.customQuestion) || text(c.question) || undefined, snapshot: record(c.snapshot), cards };
}

/** Only persisted, owner-scoped sources; no LLM, payment, chart refresh or summaries. */
export async function getSavedReadingDocument(userId: string, id: string): Promise<SavedReadingDocument | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const history = await query<{ context_data: Record<string, unknown>; created_at: Date; character_name: string }>(
    "SELECT context_data,created_at,character_name FROM history WHERE id=$1 AND user_id=$2", [id, userId]);
  if (history.rows[0]) return historyToDocument(history.rows[0]);
  const daily = await query<{ reading_text: string; reading_date: Date; character_key: string; cards: Array<{ name: string }> }>(
    "SELECT reading_text,reading_date,character_key,cards FROM daily_readings WHERE id=$1 AND user_id=$2", [id, userId]);
  if (daily.rows[0]) { const row = daily.rows[0]; return { title: "Ваш день", kind: "daily", body: row.reading_text,
    date: iso(row.reading_date), master: masterDisplay(row.character_key).name, cards: row.cards.map(cardLabel).filter(Boolean) }; }
  const numerology = await query<{ id: string; content: string; created_at: Date; tool_id: string }>(
    `SELECT n.id,n.content,n.created_at,n.tool_id FROM numerology_report_history n WHERE n.user_id=$2 AND (n.id=$1 OR n.session_id=$1 OR n.session_id IN (SELECT session_id FROM session_memories WHERE id=$1 AND user_id=$2)) ORDER BY n.created_at DESC LIMIT 1`, [id, userId]);
  if (numerology.rows[0]) { const row = numerology.rows[0]; return { title: "Ваш нумерологический разбор", kind: row.tool_id,
    printPath: ["destiny_matrix", "child_matrix", "matrix_year_forecast", "matrix_compatibility"].includes(row.tool_id) ? `/cabinet/numerology/matrix/${row.id}/print` : undefined, body: row.content, date: iso(row.created_at), master: masterDisplay("numerolog").name }; }
  const session = await query<{ id: string; character_key: string; created_at: Date }>(
    `SELECT s.id,s.character_key,s.created_at FROM sessions s
       WHERE s.user_id=$2 AND (s.id=$1 OR EXISTS (
         SELECT 1 FROM session_memories m WHERE m.id=$1 AND m.user_id=$2 AND m.session_id=s.id))`, [id, userId]);
  if (session.rows[0]) {
    const row = session.rows[0];
    const messages = await query<{ role: string; content: string }>(
      `SELECT role,content FROM chat_messages WHERE session_id=$1 AND (owner_user_id=$2 OR owner_user_id IS NULL)
        AND role IN ('user','assistant') ORDER BY created_at,id LIMIT 501`, [row.id, userId]);
    if (messages.rows.length > 500) throw new Error("report_too_long");
    if (!messages.rows.some(m => m.role === "assistant" && text(m.content))) return null;
    return { title: "Ваша консультация", kind: "session", date: iso(row.created_at), master: masterDisplay(row.character_key).name,
      body: messages.rows.filter(m => text(m.content)).map(m => `## ${m.role === "user" ? "Ваш вопрос" : masterDisplay(row.character_key).name}\n\n${m.content}`).join("\n\n") };
  }
  // The ritual reader is side-effect free; require owner and completed content.
  const ritual = await getRitualById(id);
  if (!ritual || ritual.user_id !== userId || !["completed", "reviewed"].includes(ritual.status)) return null;
  const parts = [
    ritual.ritual_time ? `## Время\n\n${ritual.ritual_time}` : "",
    ritual.ritual_place ? `## Место\n\n${ritual.ritual_place}` : "",
    ritual.ritual_items.length ? `## Подготовка\n\n${ritual.ritual_items.map(i => `- **${i.item}**: ${i.reason}`).join("\n")}` : "",
    ...ritual.ritual_steps.map((s, i) => `## ${i + 1}. ${s.step}\n\n${s.description}`),
    ritual.ritual_words ? `## Слова практики\n\n${ritual.ritual_words}` : "",
    ritual.ritual_word_of_power ? `## Слово силы\n\n${ritual.ritual_word_of_power}\n\n${ritual.ritual_word_of_power_transcription ?? ""}` : "",
    ritual.ritual_forbids.length ? `## Чего избегать\n\n${ritual.ritual_forbids.map(s => `- ${s}`).join("\n")}` : "",
    ritual.ritual_signs.length ? `## На что обратить внимание\n\n${ritual.ritual_signs.map(s => `- ${s}`).join("\n")}` : "",
    ritual.outcome_text ? `## Ваши наблюдения\n\n${ritual.outcome_text}` : "",
  ];
  return { title: `Ваша практика: ${RITUAL_TYPES[ritual.ritual_type].label}`, kind: "ritual", body: parts.filter(Boolean).join("\n\n"), date: iso(ritual.created_at), master: masterDisplay(ritual.character_key).name };
}
