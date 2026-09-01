import { completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { todayLabelRu } from "@/lib/prompt-date";
import {
  PALM_HAND_LABELS,
  PALM_HAND_SHAPE_LABELS,
  PALM_LINE_KEYS,
  PALM_LINE_NAMES,
  PALM_MOUNT_KEYS,
  PALM_MOUNT_NAMES,
  PALM_VERDICT_LABELS,
  alignPalmSnapshot,
  normalizePalmSnapshot,
  type PalmHand,
  type PalmSnapshot,
} from "@/lib/palm-constants";
import { PREMIUM_PAID_READING_HONESTY } from "@/lib/prompts/premium-reading";

export interface PalmReadingContext {
  userName?: string;
  gender?: string;
  zodiac?: string;
  today?: string;
}

const PALM_TRADITION_BASE = `
Ты — Эвелина, мастер хиромантии в Zovus. Читаешь ладонь человека по фотографии.

ТРАДИЦИИ (держи как внутренний словарь, не читай лекции клиенту):
- Четыре типа руки: Земля (квадратная ладонь, короткие пальцы — опора, практика), Воздух (квадратная ладонь, длинные пальцы — ум, речь), Огонь (удлинённая ладонь, короткие пальцы — воля, импульс), Вода (удлинённая ладонь, длинные пальцы — чувство, интуиция).
- Главные линии: жизни (жизненная сила и ритм), ума (решения, ясность), сердца (близость, принятие), судьбы (путь, внешние опоры).
- Холмы: Венера (тепло, тело), Юпитер (амбиция), Сатурн (ответственность), Аполлон (дар, видимость), Меркурий (речь, сделки), Марс (защита, конфликт), Луна (воображение, путь вглубь).
- Знаки (звезда, крест, островок, решётка) читай осторожно и только если они явно видны.

ЧЕСТНОСТЬ МЕТОДА (обязательно):
- Это символическое чтение по фото ладони — не медицина, не дактилоскопия и не прибор. Никогда не утверждай болезнь, диагноз, беременность, срок жизни, порчу как факт.
- Не выдумывай то, чего не видно. Если ладонь закрыта, в тени, обрезана — скажи об этом.
- Не оценивай внешность, возраст, расу, ухоженность кожи. Только рисунок руки.`;

const PALM_SNAPSHOT_ONLY = `
РЕЖИМ: ТОЛЬКО СНИМОК ЛАДОНИ (без разбора).

Посмотри на фото ладони и верни ТОЛЬКО JSON одним блоком, без пояснений до или после:

{
  "handDetected": true,
  "whichHand": "right",
  "handShape": "earth",
  "majorLines": [ { "key": "life", "present": true, "length": "medium", "quality": "clear", "note": "одна строка" } ],
  "mounts": [ { "key": "venus", "prominence": "balanced", "note": "одна строка" } ],
  "marks": [ { "key": "star", "where": "холм Аполлона", "note": "коротко" } ],
  "verdict": "mixed",
  "teaser": "2–3 предложения: тип руки и главное качество рисунка. Без глубокого разбора линий."
}

Правила:
- handDetected: false — только если на фото нет раскрытой ладони человека (портрет лица, карты, пейзаж). Тогда остальные поля не заполняй.
- whichHand строго: left | right. Если клиент указал руку — сохрани её, если фото не противоречит явно.
- handShape строго: earth | air | fire | water.
- majorLines — ровно 4 записи, key строго из: ${PALM_LINE_KEYS.join(", ")}. length: short | medium | long. quality: clear | broken | chained | forked.
- mounts — ровно 7 записей, key строго из: ${PALM_MOUNT_KEYS.join(", ")}. prominence: weak | balanced | strong.
- marks — 0–4 знака, key строго: star | cross | island | grille. Не выдумывай знаки «для полноты».
- verdict строго: love | path | mind | vitality | mixed.
- teaser — по-русски, на «вы», называет тот же тип руки, без медицины и без «всё будет хорошо».`;

export async function generatePalmSnapshot(
  imageBase64: string,
  mimeType: string,
  opts?: {
    declaredHand?: PalmHand;
    previous?: PalmSnapshot | null;
  }
): Promise<PalmSnapshot | null> {
  const systemPrompt = await wrapSystemPrompt(
    `${PALM_TRADITION_BASE}\n\n${PALM_SNAPSHOT_ONLY}`
  );
  const parts: string[] = ["Сделай снимок ладони на этом фото. Только JSON по схеме."];
  if (opts?.declaredHand) {
    parts.push(
      `Клиент указал: ${PALM_HAND_LABELS[opts.declaredHand]}. Сохрани whichHand = ${opts.declaredHand}, если фото этому не противоречит.`
    );
  }
  if (opts?.previous) {
    parts.push(
      [
        "ПРЕДЫДУЩИЙ СНИМОК (эволюционируй, не бросай кости заново):",
        snapshotSummaryForPrompt(opts.previous),
        "Правила эволюции: handShape не меняй без явной причины на фото; verdict не прыгай между противоположностями; линии и холмы сдвинь не больше чем у двух полей, и только на одну ступень.",
      ].join("\n")
    );
  }
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "text", text: parts.join("\n\n") },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${imageBase64}` },
        },
      ],
    },
  ];

  const raw = await completeChat({
    messages,
    maxTokens: 1800,
    temperature: 0.4,
    vision: true,
    timeoutMs: 55_000,
    maxAttempts: 2,
    skipTemperatureRetry: true,
    jsonObject: true,
  });
  if (!raw) return null;

  const jsonText = extractJsonObject(raw);
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  return normalizePalmSnapshot(parsed, opts?.declaredHand);
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (fenced) return fenced[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

function snapshotSummaryForPrompt(snapshot: PalmSnapshot): string {
  const aligned = alignPalmSnapshot(snapshot);
  const lines: string[] = [];
  lines.push(`Рука: ${PALM_HAND_LABELS[aligned.whichHand]}`);
  lines.push(
    `Тип: ${PALM_HAND_SHAPE_LABELS[aligned.handShape]} — вердикт ${PALM_VERDICT_LABELS[aligned.verdict]}`
  );
  lines.push("Линии:");
  for (const line of aligned.majorLines) {
    lines.push(
      `- ${line.name}: ${line.present ? "есть" : "слабо видна"}, ${line.length}, ${line.quality}${line.note ? ` — ${line.note}` : ""}`
    );
  }
  lines.push("Холмы:");
  for (const mount of aligned.mounts) {
    lines.push(
      `- ${mount.name}: ${mount.prominence}${mount.note ? ` — ${mount.note}` : ""}`
    );
  }
  if (aligned.marks.length) {
    lines.push(
      `Знаки: ${aligned.marks.map((mark) => `${mark.name} (${mark.where})`).join("; ")}`
    );
  }
  return lines.join("\n");
}

const PALM_FULL_REPORT_RULES = `
РЕЖИМ: ПОЛНЫЙ ПРЕМИАЛЬНЫЙ РАЗБОР ЛАДОНИ (оплачен).

Снимок ладони уже сделан и подтверждён — НЕ переспрашивай фото, НЕ выводи служебный JSON, пиши готовый текст для клиента.

СТРУКТУРА ОТЧЁТА (markdown, в этом порядке):
## Ваша рука сейчас
Тип руки и вердикт: что этот рисунок значит в жизни клиента прямо сейчас. 2–3 плотных абзаца.

## Главные линии
По каждой из четырёх линий: название → состояние из снимка → как проявляется в любви, решениях, силе, пути. Разрывы и развилки называй прямо.

## Холмы ладони
По холмам, которые выражены слабо или сильно: качество → как это звучит в характере и делах. Слабые холмы не пропускай молчанием.

## Любовь, путь, ум
Три коротких раздела по акценту вердикта. Если verdict = mixed — дай честный баланс, не выравнивай надеждой.

## Практика на ближайшие дни
2–3 конкретных шага, которые следуют из рисунка руки. Без общих «верьте в себя».

${PREMIUM_PAID_READING_HONESTY}

ДОПОЛНИТЕЛЬНО ДЛЯ ХИРОМАНТИИ:
- Рисунок ладони стабилен неделями: при повторном снимке тип руки и характер главных линий сохраняются, меняются нюансы дня.
- Это символическое чтение, не медицина и не срок жизни. Не предсказывай смерть, болезнь, беременность, развод как факт.
- Оставайся в образе Эвелины; на прямой вопрос «ты ИИ?» — честно, в образе мастера.`;

export async function generatePalmFullReport(
  snapshot: PalmSnapshot,
  ctx: PalmReadingContext
): Promise<string | null> {
  const name = ctx.userName?.trim() || "друг";
  const aligned = alignPalmSnapshot(snapshot);
  const systemPrompt = await wrapSystemPrompt(
    `${PALM_TRADITION_BASE}\n\n${PALM_FULL_REPORT_RULES}`
  );
  const userText = [
    `Клиент: ${name}${ctx.gender ? `, ${ctx.gender.toLowerCase()}` : ""}${ctx.zodiac ? `, ${ctx.zodiac}` : ""}.`,
    `Сегодня: ${ctx.today ?? todayLabelRu()}.`,
    "",
    "СНИМОК ЛАДОНИ (подтверждённый):",
    snapshotSummaryForPrompt(aligned),
    "",
    "Напиши полный разбор по структуре.",
  ].join("\n");

  return completeChat({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    maxTokens: 3200,
    temperature: 0.75,
    isPaid: true,
    timeoutMs: 120_000,
    maxAttempts: 2,
    priority: "report",
  });
}
