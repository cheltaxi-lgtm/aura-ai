import { HD_REPORT_REQUIRED_SECTIONS } from "@/lib/human-design/packages";

/** Final ## titles that must appear in the glued report (order preserved). */
export const HD_PIPELINE_SECTIONS = [
  "Вступление",
  ...HD_REPORT_REQUIRED_SECTIONS,
  "Ответ на ваш запрос",
] as const;

export type HdPipelineSectionTitle = (typeof HD_PIPELINE_SECTIONS)[number];

/**
 * LLM call batches: related ## sections in one call (no content cut).
 * Call count = batches.length + 1 editor ≤ 15.
 */
export const HD_PIPELINE_BATCHES: ReadonlyArray<{
  id: string;
  titles: readonly HdPipelineSectionTitle[];
  maxTokens: number;
}> = [
  {
    // Six sections in one call — at the 1800–2600 char/section target this is the
    // only batch that would otherwise truncate (≈5.7k tokens against a 7k cap).
    id: "type_core",
    titles: [
      "Вступление",
      "Тип и его особенности",
      "Стратегия",
      "Авторитет",
      "Ложное «я»",
      "Подпись",
    ],
    maxTokens: 9000,
  },
  {
    id: "profile_definition",
    titles: ["Профиль", "Определённость и самодостаточность"],
    maxTokens: 4000,
  },
  {
    id: "centers",
    titles: ["Девять центров"],
    maxTokens: 7500,
  },
  {
    id: "channels",
    titles: ["Каналы"],
    maxTokens: 5500,
  },
  {
    id: "planets",
    titles: ["Планеты и узлы"],
    maxTokens: 5000,
  },
  {
    id: "self_reactions",
    titles: ["Как вы себя видите", "Автоматические реакции"],
    maxTokens: 4500,
  },
  {
    id: "work_cross",
    titles: ["Бизнес и работа", "Инкарнационный крест"],
    maxTokens: 4500,
  },
  {
    id: "vars_hidden",
    titles: ["Переменные и среда", "Скрытые разделы карты"],
    maxTokens: 4500,
  },
  {
    id: "sleep_relations",
    titles: ["Сон и восстановление", "Отношения"],
    maxTokens: 5000,
  },
  {
    id: "periods",
    titles: ["Периоды и темы жизни"],
    maxTokens: 3500,
  },
  {
    id: "practices",
    titles: ["Практики на 7 дней", "Практики на 30 дней"],
    maxTokens: 4000,
  },
  {
    id: "focus_answer",
    titles: ["Ответ на ваш запрос"],
    maxTokens: 3500,
  },
];

/** Batches + one editor pass. */
export function expectedHdSectionalLlmCalls(): number {
  return HD_PIPELINE_BATCHES.length + 1;
}

export const HD_PIPELINE_BANS = `
ЖЁСТКИЕ ЗАПРЕТЫ (нарушение = брак отчёта):
1) Никаких рекомендаций по сну, продолжительности сна, режиму сна. Запрещены формулировки вроде «вам вредны 8 часов сна», «спите 4–5 часов».
2) Никаких утверждений о здоровье и болезнях («заболеете», «мигрень», «разрушаете здоровье», обливания, физиологические предписания).
3) Никаких предсказаний событий и привязок к возрасту («в 30 лет потеряете работу», «партнёр бросит», «через месяц после свадьбы»). Периоды жизни — только темы фаз профиля (до 30 / 30–50 / после 50), без конкретных событий.
4) Никаких финансовых/юридических советов и конкретных сумм.
5) Никаких мета-комментариев о своей работе, структуре отчёта, «фрагменте/демонстрации/продолжении», «[редакция:», «Разбор завершён».
6) Никаких обращений к разметке в тексте клиента («## разделы», «### подразделы»).
7) Не обещай исход событий. На запрос об отношениях — механика карты, не прогноз «да/нет».
8) Чистая проза: без **, без экранирования markdown (не пиши 1\\., \\-, \\*). Подпункты — тире «—».
9) Стратегию бери ТОЛЬКО из контракта. Не подменяй стратегией другого типа.
10) Угол и название инкарнационного креста — только из контракта. Висячие ворота — только из списка контракта.
`.trim();
