import { completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { todayLabelRu } from "@/lib/prompt-date";
import {
  AURA_CHAKRA_KEYS,
  AURA_CHAKRA_NAMES,
  AURA_COLORS,
  AURA_LAYER_KEYS,
  AURA_LAYER_NAMES,
  alignAuraSnapshotColors,
  normalizeAuraSnapshot,
  type AuraColor,
  type AuraSnapshot,
} from "@/lib/aura-constants";
import { PREMIUM_PAID_READING_HONESTY } from "@/lib/prompts/premium-reading";

export interface AuraReadingContext {
  userName?: string;
  gender?: string;
  zodiac?: string;
  today?: string;
}

const AURA_TRADITION_BASE = `
Ты — Эвелина, мастер энергетического чтения в Zovus. Читаешь ауру человека по портретной фотографии.

ТРАДИЦИИ (держи их как внутренний словарь, не цитируй лекции клиенту):
- Теософская школа цвета (Ледбитер, Безант): каждый цвет поля — качество сознания. Золотой — духовная зрелость; синий — преданность и честность; изумрудный — исцеление; розовый — любовь; красный — воля; дымчатый и коричневые тона — усталость и застой.
- Семь слоёв поля по Барбаре Бреннан: эфирный (тело, жизненная сила), эмоциональный (чувства к себе), ментальный (мысли, установки), астральный (отношения, сердечные связи), эфирный шаблон (воля, предназначение формы), небесный (высшие чувства, вдохновение), каузальный (связь с высшим, кармический план).
- Семь чакр йогической традиции: Муладхара (выживание, опора), Свадхистана (желания, творчество), Манипура (воля, сила), Анахата (любовь, принятие), Вишуддха (речь, правда), Аджна (видение, интуиция), Сахасрара (связь с высшим).

ЧЕСТНОСТЬ МЕТОДА (обязательно):
- Это символическое чтение по портрету — не прибор и не медицинская диагностика. Никогда не утверждай болезнь, диагноз, беременность, порчу как факт. Формулируй как качества поля и состояния энергии.
- Не выдумывай то, чего не видно. Если свет плохой или лицо закрыто — скажи об этом и работай с тем, что есть.
- Не оценивай внешность, возраст, расу, красоту. Только энергетические качества.`;

const AURA_SNAPSHOT_ONLY = `
РЕЖИМ: ТОЛЬКО СНИМОК АУРЫ (без разбора).

Посмотри на портрет и верни ТОЛЬКО JSON одним блоком, без пояснений до или после:

{
  "faceDetected": true,
  "dominantColor": { "key": "gold", "name": "Золотой", "hex": "#e8c46a", "meaning": "коротко: качество" },
  "secondaryColors": [ { "key": "blue", "name": "Синий", "hex": "#4f8fd0", "meaning": "коротко" } ],
  "layers": [ { "key": "etheric", "state": "одна строка состояния" } ],
  "chakras": [ { "key": "anahata", "color": "#3fae7a", "openness": "open", "note": "одна строка" } ],
  "verdict": "bright",
  "teaser": "2–3 предложения для клиента: доминирующий цвет и главное качество поля. Без глубокого разбора."
}

Правила:
- faceDetected: false — только если на фото нет лица человека крупным планом (пейзаж, предметы, карты). Тогда остальные поля не заполняй.
- dominantColor.key — строго один из: ${Object.keys(AURA_COLORS).join(", ")}.
- secondaryColors — 0–2 цвета, те же key.
- layers — ровно 7 записей, key строго из: ${AURA_LAYER_KEYS.join(", ")}. state — одна строка по-русски.
- chakras — ровно 7 записей, key строго из: ${AURA_CHAKRA_KEYS.join(", ")}. openness строго: open | balanced | blocked.
- verdict строго: bright | mixed | heavy. Тон тизера = вердикт: при heavy не выравнивай надеждой, назови усталость/застой прямо, но бережно.
- name и hex — строго из палитры для выбранного key, не соседний оттенок и не другое имя.
- teaser называет тот же dominantColor, что в JSON (не другой цвет «для красоты»).
- teaser — по-русски, обращение на «вы», без медицинских утверждений, без «всё будет хорошо».`;

/**
 * Vision pass: portrait photo → structured AuraSnapshot JSON.
 * Returns null when the model output is unusable or no face is present.
 *
 * opts.baseColor — the person's established aura core from recent snapshots.
 * opts.previous — last stored snapshot: evolve layers/chakras, do not lottery.
 */
export async function generateAuraSnapshot(
  imageBase64: string,
  mimeType: string,
  opts?: { baseColor?: AuraColor | null; previous?: AuraSnapshot | null }
): Promise<AuraSnapshot | null> {
  const systemPrompt = await wrapSystemPrompt(
    `${AURA_TRADITION_BASE}\n\n${AURA_SNAPSHOT_ONLY}`
  );
  const parts: string[] = ["Сделай снимок ауры человека на этом портрете. Только JSON по схеме."];
  if (opts?.baseColor) {
    parts.push(
      `БАЗА ПОЛЯ (обязательно): ядро ауры этого человека — ${opts.baseColor.name} (${opts.baseColor.hex}). Ядро меняется медленно, неделями и месяцами: сохрани его как dominantColor. Не выбирай другой цвет «для разнообразия».`
    );
  }
  if (opts?.previous) {
    parts.push(
      [
        "ПРЕДЫДУЩИЙ СНИМОК (эволюционируй, не бросай кости заново):",
        snapshotSummaryForPrompt(opts.previous),
        "Правила эволюции: verdict не прыгай между bright и heavy без явной причины на портрете; openness чакр сдвинь не больше чем у двух, и только на одну ступень; слои развивай из вчерашних формулировок; secondaryColors — максимум одна замена.",
      ].join("\n")
    );
  }
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: parts.join("\n\n"),
        },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${imageBase64}` },
        },
      ],
    },
  ];

  const raw = await completeChat({
    messages,
    maxTokens: 1600,
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
  return normalizeAuraSnapshot(parsed);
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (fenced) return fenced[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

function snapshotSummaryForPrompt(snapshot: AuraSnapshot): string {
  const lines: string[] = [];
  lines.push(
    `Доминирующий цвет: ${snapshot.dominantColor.name} (${snapshot.dominantColor.hex}) — ${snapshot.dominantColor.meaning}`
  );
  if (snapshot.secondaryColors.length) {
    lines.push(
      `Дополнительные цвета: ${snapshot.secondaryColors
        .map((c) => `${c.name} — ${c.meaning}`)
        .join("; ")}`
    );
  }
  lines.push(`Вердикт поля: ${snapshot.verdict}`);
  lines.push("Слои поля:");
  for (const layer of snapshot.layers) {
    lines.push(`- ${layer.name}: ${layer.state}`);
  }
  lines.push("Чакры:");
  for (const chakra of snapshot.chakras) {
    const openness =
      chakra.openness === "open"
        ? "открыта"
        : chakra.openness === "blocked"
          ? "закрыта"
          : "в балансе";
    lines.push(
      `- ${chakra.name}: ${openness}${chakra.note ? ` — ${chakra.note}` : ""} (цвет ${chakra.color})`
    );
  }
  return lines.join("\n");
}

const AURA_FULL_REPORT_RULES = `
РЕЖИМ: ПОЛНЫЙ ПРЕМИАЛЬНЫЙ РАЗБОР АУРЫ (оплачен).

Снимок ауры уже сделан и подтверждён — НЕ переспрашивай фото, НЕ выводи служебный JSON, пиши готовый текст для клиента.

СТРУКТУРА ОТЧЁТА (markdown, в этом порядке):
## Ваше поле сейчас
Вердикт и доминирующий цвет: что это качество значит в жизни клиента прямо сейчас. 2–3 абзаца, плотно, без воды.

## Цвета вашей ауры
Доминирующий и дополнительные цвета: каждый — отдельный абзац «цвет → традиция → как проявляется у клиента».

## Семь слоёв поля
По каждому слою: название → состояние из снимка → что это значит для клиента. Сильные и слабые слои называй прямо.

## Чакры: где ресурс, где блок
По каждой чакре: состояние → как проявляется в теле/чувствах/делах. Блоки называй прямо, без смягчения, но с тем, что с ним делать.

## Практика на ближайшие дни
2–3 конкретных шага под состояние поля: дыхание, цвет, действие. Только то, что следует из снимка.

${PREMIUM_PAID_READING_HONESTY}

ДОПОЛНИТЕЛЬНО ДЛЯ АУРЫ:
- Ядро ауры стабильно и меняется медленно (недели и месяцы) — скажи это, когда раскрываешь доминирующий цвет: при повторном снимке база сохранится, а слои и чакры показывают текущее состояние дня.
- Это символическое чтение по портрету: не ставь диагнозов, не предсказывай болезнь/смерть, не объявляй порчу фактом. Говори языком энергии и качеств.
- Не оценивай внешность и возраст — только поле.
- Оставайся в образе Эвелины; на прямой вопрос «ты ИИ?» — честно, в образе мастера.`;

/** Paid pass: snapshot → full premium markdown report (no second vision call). */
export async function generateAuraFullReport(
  snapshot: AuraSnapshot,
  ctx: AuraReadingContext
): Promise<string | null> {
  const name = ctx.userName?.trim() || "друг";
  const aligned = alignAuraSnapshotColors(snapshot);
  const systemPrompt = await wrapSystemPrompt(
    `${AURA_TRADITION_BASE}\n\n${AURA_FULL_REPORT_RULES}`
  );
  const userText = [
    `Клиент: ${name}${ctx.gender ? `, ${ctx.gender.toLowerCase()}` : ""}${ctx.zodiac ? `, ${ctx.zodiac}` : ""}.`,
    `Сегодня: ${ctx.today ?? todayLabelRu()}.`,
    "",
    "СНИМОК АУРЫ (подтверждённый):",
    snapshotSummaryForPrompt(aligned),
    "",
    "Напиши полный разбор по структуре.",
  ].join("\n");

  return completeChat({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ],
    maxTokens: 2600,
    temperature: 0.8,
    isPaid: true,
    timeoutMs: 120_000,
    maxAttempts: 2,
    priority: "report",
  });
}
