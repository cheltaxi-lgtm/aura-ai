import { personEntityKey } from "@/lib/memory/entities";
import { gf } from "../helpers";
import type { GoldenFact, GoldenScenario } from "../types";

const CITIES = [
  "Казани",
  "Твери",
  "Пскове",
  "Туле",
  "Омске",
  "Томске",
  "Перми",
  "Уфе",
  "Сочи",
  "Краснодаре",
];
const COMPANIES = [
  "Аэрофлот",
  "Яндекс",
  "Сбер",
  "Магнит",
  "Ростелеком",
  "Газпром",
  "Тинькофф",
  "Ozon",
  "Wildberries",
  "Мегафон",
];
const NAMES = [
  "Игорь",
  "Олег",
  "Павел",
  "Кирилл",
  "Денис",
  "Роман",
  "Никита",
  "Алина",
  "Оксана",
  "Вера",
];

function longHorizon(turns: number, id: string): GoldenScenario {
  const memory: GoldenFact[] = [];
  const goldTurns: GoldenScenario["turns"] = [];
  const firstName = "Леонид";
  const key = personEntityKey(firstName, "former_partner");
  const start = gf(
    `${id}-start`,
    `Клиент расстаётся с ${firstName}`,
    "relationship.status",
    {
      entityKey: key,
      category: "relationship",
      evidenceQuote: `с ${firstName} расстаёмся`,
      markers: [`расстаётся с ${firstName}`],
      critical: true,
      salience: 5,
    }
  );
  goldTurns.push({
    userMessage: `Мы с ${firstName} расстаёмся после пяти лет.`,
    goldFacts: [start],
  });
  memory.push(start);

  for (let i = 2; i <= turns; i++) {
    const city = CITIES[i % CITIES.length];
    const company = COMPANIES[i % COMPANIES.length];
    const fid = `${id}-t${i}`;
    const fact = gf(
      fid,
      `Клиент в месяце ${i} ездила в ${city} по делам ${company}`,
      "other",
      {
        category: "other",
        evidenceQuote: `ездила в ${city} по делам ${company}`,
        markers: [`месяце ${i} ездила в ${city}`],
        archiveTier: i < turns - 8 ? "archived" : "hot",
        salience: i === turns ? 4 : 2,
      }
    );
    goldTurns.push({
      userMessage: `В месяце ${i} я ездила в ${city} по делам ${company}.`,
      goldFacts: [fact],
    });
    memory.push(fact);
  }

  const last = memory[memory.length - 1];
  return {
    id,
    category: "повторяющиеся ситуации",
    turns: goldTurns,
    memory,
    queries: [
      {
        id: `${id}-keep-start`,
        query: `Что сейчас с ${firstName}?`,
        mustInclude: [start.id],
        mustNotInclude: [],
        critical: true,
        entity: true,
        archived: start.archiveTier === "archived",
      },
      {
        id: `${id}-recent`,
        query: `Что было в месяце ${turns}, когда я ездила в ${CITIES[turns % CITIES.length]} по делам ${COMPANIES[turns % COMPANIES.length]}?`,
        mustInclude: [last.id],
        mustNotInclude: [],
      },
    ],
  };
}

function categoryGrid(): GoldenScenario[] {
  const out: GoldenScenario[] = [];
  NAMES.forEach((name, i) => {
    const key = personEntityKey(name, i % 2 === 0 ? "friend" : "relative")!;
    const fact = gf(
      `grid-${name}`,
      `Клиент дружит с ${name} с ${2010 + i} года`,
      i % 2 === 0 ? "family.friend" : "family.relative",
      {
        entityKey: key,
        category: "family",
        evidenceQuote: `дружу с ${name}`,
        markers: [`дружит с ${name}`],
        critical: true,
      }
    );
    out.push({
      id: `people-${name.toLowerCase()}`,
      category: i % 2 === 0 ? "отношения" : "родители",
      turns: [
        {
          userMessage: `Я дружу с ${name} с ${2010 + i} года, это важный человек.`,
          goldFacts: [fact],
        },
      ],
      memory: [fact],
      queries: [
        {
          id: `q-${name}`,
          query: `Что сейчас с ${name}?`,
          mustInclude: [fact.id],
          mustNotInclude: [],
          entity: true,
          critical: true,
        },
      ],
    });
  });

  COMPANIES.forEach((company, i) => {
    const prev = gf(
      `job-${company}-old`,
      `Клиент раньше работал в ${company} курьером`,
      "employment.former",
      {
        status: "superseded",
        category: "work",
        evidenceQuote: `работала в ${company} курьером`,
        markers: [`работал в ${company} курьером`],
        archiveTier: "archived",
      }
    );
    const now = gf(
      `job-${company}-now`,
      `Клиент работает аналитиком после ${company}`,
      "employment.current",
      {
        category: "work",
        evidenceQuote: `теперь аналитик после ${company}`,
        markers: [`аналитиком после ${company}`],
        critical: i === 0,
      }
    );
    out.push({
      id: `job-cycle-${company.toLowerCase()}`,
      category: "смена работы",
      turns: [
        {
          userMessage: `Я работала в ${company} курьером, потом ушла.`,
          goldFacts: [prev],
        },
        {
          userMessage: `Теперь я аналитик после опыта в ${company}.`,
          goldFacts: [now],
        },
      ],
      memory: [prev, now],
      queries: [
        {
          id: `recover-${company}`,
          query: `Что было с работой в ${company}?`,
          mustInclude: [prev.id],
          mustNotInclude: [],
          expectArchivedRecovery: true,
          archived: true,
          timeline: true,
        },
      ],
    });
  });
  return out;
}

function archiveVolume(): GoldenScenario {
  const memory: GoldenFact[] = [];
  const protectedFact = gf(
    "arch-protected",
    "Клиент подтвердила, что сын Артём живёт с ней",
    "family.child",
    {
      entityKey: personEntityKey("Артём", "child"),
      captureTier: "user_confirmed",
      sourceType: "user",
      manual: true,
      critical: true,
      category: "family",
      evidenceQuote: "сын Артём живёт со мной",
      markers: ["сын Артём живёт"],
      salience: 5,
    }
  );
  memory.push(protectedFact);

  const oldSergey = gf(
    "arch-sergey",
    "Клиент развелась с Сергеем в 2018 и уехала из Волжского",
    "relationship.divorce",
    {
      entityKey: personEntityKey("Сергей", "former_spouse"),
      archiveTier: "archived",
      status: "superseded",
      category: "relationship",
      eventDate: "2018-06-01",
      evidenceQuote: "развелась с Сергеем",
      markers: ["развелась с Сергеем в 2018"],
      critical: true,
      salience: 5,
    }
  );
  memory.push(oldSergey);

  for (let i = 0; i < 320; i++) {
    memory.push(
      gf(
        `arch-filler-${i}`,
        `Клиент в ${2015 + (i % 10)} году покупала книгу номер ${i + 1} про саморазвитие`,
        "other",
        {
          archiveTier: "archived",
          category: "other",
          evidenceQuote: `покупала книгу номер ${i + 1}`,
          markers: [`книгу номер ${i + 1}`],
          salience: 1,
        }
      )
    );
  }

  return {
    id: "archive-300",
    category: "повторяющиеся ситуации",
    turns: [
      {
        userMessage: "Сын Артём живёт со мной. В 2018 я развелась с Сергеем и уехала из Волжского.",
        goldFacts: [protectedFact, oldSergey],
      },
    ],
    memory,
    queries: [
      {
        id: "protected-survives",
        query: "Как дела у сына Артёма?",
        mustInclude: ["arch-protected"],
        mustNotInclude: ["arch-filler-0", "arch-filler-100"],
        manual: true,
        critical: true,
      },
      {
        id: "archived-sergey",
        query: "Что сейчас с Сергеем и старым разводом?",
        mustInclude: ["arch-sergey"],
        mustNotInclude: [],
        expectArchivedRecovery: true,
        archived: true,
        entity: true,
        critical: true,
      },
      {
        id: "work-no-archive-dump",
        query: "Стоит ли менять работу?",
        mustInclude: [],
        mustNotInclude: ["arch-filler-1", "arch-filler-2", "arch-filler-3"],
        irrelevance: true,
      },
    ],
  };
}

function volume1000(): GoldenScenario {
  const memory: GoldenFact[] = [];
  for (let i = 0; i < 1000; i++) {
    memory.push(
      gf(
        `vol-${i}`,
        `Клиент отмечала день ${i + 1} без важного решения`,
        "other",
        {
          archiveTier: i < 900 ? "archived" : "warm",
          category: "other",
          evidenceQuote: `день ${i + 1} без важного решения`,
          markers: [`день ${i + 1} без`],
          salience: 1,
        }
      )
    );
  }
  const needle = gf(
    "vol-needle",
    "Клиент хранит кольцо бабушки Веры в шкатулке",
    "family.relative",
    {
      entityKey: personEntityKey("Вера", "relative"),
      archiveTier: "archived",
      category: "family",
      evidenceQuote: "кольцо бабушки Веры",
      markers: ["кольцо бабушки Веры"],
      critical: true,
      salience: 5,
    }
  );
  memory.push(needle);
  return {
    id: "volume-1000",
    category: "повторяющиеся ситуации",
    turns: [],
    memory,
    queries: [
      {
        id: "needle",
        query: "Где кольцо бабушки Веры?",
        mustInclude: ["vol-needle"],
        mustNotInclude: [],
        archived: true,
        entity: true,
        critical: true,
      },
    ],
  };
}

function extraCoverage(): GoldenScenario[] {
  const rows: Array<{ id: string; category: string; msg: string; fact: string; pred: string; q: string }> = [
    { id: "pref-email", category: "предпочтения", msg: "Пишите мне только на почту, мессенджеры не читаю.", fact: "Клиент предпочитает почту, а не мессенджеры", pred: "preference.stated", q: "Как лучше со мной связываться по почте?" },
    { id: "plan-move", category: "планы", msg: "В ноябре собираюсь закрыть студию на ремонт.", fact: "Клиент в ноябре закроет студию на ремонт", pred: "event.upcoming", q: "Что у меня запланировано со студией в ноябре?" },
    { id: "recur-panic", category: "повторяющиеся ситуации", msg: "Каждую весну у меня обостряется тревога перед отчётами.", fact: "Каждую весну у клиента обостряется тревога перед отчётами", pred: "health.condition", q: "Почему весной мне снова тревожно перед отчётами?" },
    { id: "money-income", category: "деньги", msg: "Мой основной доход — это керамика, около 80 тысяч в месяц.", fact: "Основной доход клиента — керамика около 80 тысяч", pred: "other", q: "Как у меня с доходом от керамики?" },
    { id: "ex-olga", category: "бывшие отношения", msg: "С Ольгой мы расстались в 2019 и больше не общаемся.", fact: "Клиент рассталась с Ольгой в 2019", pred: "relationship.former_partner", q: "Что осталось между мной и Ольгой?" },
    { id: "dad-ivan", category: "родители", msg: "Папа Иван живёт один в Саратове после пенсии.", fact: "Отец клиента Иван живёт один в Саратове", pred: "family.parent", q: "Как там папа Иван в Саратове?" },
    { id: "daughter", category: "дети", msg: "Дочь Нина ходит в пятый класс и занимается скрипкой.", fact: "У клиента дочь Нина, она учится в пятом классе", pred: "family.child", q: "Что происходит с дочерью Ниной и скрипкой?" },
    { id: "debt2", category: "долги", msg: "Есть микрозайм 60 тысяч, который я закрываю до декабря.", fact: "У клиента микрозайм 60 тысяч до декабря", pred: "finance.debt", q: "Как закрыть микрозайм до декабря?" },
    { id: "edu-mba", category: "образование", msg: "Поступила на вечернюю MBA в РАНХиГС.", fact: "Клиент учится на вечерней MBA в РАНХиГС", pred: "education.current", q: "Стоит ли продолжать MBA в РАНХиГС?" },
    { id: "biz2", category: "бизнес", msg: "Партнёр по бизнесу хочет продать нашу мастерскую.", fact: "Партнёр хочет продать мастерскую клиента", pred: "employment.current", q: "Что делать, если партнёр продаёт мастерскую?" },
  ];
  return rows.map((row) => {
    const named =
      row.id === "ex-olga"
        ? personEntityKey("Ольга", "former_partner")
        : row.id === "dad-ivan"
          ? personEntityKey("Иван", "parent")
          : row.id === "daughter"
            ? personEntityKey("Нина", "child")
            : null;
    const fact = gf(row.id, row.fact, row.pred, {
      category: "other",
      evidenceQuote: row.msg.slice(0, 80),
      markers: [row.fact.slice(0, 32)],
      critical: true,
      entityKey: named,
    });
    return {
      id: row.id,
      category: row.category,
      turns: [{ userMessage: row.msg, goldFacts: [fact] }],
      memory: [fact],
      queries: [
        {
          id: `${row.id}-q`,
          query: row.q,
          mustInclude: [row.id],
          mustNotInclude: [],
          critical: true,
        },
      ],
    };
  });
}

export function generatedScenarios(): GoldenScenario[] {
  return [
    longHorizon(10, "horizon-10"),
    longHorizon(30, "horizon-30"),
    longHorizon(100, "horizon-100"),
    ...categoryGrid(),
    archiveVolume(),
    volume1000(),
    ...extraCoverage(),
  ];
}
