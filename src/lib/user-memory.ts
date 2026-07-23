import { query, ensureDb } from "@/lib/db";
import { lifeFocusLabel, type LifeFocus } from "@/lib/astro-profile";
import { normalizePersonDisplayNameOr } from "@/lib/normalize-person-name";
import { tarotCardsKey } from "@/lib/tarot";
import {
  periodSpreadTaskLabel,
  type PeriodSpreadScope,
} from "@/lib/master-quick-chips";
import { MEMORY_SECURITY_RULES } from "@/lib/memory/injection-guard";
import { isTextRelevantToQuery, MEMORY_USAGE_RULES } from "@/lib/memory/memory-relevance";
import { isTextRelevantToQueryAsync } from "@/lib/memory/session-memory-semantic";
import { genderPromptValue } from "@/lib/russian-name-gender";

const MAX_BLOCK_CHARS = 2800;
const EPISODIC_CANDIDATE_LIMIT = 40;
const PLACEHOLDER_PREDICTION = "Сеанс в процессе";

export type SessionAnchorFallback = {
  cardNames?: string[];
  intention?: string | null;
};

function formatSessionAnchor(parts: {
  topicSummary?: string;
  cardNames?: string[];
  prediction?: string;
  mood?: string | null;
  intention?: string | null;
}): string {
  const hasTopic = Boolean(parts.topicSummary?.trim());
  const hasCards = Boolean(parts.cardNames?.length);
  const hasPrediction =
    Boolean(parts.prediction?.trim()) && parts.prediction!.trim() !== PLACEHOLDER_PREDICTION;
  if (!hasTopic && !hasCards && !hasPrediction) return "";

  const lines: string[] = [
    "ЯКОРЬ СЕАНСА (контекст текущего разговора):",
  ];
  if (hasTopic) lines.push(`- Тема сеанса: ${parts.topicSummary!.trim()}`);
  if (parts.intention?.trim()) lines.push(`- Фокус расклада: ${parts.intention.trim()}`);
  if (hasCards) lines.push(`- Символы: ${parts.cardNames!.join(" · ")}`);
  if (hasPrediction) lines.push(`- Уже проговорено: ${parts.prediction!.trim()}`);
  if (parts.mood?.trim()) lines.push(`- Настроение: ${parts.mood.trim()}`);
  return lines.join("\n");
}

async function buildRelevantSessionAnchor(
  topicQuery: string,
  parts: {
    topicSummary?: string;
    prediction?: string;
    mood?: string | null;
    cardNames?: string[];
    intention?: string | null;
  }
): Promise<string> {
  if (!topicQuery) return "";

  const narrative = `${parts.topicSummary ?? ""} ${parts.prediction ?? ""}`.trim();
  const cardNames = parts.cardNames ?? [];
  const cardsText = cardNames.join(" ");
  const intention = parts.intention?.trim() ?? "";

  // Batched semantic + lexical relevance in one round-trip (see memory-relevance.ts).
  const [narrativeRelevant, cardsRelevant, intentionRelevant] = await isTextRelevantToQueryAsync(
    topicQuery,
    [narrative, cardsText, intention]
  );

  if (!narrativeRelevant && !cardsRelevant && !intentionRelevant) return "";

  return formatSessionAnchor({
    topicSummary: narrativeRelevant ? parts.topicSummary : undefined,
    prediction: narrativeRelevant ? parts.prediction : undefined,
    mood: narrativeRelevant ? parts.mood : undefined,
    cardNames: cardsRelevant ? cardNames : undefined,
    intention: intentionRelevant ? intention : undefined,
  });
}

/** Running summary of the active session — from session_memories or session meta fallback. */
export async function buildCurrentSessionAnchorBlock(
  userId: string,
  sessionId: string,
  characterKey: string,
  fallback?: SessionAnchorFallback,
  queryText?: string
): Promise<string> {
  const topicQuery = queryText?.trim() ?? "";
  if (!topicQuery) return "";

  if (!(await ensureDb())) {
    return await buildRelevantSessionAnchor(topicQuery, {
      cardNames: fallback?.cardNames,
      intention: fallback?.intention ?? undefined,
    });
  }

  const { rows } = await query<{
    topic_summary: string;
    key_cards: string[] | null;
    prediction: string;
    mood: string | null;
  }>(
    `SELECT topic_summary, key_cards, prediction, mood
     FROM session_memories
     WHERE user_id = $1 AND session_id = $2 AND character_key = $3
     LIMIT 1`,
    [userId, sessionId, characterKey]
  );

  const row = rows[0];
  if (!row) {
    return await buildRelevantSessionAnchor(topicQuery, {
      cardNames: fallback?.cardNames,
      intention: fallback?.intention ?? undefined,
    });
  }

  return await buildRelevantSessionAnchor(topicQuery, {
    topicSummary: row.topic_summary,
    prediction: row.prediction,
    mood: row.mood,
    cardNames: row.key_cards ?? fallback?.cardNames,
    intention: fallback?.intention ?? undefined,
  });
}

/** Fresh anchor for quick period spreads — no «continue old topic» bleed. */
export function buildPeriodSpreadAnchorBlock(
  scope: PeriodSpreadScope,
  cardNames: string[]
): string {
  const names = cardNames.map((n) => n.trim()).filter(Boolean);
  if (!names.length) return "";

  const horizon = periodSpreadTaskLabel(scope);
  return [
    "ЯКОРЬ ТЕКУЩЕГО ЗАПРОСА (быстрый расклад на период):",
    `- Горизонт: ${horizon}`,
    `- Символы: ${names.join(" · ")}`,
    "Отвечай только на этот период и эти символы.",
    "Не продолжай прошлую тему сеанса, если клиент не попросил об этом в последнем сообщении.",
  ].join("\n");
}

export interface UserMemoryOptions {
  currentCharacterId?: string;
  excludeHistoryId?: string;
  currentCardsKey?: string;
  excludeSessionId?: string | null;
}

export type ClientProfile = {
  name?: string | null;
  gender?: string | null;
  zodiac?: string | null;
  birthDate?: string | null;
  mainQuestion?: string | null;
  lifeFocus?: string | null;
};

/**
 * Level 1: client profile for prompts.
 * Name always; gender for grammar; birthDate/zodiac only when query looks natal/astro;
 * thematic fields relevance-gated.
 */
export function buildClientBlock(
  profile: ClientProfile | null | undefined,
  queryText?: string
): string {
  if (!profile) return "";
  const query = queryText?.trim() ?? "";
  const lines: string[] = [];
  if (profile.name) {
    lines.push(`Имя: ${normalizePersonDisplayNameOr(profile.name, profile.name)}.`);
  }
  {
    const label = genderPromptValue(profile.gender);
    if (label) lines.push(`Пол: ${label}.`);
  }
  const wantsAstro =
    Boolean(query) &&
    /натал|астро|зодиак|гороскоп|нумеролог|матриц|даша|транзит|рожден/i.test(query);
  if (profile.zodiac && wantsAstro) lines.push(`Знак: ${profile.zodiac}.`);
  if (profile.birthDate && wantsAstro) lines.push(`Дата рождения: ${profile.birthDate}.`);
  if (profile.mainQuestion && query && isTextRelevantToQuery(query, profile.mainQuestion)) {
    lines.push(`Главный вопрос: «${profile.mainQuestion}».`);
  }
  if (profile.lifeFocus) {
    const focusLabel = lifeFocusLabel(profile.lifeFocus as LifeFocus) ?? profile.lifeFocus;
    if (query && isTextRelevantToQuery(query, `${focusLabel} ${profile.lifeFocus}`)) {
      lines.push(`Тема жизни: ${focusLabel}.`);
    }
  }
  if (!lines.length) return "";
  return `\nПРОФИЛЬ КЛИЕНТА:\n${lines.join("\n")}\n`;
}

/** Level 2: past session summaries — filtered by query relevance. */
export async function buildMemoryBlock(
  userId: string,
  characterKey: string,
  currentSessionId?: string | null,
  queryText?: string
): Promise<string> {
  if (!(await ensureDb())) return "";

  const excludeSession = Boolean(currentSessionId?.trim());
  const topicQuery = queryText?.trim() ?? "";
  // Empty query: do not inject episodic topics (avoids leaking past sensitive themes).
  if (!topicQuery) return "";

  const { rows } = await query<{
    topic_summary: string;
    key_cards: string[] | null;
    prediction: string;
    mood: string | null;
    session_date: Date;
    character_key: string;
  }>(
    excludeSession
      ? `SELECT topic_summary, key_cards, prediction, mood, session_date, character_key
         FROM session_memories
         WHERE user_id = $1
           AND session_id IS NOT NULL
           AND session_id <> $2
         ORDER BY (outcome_rating IS NOT NULL AND outcome_rating <= 2), session_date DESC
         LIMIT $3`
      : `SELECT topic_summary, key_cards, prediction, mood, session_date, character_key
         FROM session_memories
         WHERE user_id = $1
           AND session_id IS NOT NULL
         ORDER BY (outcome_rating IS NOT NULL AND outcome_rating <= 2), session_date DESC
         LIMIT $2`,
    excludeSession
      ? [userId, currentSessionId, EPISODIC_CANDIDATE_LIMIT]
      : [userId, EPISODIC_CANDIDATE_LIMIT]
  );

  if (!rows.length) return "";

  // Prefer same-master sessions, but allow cross-master continuity when relevant.
  const ranked = [
    ...rows.filter((r) => r.character_key === characterKey),
    ...rows.filter((r) => r.character_key !== characterKey),
  ];

  const candidateTexts = ranked.map(
    (m) => `${m.topic_summary} ${m.prediction} ${(m.key_cards ?? []).join(" ")}`
  );
  const relevanceFlags = await isTextRelevantToQueryAsync(topicQuery, candidateTexts);
  const filtered = ranked.filter((_, i) => relevanceFlags[i]).slice(0, 3);

  if (!filtered.length) return "";

  const list = filtered
    .map((m) => {
      const date = new Date(m.session_date).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
      });
      const cards = m.key_cards?.join(" · ") ?? "";
      const master =
        m.character_key && m.character_key !== characterKey
          ? ` (мастер: ${m.character_key})`
          : "";
      return `— ${date}${master}: ${m.topic_summary}. Карты: ${cards}.`;
    })
    .join("\n");

  const block = `
ПАМЯТЬ О ПРОШЛЫХ СЕАНСАХ (по текущему вопросу):
${list}

${MEMORY_USAGE_RULES}

${MEMORY_SECURITY_RULES}
`;

  if (block.length <= MAX_BLOCK_CHARS) return block;
  // Drop extras rather than slicing mid-rules.
  const shortList = filtered
    .slice(0, 1)
    .map((m) => {
      const date = new Date(m.session_date).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
      });
      return `— ${date}: ${m.topic_summary}.`;
    })
    .join("\n");
  return `
ПАМЯТЬ О ПРОШЛЫХ СЕАНСАХ (по текущему вопросу):
${shortList}

${MEMORY_USAGE_RULES}

${MEMORY_SECURITY_RULES}
`;
}

export function appendUserMemoryToPrompt(systemPrompt: string, memoryBlock: string | null): string {
  if (!memoryBlock?.trim()) return systemPrompt;
  return `${systemPrompt}\n\n--- служебный контекст (не включать в ответ) ---\n${memoryBlock}\n--- конец служебного контекста ---`;
}

export function cardsKeyFromTarot(cards: { name: string }[] | undefined): string | undefined {
  const key = tarotCardsKey(cards);
  return key || undefined;
}
