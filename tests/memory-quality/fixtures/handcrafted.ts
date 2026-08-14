import { gf, KEY } from "../helpers";
import type { GoldenScenario } from "../types";

export function handcraftedScenarios(): GoldenScenario[] {
  const sergeyDivorce = gf(
    "s-sergey-divorce",
    "Клиент развёлся с Сергеем в сентябре 2024",
    "relationship.divorce",
    {
      entityKey: KEY.sergeyEx,
      eventDate: "2024-09-15",
      category: "relationship",
      evidenceQuote: "разводимся",
      markers: ["развёлся с Сергеем", "Сергеем в сентябре"],
      critical: true,
      salience: 5,
    }
  );
  const sergeySplit = gf(
    "s-sergey-split",
    "Клиент не живёт с Сергеем с января 2024",
    "relationship.former_partner",
    {
      entityKey: KEY.sergeyEx,
      eventDate: "2024-01-01",
      category: "relationship",
      evidenceQuote: "Вместе не живём с января 2024",
      markers: ["не живёт с Сергеем", "января 2024"],
      critical: true,
      salience: 5,
    }
  );
  const sergeyStatusOld = gf(
    "s-sergey-status-old",
    "Клиент в процессе развода с Сергеем",
    "relationship.status",
    {
      entityKey: KEY.sergeyEx,
      status: "superseded",
      category: "relationship",
      evidenceQuote: "Мы с Сергеем разводимся",
      markers: ["процессе развода с Сергеем"],
    }
  );
  const antonDating = gf(
    "s-anton-dating",
    "Клиент начала встречаться с Антоном",
    "relationship.partner",
    {
      entityKey: KEY.antonPartner,
      status: "superseded",
      category: "relationship",
      evidenceQuote: "Начала встречаться с Антоном",
      markers: ["встречаться с Антоном"],
    }
  );
  const antonSplit = gf(
    "s-anton-split",
    "Клиент рассталась с Антоном",
    "relationship.former_partner",
    {
      entityKey: KEY.antonPartner,
      category: "relationship",
      evidenceQuote: "Мы с Антоном расстались",
      markers: ["рассталась с Антоном"],
      status: "active",
    }
  );
  const statusSingle = gf(
    "s-status-single",
    "Клиент сейчас не в отношениях",
    "relationship.status",
    {
      category: "relationship",
      evidenceQuote: "Мы с Антоном расстались",
      markers: ["не в отношениях"],
      captureTier: "user_confirmed",
      sourceType: "user",
      manual: true,
      critical: true,
      salience: 5,
    }
  );

  const colleague = gf(
    "e-sergey-col",
    "Коллега клиента Сергей работает в отделе продаж",
    "family.colleague",
    {
      entityKey: KEY.sergeyCol,
      category: "work",
      evidenceQuote: "коллега Сергей из отдела продаж",
      markers: ["Коллега клиента Сергей", "отдел продаж"],
      critical: true,
    }
  );
  const doctor = gf(
    "e-sergey-doc",
    "Врач клиента — Сергей Петров",
    "family.friend",
    {
      entityKey: KEY.sergeyDoc,
      category: "health",
      evidenceQuote: "терапевт Сергей Петров",
      markers: ["Сергей Петров"],
      critical: true,
    }
  );

  const jobSearch = gf(
    "w-search",
    "Клиент ищет работу",
    "employment.searching",
    {
      status: "superseded",
      category: "work",
      evidenceQuote: "Я ищу работу",
      markers: ["ищет работу"],
    }
  );
  const jobNow = gf(
    "w-current",
    "Клиент устроился менеджером в Северсталь",
    "employment.current",
    {
      category: "work",
      evidenceQuote: "устроился менеджером в Северсталь",
      markers: ["менеджером в Северсталь"],
      critical: true,
      salience: 5,
    }
  );

  const child = gf(
    "f-artem",
    "У клиента сын Артём",
    "family.child",
    {
      entityKey: KEY.artem,
      category: "family",
      evidenceQuote: "сын Артём",
      markers: ["сын Артём"],
      critical: true,
      captureTier: "user_confirmed",
      sourceType: "user",
      manual: true,
      salience: 5,
    }
  );
  const parent = gf(
    "f-marina",
    "Мать клиента — Марина, живёт в Самаре",
    "family.parent",
    {
      entityKey: KEY.marina,
      category: "family",
      evidenceQuote: "мама Марина в Самаре",
      markers: ["Марина, живёт в Самаре"],
    }
  );

  const debt = gf(
    "m-debt",
    "У клиента долг по кредиту 400 тысяч",
    "finance.debt",
    {
      category: "money",
      sensitivity: "sensitive",
      evidenceQuote: "долг по кредиту 400 тысяч",
      markers: ["долг по кредиту 400"],
      salience: 5,
    }
  );
  const health = gf(
    "h-migraine",
    "У клиента хроническая мигрень",
    "health.condition",
    {
      category: "health",
      sensitivity: "sensitive",
      evidenceQuote: "хроническая мигрень",
      markers: ["хроническая мигрень"],
    }
  );

  const resOld = gf(
    "r-volzhsky",
    "Клиент жил в Волжском",
    "residence.former",
    {
      status: "superseded",
      category: "other",
      evidenceQuote: "жила в Волжском",
      markers: ["жил в Волжском"],
    }
  );
  const resNow = gf(
    "r-moscow",
    "Клиент живёт в Москве",
    "residence.current",
    {
      category: "other",
      evidenceQuote: "переехала в Москву",
      markers: ["живёт в Москве"],
      critical: true,
    }
  );

  const eduOld = gf(
    "ed-old",
    "Клиент учился на экономиста в ВолГУ",
    "education.former",
    {
      status: "superseded",
      category: "other",
      evidenceQuote: "училась на экономиста в ВолГУ",
      markers: ["экономиста в ВолГУ"],
    }
  );
  const eduNow = gf(
    "ed-now",
    "Клиент проходит курс UX-дизайна",
    "education.current",
    {
      category: "other",
      evidenceQuote: "курс UX-дизайна",
      markers: ["курс UX-дизайна"],
    }
  );

  const biz = gf(
    "b-studio",
    "Клиент ведёт студию керамики",
    "employment.current",
    {
      category: "work",
      evidenceQuote: "свою студию керамики",
      markers: ["студию керамики"],
    }
  );

  const goalOld = gf(
    "g-old",
    "Клиент хотел переехать в Грузию",
    "goal.current",
    {
      status: "superseded",
      category: "goal",
      evidenceQuote: "хочу переехать в Грузию",
      markers: ["переехать в Грузию"],
    }
  );
  const goalNow = gf(
    "g-now",
    "Клиент хочет открыть мастерскую в Москве",
    "goal.current",
    {
      category: "goal",
      evidenceQuote: "хочу открыть мастерскую в Москве",
      markers: ["мастерскую в Москве"],
      critical: true,
      captureTier: "user_confirmed",
      sourceType: "user",
      manual: true,
    }
  );

  const event = gf(
    "ev-exam",
    "Клиент сдаёт экзамен 20 сентября 2026",
    "event.upcoming",
    {
      category: "event",
      eventDate: "2026-09-20",
      evidenceQuote: "экзамен 20 сентября",
      markers: ["экзамен 20 сентября"],
    }
  );

  const pref = gf(
    "p-no-phone",
    "Клиент не любит созвоны, предпочитает переписку",
    "preference.stated",
    {
      category: "other",
      evidenceQuote: "не люблю созвоны",
      markers: ["не любит созвоны"],
    }
  );

  const recur = gf(
    "rec-sunday",
    "Каждое воскресенье клиент ездит к матери",
    "other",
    {
      category: "other",
      evidenceQuote: "каждое воскресенье езжу к маме",
      markers: ["воскресенье клиент ездит"],
    }
  );

  const manualHome = gf(
    "man-home",
    "Клиент снимает квартиру на Бауманской",
    "residence.current",
    {
      category: "other",
      captureTier: "user_confirmed",
      sourceType: "user",
      manual: true,
      critical: true,
      evidenceQuote: "снимаю квартиру на Бауманской",
      markers: ["квартиру на Бауманской"],
      salience: 5,
    }
  );

  return [
    {
      id: "long-sergey-anton",
      category: "бывшие отношения",
      turns: [
        {
          userMessage: "Мы с Сергеем разводимся. Вместе не живём с января 2024.",
          goldFacts: [sergeyStatusOld, sergeySplit],
        },
        {
          userMessage: "Развод с Сергеем состоялся в сентябре 2024.",
          goldFacts: [{ ...sergeyDivorce, evidenceQuote: "Развод с Сергеем состоялся" }],
        },
        {
          userMessage: "Начала встречаться с Антоном.",
          goldFacts: [antonDating],
        },
        {
          userMessage: "Мы с Антоном расстались.",
          goldFacts: [antonSplit, statusSingle],
        },
      ],
      memory: [
        sergeyStatusOld,
        sergeySplit,
        sergeyDivorce,
        antonDating,
        antonSplit,
        statusSingle,
      ],
      queries: [
        {
          id: "sergey-now",
          query: "Что сейчас происходит с Сергеем?",
          mustInclude: ["s-sergey-divorce", "s-sergey-split"],
          mustNotInclude: ["s-anton-dating"],
          expectCurrentNot: ["s-anton-dating"],
          critical: true,
          entity: true,
          timeline: true,
        },
        {
          id: "sergey-inflection",
          query: "Что будет к Сергею, если я напишу Сергею и встречусь с Сергеем?",
          mustInclude: ["s-sergey-divorce"],
          mustNotInclude: [],
          entity: true,
        },
      ],
    },
    {
      id: "entity-three-sergeys",
      category: "несколько людей с одинаковыми именами",
      turns: [
        {
          userMessage: "Бывший муж Сергей живёт в Волжском.",
          goldFacts: [
            {
              ...sergeySplit,
              evidenceQuote: "Бывший муж Сергей живёт в Волжском",
            },
          ],
        },
        {
          userMessage: "На работе коллега Сергей из отдела продаж помогает с отчётами.",
          goldFacts: [colleague],
        },
        {
          userMessage: "Мой терапевт Сергей Петров назначил обследования.",
          goldFacts: [doctor],
        },
      ],
      memory: [sergeySplit, colleague, doctor],
      queries: [
        {
          id: "ex-only",
          query: "Что сейчас между мной и бывшим мужем Сергеем?",
          mustInclude: ["s-sergey-split"],
          mustNotInclude: ["e-sergey-col", "e-sergey-doc"],
          entity: true,
          critical: true,
        },
        {
          id: "colleague-only",
          query: "Как строить работу с коллегой Сергеем из продаж?",
          mustInclude: ["e-sergey-col"],
          mustNotInclude: ["s-sergey-split", "e-sergey-doc"],
          entity: true,
          critical: true,
        },
        {
          id: "doctor-only",
          query: "Стоит ли доверять врачу Сергею Петрову?",
          mustInclude: ["e-sergey-doc"],
          mustNotInclude: ["s-sergey-split", "e-sergey-col"],
          entity: true,
          critical: true,
        },
      ],
    },
    {
      id: "work-change",
      category: "смена работы",
      turns: [
        {
          userMessage: "Я ищу работу уже три месяца.",
          goldFacts: [jobSearch],
        },
        {
          userMessage: "Я устроился менеджером в Северсталь.",
          goldFacts: [jobNow],
        },
      ],
      memory: [jobSearch, jobNow],
      queries: [
        {
          id: "work-now",
          query: "Стоит ли менять работу?",
          mustInclude: ["w-current"],
          mustNotInclude: [],
          expectCurrentNot: ["w-search"],
          timeline: true,
          critical: true,
        },
      ],
    },
    {
      id: "family-children-parents",
      category: "дети",
      turns: [
        {
          userMessage: "У меня сын Артём, ему семь лет.",
          goldFacts: [child],
        },
        {
          userMessage: "Мама Марина живёт в Самаре и часто болеет.",
          goldFacts: [parent],
        },
      ],
      memory: [child, parent],
      queries: [
        {
          id: "family-q",
          query: "Как сейчас мои отношения с сыном и мамой?",
          mustInclude: ["f-artem", "f-marina"],
          mustNotInclude: [],
          critical: true,
        },
      ],
    },
    {
      id: "money-debt",
      category: "долги",
      turns: [
        {
          userMessage: "У меня долг по кредиту 400 тысяч, платить тяжело.",
          goldFacts: [debt],
        },
      ],
      memory: [debt],
      queries: [
        {
          id: "money-q",
          query: "Что делать с долгами и кредитом?",
          mustInclude: ["m-debt"],
          mustNotInclude: [],
        },
      ],
    },
    {
      id: "health",
      category: "здоровье",
      turns: [
        {
          userMessage: "У меня хроническая мигрень уже два года.",
          goldFacts: [health],
        },
      ],
      memory: [health],
      queries: [
        {
          id: "health-q",
          query: "Как мигрень влияет на мои планы?",
          mustInclude: ["h-migraine"],
          mustNotInclude: [],
        },
      ],
    },
    {
      id: "residence-move",
      category: "переезды",
      turns: [
        {
          userMessage: "Раньше жила в Волжском, теперь переехала в Москву.",
          goldFacts: [resOld, resNow],
        },
      ],
      memory: [resOld, resNow],
      queries: [
        {
          id: "where",
          query: "Стоит ли снова менять город?",
          mustInclude: ["r-moscow"],
          mustNotInclude: [],
          expectCurrentNot: ["r-volzhsky"],
          timeline: true,
        },
      ],
    },
    {
      id: "education",
      category: "образование",
      turns: [
        {
          userMessage: "Училась на экономиста в ВолГУ, сейчас прохожу курс UX-дизайна.",
          goldFacts: [eduOld, eduNow],
        },
      ],
      memory: [eduOld, eduNow],
      queries: [
        {
          id: "edu-q",
          query: "Поможет ли учёба сменить профессию?",
          mustInclude: ["ed-now"],
          mustNotInclude: [],
          expectCurrentNot: ["ed-old"],
        },
      ],
    },
    {
      id: "business",
      category: "бизнес",
      turns: [
        {
          userMessage: "Я открыла свою студию керамики и веду её сама.",
          goldFacts: [biz],
        },
      ],
      memory: [biz],
      queries: [
        {
          id: "biz-q",
          query: "Как развивать мой бизнес и студию?",
          mustInclude: ["b-studio"],
          mustNotInclude: [],
        },
      ],
    },
    {
      id: "goals",
      category: "цели",
      turns: [
        {
          userMessage: "Раньше хотела переехать в Грузию, теперь хочу открыть мастерскую в Москве.",
          goldFacts: [
            { ...goalOld, evidenceQuote: "хотела переехать в Грузию" },
            { ...goalNow, evidenceQuote: "открыть мастерскую в Москве" },
          ],
        },
      ],
      memory: [goalOld, goalNow],
      queries: [
        {
          id: "goal-q",
          query: "Какие у меня сейчас цели и планы?",
          mustInclude: ["g-now"],
          mustNotInclude: [],
          expectCurrentNot: ["g-old"],
          manual: true,
          critical: true,
        },
      ],
    },
    {
      id: "events-pref-recur",
      category: "события",
      turns: [
        {
          userMessage: "20 сентября сдаю экзамен. Не люблю созвоны, лучше писать. Каждое воскресенье езжу к маме.",
          goldFacts: [
            { ...event, evidenceQuote: "20 сентября сдаю экзамен" },
            pref,
            recur,
          ],
        },
      ],
      memory: [event, pref, recur],
      queries: [
        {
          id: "event-q",
          query: "Что важно учесть в ближайших планах и экзамене?",
          mustInclude: ["ev-exam"],
          mustNotInclude: [],
        },
      ],
    },
    {
      id: "irrelevance-work",
      category: "работа",
      turns: [],
      memory: [jobNow, sergeyDivorce, child, health, debt, parent],
      queries: [
        {
          id: "work-only",
          query: "Стоит ли менять работу?",
          product: "chat",
          depth: "standard",
          mustInclude: ["w-current"],
          mustNotInclude: ["s-sergey-divorce", "h-migraine", "f-artem"],
          irrelevance: true,
          critical: true,
        },
      ],
    },
    {
      id: "authority-manual",
      category: "предпочтения",
      turns: [
        {
          userMessage: "Я снимаю квартиру на Бауманской.",
          goldFacts: [manualHome],
        },
      ],
      memory: [manualHome],
      queries: [
        {
          id: "manual-q",
          query: "Где я сейчас живу и снимаю жильё?",
          mustInclude: ["man-home"],
          mustNotInclude: [],
          manual: true,
          critical: true,
        },
      ],
    },
    {
      id: "prediction-contamination",
      category: "отношения",
      turns: [
        {
          userMessage: "Я думаю о работе и устала.",
          assistantReply: "Карты обещают скорую свадьбу и беременность.",
          goldFacts: [],
          contamination: [
            {
              fact: "Клиент скоро выйдет замуж",
              evidenceQuote: "карты обещают скорую свадьбу",
              predicateKey: "relationship.status",
            },
          ],
        },
      ],
      memory: [],
      queries: [],
    },
    {
      id: "cross-master",
      category: "отношения",
      turns: [
        {
          userMessage: "Мы с Сергеем развелись в сентябре 2024.",
          goldFacts: [
            { ...sergeyDivorce, evidenceQuote: "с Сергеем развелись в сентябре 2024" },
          ],
        },
      ],
      memory: [sergeyDivorce, statusSingle],
      queries: [
        {
          id: "master-b",
          query: "Что сейчас между мной и Сергеем?",
          characterId: "evelina",
          mustInclude: ["s-sergey-divorce"],
          mustNotInclude: [],
          crossMaster: true,
          critical: true,
          entity: true,
        },
      ],
    },
    {
      id: "cross-product",
      category: "работа",
      turns: [],
      memory: [jobNow, goalNow],
      queries: [
        {
          id: "tarot",
          query: "Стоит ли менять работу?",
          product: "reading",
          mustInclude: ["w-current"],
          mustNotInclude: [],
          crossProduct: true,
        },
        {
          id: "intention",
          query: "Помоги с намерением про работу",
          product: "intention",
          mustInclude: ["w-current"],
          mustNotInclude: [],
          crossProduct: true,
        },
        {
          id: "photo",
          query: "Что видно по работе на фото",
          product: "photo",
          mustInclude: ["w-current"],
          mustNotInclude: [],
          crossProduct: true,
        },
        {
          id: "natal",
          query: "Как натальная карта говорит о карьере",
          product: "natal",
          mustInclude: ["w-current"],
          mustNotInclude: [],
          crossProduct: true,
        },
        {
          id: "hd",
          query: "Как дизайн человека связан с работой",
          product: "hd",
          mustInclude: ["w-current"],
          mustNotInclude: [],
          crossProduct: true,
        },
        {
          id: "matrix",
          query: "Что матрица судьбы говорит о работе",
          product: "matrix",
          mustInclude: ["w-current"],
          mustNotInclude: [],
          crossProduct: true,
        },
        {
          id: "daily-compact",
          query: "карта дня",
          product: "daily",
          depth: "compact",
          mustInclude: [],
          mustNotInclude: ["s-sergey-divorce"],
          crossProduct: true,
          irrelevance: true,
        },
      ],
    },
  ];
}
