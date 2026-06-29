import { topicLabel } from "@/lib/session-topics";
import {
  periodSpreadPositions,
  periodSpreadTaskLabel,
  type PeriodSpreadScope,
} from "@/lib/master-quick-chips";

/** Quick period spread (today / week / month) — does not require session intention. */
export function buildPeriodSpreadBlock(scope: PeriodSpreadScope, cards: string[]): string {
  if (cards.length < 3) return "";

  const positions = periodSpreadPositions(scope);
  const horizon = periodSpreadTaskLabel(scope);
  const cardLines = cards
    .slice(0, 3)
    .map((name, i) => `${i + 1}я (${positions[i]}): ${name}`)
    .join("\n");

  return `
НОВЫЙ РАСКЛАД ${horizon}:
${cardLines}

Клиент запросил быстрый расклад на период — три символа только что выпали заново.
Дай развёрнутый расклад по каждой позиции на этот горизонт.
Озвучивай позиции явно. Не предлагай тянуть новые карты.
Без markdown (*, **, #).`.trim();
}

/** System-prompt block for daily vs new intention spreads in chat. */
export function buildSpreadBlock(
  spreadType?: string,
  cards?: string[],
  intention?: string,
  opts?: { readyToRead?: boolean }
): string {
  if (!cards?.length || !intention?.trim()) return "";

  const theme = topicLabel(intention);
  const readyToRead = opts?.readyToRead ?? true;

  if (intention === "life_death" && cards.length >= 3) {
    const cardLine = cards.slice(0, 3).join(" · ");
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
1я (${cards[0]}) — состояние человека сейчас
2я (${cards[1]}) — обстоятельства вокруг него
3я (${cards[2]}) — вектор, куда движется ситуация`;
    }

    return `
КАРТЫ ЭТОГО СЕАНСА (${cardLine}).
ТЕМА: Жив ли человек / пропавший.

Пользователь ответил на твой вопрос — читай карты полным раскладом по позициям.
Обращайся к тому, что сказал пользователь (имя, срок, обстоятельства).

Позиции:
1я (${cards[0]}) — состояние человека сейчас
2я (${cards[1]}) — обстоятельства вокруг него
3я (${cards[2]}) — вектор, куда движется ситуация

Читай каждую руну/карту как состояние, обстоятельство или вектор —
НЕ как поэтический образ смерти. Слово «смерть» как метафора ЗАПРЕЩЕНО.`;
  }

  if (spreadType === "daily") {
    return `
КАРТЫ ДНЯ КЛИЕНТА: ${cards.join(", ")}.
ТЕМА СЕАНСА: ${theme}.
Начни сеанс с расклада именно по этим картам на эту тему.
Не предлагай новые карты — эти уже выпали сегодня.
Позиции: 1я карта — состояние сейчас, 2я — обстоятельства,
3я — вектор развития.
Первое сообщение: приветствие + прочтение карт на тему.`;
  }

  if (spreadType === "new") {
    const positions =
      intention === "life_death"
        ? `1я карта (состояние человека сейчас): ${cards[0]}
2я карта (обстоятельства вокруг):     ${cards[1]}
3я карта (вектор ситуации):           ${cards[2]}`
        : `1я карта (состояние сейчас): ${cards[0]}
2я карта (обстоятельства):   ${cards[1]}
3я карта (вектор):           ${cards[2]}`;

    return `
НОВЫЙ РАСКЛАД КЛИЕНТА НА ТЕМУ «${theme}»:
${positions}
Начни с прочтения этих трёх карт на выбранную тему.
Озвучивай позиции явно: «Первая карта — это...»
Первое сообщение: приветствие + развёрнутый расклад.`;
  }

  return "";
}
