export interface ZodiacSign {
  name: string;
  emoji: string;
  element: "fire" | "earth" | "air" | "water";
}

const ZODIAC_SIGNS: ZodiacSign[] = [
  { name: "Козерог", emoji: "♑", element: "earth" },
  { name: "Водолей", emoji: "♒", element: "air" },
  { name: "Рыбы", emoji: "♓", element: "water" },
  { name: "Овен", emoji: "♈", element: "fire" },
  { name: "Телец", emoji: "♉", element: "earth" },
  { name: "Близнецы", emoji: "♊", element: "air" },
  { name: "Рак", emoji: "♋", element: "water" },
  { name: "Лев", emoji: "♌", element: "fire" },
  { name: "Дева", emoji: "♍", element: "earth" },
  { name: "Весы", emoji: "♎", element: "air" },
  { name: "Скорпион", emoji: "♏", element: "water" },
  { name: "Стрелец", emoji: "♐", element: "fire" },
];

/** Границы знаков: [месяц, день] — начало каждого знака (кроме Козерога) */
const CUSP_DATES: [number, number][] = [
  [1, 20], [2, 19], [3, 21], [4, 20], [5, 21], [6, 21],
  [7, 23], [8, 23], [9, 23], [10, 23], [11, 22], [12, 22],
];

function parseBirthDate(input: string | Date): { month: number; day: number } | null {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return null;
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function getZodiacFromDate(birthDate: string | Date): ZodiacSign {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return ZODIAC_SIGNS[0];

  const { month, day } = parsed;

  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) {
    return ZODIAC_SIGNS[0];
  }

  for (let i = 1; i < CUSP_DATES.length; i++) {
    const [cMonth, cDay] = CUSP_DATES[i];
    if (month < cMonth || (month === cMonth && day < cDay)) {
      return ZODIAC_SIGNS[i];
    }
  }

  return ZODIAC_SIGNS[11];
}

export function formatZodiacLabel(sign: ZodiacSign): string {
  return `${sign.name} ${sign.emoji}`;
}

export function genderLabel(gender: "male" | "female"): string {
  return gender === "male" ? "Мужской" : "Женский";
}
