import { isSensitiveFact } from "@/lib/memory/predicates";
import type { GlobalUpcomingEvent } from "@/lib/memory/user-facts";

export function buildEventReminderPayload(ev: GlobalUpcomingEvent): {
  title: string;
  body: string;
  data: Record<string, unknown>;
  ctaPath: string;
  ctaLabel: string;
  idempotencyKey: string;
} {
  const when = daysUntilLabel(ev.eventDate);
  const sensitive = isSensitiveFact({
    sensitivity: ev.sensitivity,
    category: ev.category,
    predicateKey: ev.predicateKey,
  });
  const topic = sensitive ? "" : cleanEventTopic(ev.fact, ev.eventDate);
  const question = topic ? buildAutoAsk(topic, when) : "";
  const master = ev.sourceCharacter?.trim() ?? "";
  return {
    title: sensitive
      ? "У Вас скоро важное событие"
      : when
        ? `Важный день — ${when}`
        : "Важный день впереди",
    body: sensitive
      ? "В кабинете есть напоминание о предстоящей дате. Откройте Zovus, чтобы посмотреть детали."
      : `Вы упоминали: «${topic}». ${whenSentence(when)}Загляните к мастеру — посмотрим, что вас ждёт.`,
    data: sensitive
      ? { factId: ev.factId, eventDate: ev.eventDate, sensitive: true }
      : {
          factId: ev.factId,
          eventDate: ev.eventDate,
          sourceCharacter: ev.sourceCharacter,
        },
    ctaPath: sensitive
      ? "/cabinet"
      : `/?ask=${encodeURIComponent(question)}${
          master ? `&master=${encodeURIComponent(master)}` : ""
        }`,
    ctaLabel: sensitive ? "Открыть кабинет" : "Получить расклад",
    idempotencyKey: `event_reminder:${ev.factId}:${ev.eventDate}`,
  };
}

function daysUntilLabel(iso: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return "";
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff >= 2 && diff <= 4) return `через ${diff} дня`;
  return `через ${diff} дней`;
}

function cleanEventTopic(fact: string, eventDate: string): string {
  let t = (fact ?? "").trim();
  if (eventDate) t = t.split(eventDate).join(" ");
  t = t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  t = t.replace(/^у\s+клиента\s+/i, "");
  t = t.replace(/\s{2,}/g, " ").trim();
  t = t.replace(/[\s,;:.\-–—]+$/u, "").trim();
  if (t.length > 90) t = `${t.slice(0, 87).trim()}…`;
  return t || "важное событие";
}

function whenSentence(when: string): string {
  if (!when) return "";
  if (when === "сегодня") return "Это уже сегодня. ";
  if (when === "завтра") return "Это уже завтра. ";
  return `Это ${when}. `;
}

function buildAutoAsk(topic: string, when: string): string {
  const whenClause = when ? `Это ${when}. ` : "";
  return `Хочу разобраться с важным событием: ${topic}. ${whenClause}Что меня ждёт и на что важно обратить внимание?`;
}
