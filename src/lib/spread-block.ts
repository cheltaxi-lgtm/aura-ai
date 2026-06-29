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

/** Quick period spread (today / week / month) — does not require session intention. */
export function buildPeriodSpreadBlock(scope: PeriodSpreadScope, cards: string[]): string {
  if (cards.length < 1) return "";

  const positions = periodSpreadPositions(scope);
  const count = Math.min(cards.length, positions.length);
  const horizon = periodSpreadTaskLabel(scope);
  const cardLines = cards
    .slice(0, count)
    .map((name, i) => `${i + 1}я (${positions[i]}): ${name}`)
    .join("\n");
  const symbolWord = count === 1 ? "символ" : count < 5 ? "символа" : "символов";

  return `
НОВЫЙ РАСКЛАД ${horizon}:
${cardLines}

Клиент запросил быстрый расклад на период — ${count} ${symbolWord} только что выпали заново.
Дай развёрнутый расклад по каждой позиции на этот горизонт.
Озвучивай позиции явно. Не предлагай тянуть новые карты.
Без markdown (*, **, #).`.trim();
}

export type SpreadBlockOptions = {
  readyToRead?: boolean;
  spreadId?: string | null;
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
  const readyToRead = opts?.readyToRead ?? true;
  const positions = resolveSpreadPositions(spreadId, intention as SessionTopicId);
  const cardSlice = cards.slice(0, spread.cardCount);

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
Обращайся к тому, что сказал пользователь (имя, срок, обстоятельства).

Позиции:
1я (${cardSlice[0]}) — состояние человека сейчас
2я (${cardSlice[1]}) — обстоятельства вокруг него
3я (${cardSlice[2]}) — вектор, куда движется ситуация

Читай каждую руну/карту как состояние, обстоятельство или вектор —
НЕ как поэтический образ смерти. Слово «смерть» как метафора ЗАПРЕЩЕНО.`;
  }

  if (spreadType === "daily") {
    return `
КАРТЫ ДНЯ КЛИЕНТА: ${cardSlice.join(", ")}.
ТЕМА СЕАНСА: ${theme}.
Начни сеанс с расклада именно по этим картам на эту тему.
Не предлагай новые карты — эти уже выпали сегодня.
Позиции: 1я карта — состояние сейчас, 2я — обстоятельства,
3я — вектор развития.
Первое сообщение: приветствие + прочтение карт на тему.`;
  }

  if (spreadType === "new") {
    const positionLines = cardSlice
      .map((name, i) => `${i + 1}я (${positions[i]?.label ?? `позиция ${i + 1}`}): ${name}`)
      .join("\n");

    const countLabel =
      spread.cardCount === 1 ? "карту" : `${spread.cardCount} карт`;

    return `
НОВЫЙ РАСКЛАД «${spread.label}» НА ТЕМУ «${theme}»:
${positionLines}
Начни с прочтения этих ${countLabel} на выбранную тему.
Озвучивай позиции явно.
Первое сообщение: приветствие + развёрнутый расклад.`;
  }

  return "";
}
