import { topicLabel, type SessionTopicId } from "@/lib/session-topics";
import {
  periodSpreadPositions,
  periodSpreadTaskLabel,
  type PeriodSpreadScope,
} from "@/lib/master-quick-chips";
import {
  getSpread,
  hasCompleteSpread,
  normalizeSpreadId,
  resolveSpreadPositions,
} from "@/lib/spreads";
import { resolveDeckCard, resolveDeckSystem } from "@/lib/deck-card-utils";

export type SpreadCardWithMeaning = {
  name: string;
  meaning?: string;
  position?: string;
};

function resolveMeaningLine(
  name: string,
  meaning: string | undefined,
  masterId?: string
): string {
  if (meaning?.trim()) return meaning.trim();
  try {
    const system = resolveDeckSystem(undefined, masterId);
    const resolved = resolveDeckCard(system, { name });
    return resolved.shortMeaning || "";
  } catch {
    return "";
  }
}

function formatCardLine(
  index: number,
  position: string,
  name: string,
  meaning?: string,
  masterId?: string
): string {
  const meaningText = resolveMeaningLine(name, meaning, masterId);
  return meaningText
    ? `${index + 1}я (${position}): «${name}» — ${meaningText}`
    : `${index + 1}я (${position}): «${name}»`;
}

/** Quick period spread (today / week / month) — does not require session intention. */
export function buildPeriodSpreadBlock(
  scope: PeriodSpreadScope,
  cards: string[],
  opts?: { cardsWithMeanings?: SpreadCardWithMeaning[]; masterId?: string }
): string {
  if (cards.length < 1) return "";

  const positions = periodSpreadPositions(scope);
  const count = Math.min(cards.length, positions.length);
  const horizon = periodSpreadTaskLabel(scope);
  const withMeanings = opts?.cardsWithMeanings ?? [];
  const cardLines = cards
    .slice(0, count)
    .map((name, i) =>
      formatCardLine(
        i,
        positions[i] ?? `Позиция ${i + 1}`,
        withMeanings[i]?.name ?? name,
        withMeanings[i]?.meaning,
        opts?.masterId
      )
    )
    .join("\n");
  const symbolWord = count === 1 ? "символ" : count < 5 ? "символа" : "символов";

  return `
НОВЫЙ РАСКЛАД ${horizon}:
${cardLines}

Клиент запросил быстрый расклад на период — ${count} ${symbolWord} только что выпали заново.
Дай РАЗВЁРНУТЫЙ полный расклад по каждой позиции на этот горизонт (не чат-тизер): название → значение → вывод.
Озвучивай позиции явно. Не предлагай тянуть новые карты.
Это самостоятельный запрос: не возвращайся к прошлым темам сеанса (деньги, отношения и т.д.), если клиент явно не вернулся к ним в этом сообщении.
Пентакли здесь — про быт и материальный слой периода, не автоматически «тот же денежный кейс», что обсуждали раньше.
Если символы показывают тень — называй прямо, без смягчения.
Без markdown (*, **, #).`.trim();
}

export type SpreadBlockOptions = {
  readyToRead?: boolean;
  spreadId?: string | null;
  cardsWithMeanings?: SpreadCardWithMeaning[];
  masterId?: string;
};

/** System-prompt block for daily vs new intention spreads in chat. */
export function buildSpreadBlock(
  spreadType?: string,
  cards?: string[],
  intention?: string,
  opts?: SpreadBlockOptions
): string {
  if (!cards?.length || !intention?.trim()) return "";

  const spreadId = normalizeSpreadId(opts?.spreadId);
  const spread = getSpread(spreadId);
  if (!hasCompleteSpread(cards, spreadId, spreadType)) return "";

  const theme = topicLabel(intention);
  // Default false for life_death safety: omit opts → ask-first, not full decode.
  const readyToRead = opts?.readyToRead ?? intention !== "life_death";
  const positions = resolveSpreadPositions(spreadId, intention as SessionTopicId);
  const cardSlice = cards.slice(0, spread.cardCount);
  const withMeanings = opts?.cardsWithMeanings ?? [];

  if (intention === "life_death" && cardSlice.length >= 3) {
    const cardLine = cardSlice.join(" · ");
    if (!readyToRead) {
      return `
КАРТЫ ЭТОГО СЕАНСА (${cardLine}).
ТЕМА: Жив ли человек / пропавший.

ВАЖНО — ПОРЯДОК:
Ты уже знаешь карты. Но НЕ читай их сейчас.
Сначала задай один вопрос пользователю:
«О ком речь и когда последний раз была весть?»

Жди ответа.
Только после ответа пользователя — начинай расклад.

Позиции карт (для второго сообщения):
1я (${cardSlice[0]}) — состояние человека сейчас
2я (${cardSlice[1]}) — обстоятельства вокруг него
3я (${cardSlice[2]}) — вектор, куда движется ситуация`;
    }

    return `
КАРТЫ ЭТОГО СЕАНСА (${cardLine}).
ТЕМА: Жив ли человек / пропавший.

Пользователь ответил на твой вопрос — читай карты полным раскладом по позициям.
Опирайся на роль, срок и обстоятельства из ответа клиента.
Имя пропавшего — только если клиент его назвал. Имя клиента в профиле — не пропавший.

Позиции:
1я (${cardSlice[0]}) — состояние человека сейчас
2я (${cardSlice[1]}) — обстоятельства вокруг него
3я (${cardSlice[2]}) — вектор, куда движется ситуация

Читай каждую руну/карту как состояние, обстоятельство или вектор —
НЕ как поэтический образ смерти. Слово «смерть» как метафора ЗАПРЕЩЕНО.`;
  }

  if (spreadType === "daily") {
    const positionLines = cardSlice
      .map((name, i) =>
        formatCardLine(
          i,
          i === 0 ? "состояние сейчас" : i === 1 ? "обстоятельства" : "вектор развития",
          withMeanings[i]?.name ?? name,
          withMeanings[i]?.meaning,
          opts?.masterId
        )
      )
      .join("\n");
    return `
КАРТЫ ДНЯ КЛИЕНТА:
${positionLines}
ТЕМА СЕАНСА: ${theme}.
Начни сеанс с развёрнутого расклада именно по этим картам на эту тему.
Не предлагай новые карты — эти уже выпали сегодня.
Первое сообщение: приветствие + полное прочтение всех карт на тему.`;
  }

  if (spreadType === "new") {
    const positionLines = cardSlice
      .map((name, i) =>
        formatCardLine(
          i,
          positions[i]?.label ?? `позиция ${i + 1}`,
          withMeanings[i]?.name ?? name,
          withMeanings[i]?.meaning,
          opts?.masterId
        )
      )
      .join("\n");

    const countLabel =
      spread.cardCount === 1 ? "карту" : `${spread.cardCount} карт`;

    return `
НОВЫЙ РАСКЛАД «${spread.label}» НА ТЕМУ «${theme}»:
${positionLines}
Начни с полного прочтения этих ${countLabel} на выбранную тему (название → значение → вывод).
Озвучивай позиции явно.
Если символы показывают тень — называй прямо.
Первое сообщение: приветствие + развёрнутый расклад.`;
  }

  return "";
}
