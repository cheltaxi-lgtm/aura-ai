/**
 * Live check: a paid spread must always come back as AI text.
 * Runs real LLM calls — manual / on-server only, never part of the deploy gate.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/verify-reading-always-ai.ts
 */
import { buildCharacterPrompt, generateReading } from "../src/lib/chat-prompts";
import { isPaidSpreadTextComplete } from "../src/lib/spread-reading-complete";

type Case = {
  label: string;
  characterId: string;
  question: string;
  cards: { name: string; meaning: string }[];
  positions: string[];
};

const CASES: Case[] = [
  {
    label: "war / survival (crisis)",
    characterId: "veronika",
    question: "Вернётся ли родной брат жены живым с войны?",
    cards: [
      { name: "Рыцарь Кубков", meaning: "движение, предложение, следование за чувством" },
      { name: "Башня", meaning: "внезапный слом прежней конструкции" },
      { name: "Десятка Мечей", meaning: "предел, завершение тяжёлого этапа" },
    ],
    positions: ["Что происходит", "Что скрыто", "К чему ведёт"],
  },
  {
    label: "health / fear",
    characterId: "agafya",
    question: "Мама тяжело болеет, будет ли она жить?",
    cards: [
      { name: "Звезда", meaning: "надежда, восстановление сил" },
      { name: "Пятёрка Пентаклей", meaning: "лишения, нехватка поддержки" },
      { name: "Солнце", meaning: "ясность, выздоровление, свет" },
    ],
    positions: ["Что происходит", "Что скрыто", "К чему ведёт"],
  },
  {
    label: "ordinary money question",
    characterId: "ragnar",
    question: "Стоит ли брать этот кредит на бизнес?",
    cards: [
      { name: "Fehu", meaning: "имущество, подвижный капитал" },
      { name: "Nauthiz", meaning: "нужда, вынужденное ограничение" },
      { name: "Jera", meaning: "урожай в срок, результат по труду" },
    ],
    positions: ["Что происходит", "Что скрыто", "К чему ведёт"],
  },
];

async function runCase(c: Case): Promise<boolean> {
  const systemPrompt = buildCharacterPrompt(
    c.characterId,
    {
      userName: "Юлия",
      gender: "женский",
      zodiac: "Рыбы",
      birthDate: "1990-03-05",
      today: new Date().toISOString().slice(0, 10),
      tarotCards: c.cards,
      isPaid: true,
    },
    {
      intention: "custom",
      customQuestion: c.question,
      spreadId: "triplet",
      spreadType: "new",
      positionLabels: c.positions,
    }
  );

  const started = Date.now();
  const result = await generateReading(systemPrompt, {
    userName: "Юлия",
    tarotCards: c.cards,
    isPaid: true,
    characterId: c.characterId,
    intention: "custom",
    spreadId: "triplet",
    positionLabels: c.positions,
    userMessage: c.question,
  });
  const seconds = Math.round((Date.now() - started) / 100) / 10;

  const cardNames = c.cards.map((x) => x.name);
  const complete = isPaidSpreadTextComplete(result.text, cardNames);
  const ok = result.fromLlm && result.text.trim().length >= 200 && complete;

  console.log(`\n=== ${c.label} (${c.characterId}) — ${seconds}s ===`);
  console.log(`fromLlm=${result.fromLlm} length=${result.text.trim().length} complete=${complete}`);
  console.log(result.text.trim().slice(0, 600));
  console.log(ok ? "RESULT: OK" : "RESULT: FAILED");
  return ok;
}

async function main() {
  let failures = 0;
  for (const c of CASES) {
    try {
      if (!(await runCase(c))) failures += 1;
    } catch (err) {
      failures += 1;
      console.error(`\n=== ${c.label} — THREW ===`);
      console.error(err);
    }
  }
  console.log(`\n${CASES.length - failures}/${CASES.length} cases returned an AI reading.`);
  if (failures) process.exit(1);
}

void main();
