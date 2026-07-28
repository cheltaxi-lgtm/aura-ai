/**
 * Keyword sources for Ads Autopilot semantics.
 * Failures degrade to empty arrays — never throw into the pipeline.
 */
export type RawKeyword = {
  phrase: string;
  source: string;
  freqExact?: number | null;
  freqPhrase?: number | null;
};

export interface KeywordSource {
  name: string;
  collect(): Promise<RawKeyword[]>;
}

/** Hardcoded intents from content hubs used in discovery. */
export class InternalSource implements KeywordSource {
  name = "internal";

  async collect(): Promise<RawKeyword[]> {
    const phrases = [
      // /runy
      "значение рун",
      "руны описание",
      "руны феху значение",
      "старшие руны",
      "руны онлайн значение",
      "что означают руны",
      // /matrix-destiny
      "матрица судьбы",
      "матрица судьбы рассчитать",
      "матрица судьбы по дате рождения",
      "расчет матрицы судьбы",
      "матрица судьбы значение арканов",
      "цифровая матрица судьбы",
      // /numerology
      "нумерология по дате рождения",
      "число судьбы",
      "нумерология онлайн",
      "квадрат пифагора",
      "матрица судьбы нумерология",
      "совместимость по дате рождения",
      // /taro
      "значение карт таро",
      "карты таро значение",
      "старшие арканы таро",
      "таро арканы описание",
      "что означает карта таро",
      "расклад таро значение карт",
    ];
    return phrases.map((phrase) => ({
      phrase,
      source: this.name,
      freqExact: null,
      freqPhrase: null,
    }));
  }
}

export class WebmasterSource implements KeywordSource {
  name = "webmaster";

  async collect(): Promise<RawKeyword[]> {
    const { webmasterHostId, webmasterToken } = await import("../sources/env");
    const token = webmasterToken();
    const hostId = webmasterHostId();
    if (!token || !hostId) return [];
    try {
      const userRes = await fetch("https://api.webmaster.yandex.net/v4/user", {
        headers: { Authorization: `OAuth ${token}` },
      });
      if (!userRes.ok) return [];
      const userJson = (await userRes.json()) as { user_id?: number };
      const uid = userJson.user_id;
      if (!uid) return [];
      const to = new Date();
      const from = new Date(to.getTime() - 28 * 86400_000);
      const df = from.toISOString().slice(0, 10);
      const dt = to.toISOString().slice(0, 10);
      const url =
        `https://api.webmaster.yandex.net/v4/user/${uid}/hosts/` +
        `${encodeURIComponent(hostId)}/search-queries/popular` +
        `?query_indicator=TOTAL_SHOWS&order_by=TOTAL_SHOWS&date_from=${df}&date_to=${dt}`;
      const res = await fetch(url, {
        headers: { Authorization: `OAuth ${token}` },
      });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        queries?: { query_text?: string; indicators?: { TOTAL_SHOWS?: number } }[];
      };
      return (json.queries || [])
        .filter((q) => q.query_text)
        .map((q) => ({
          phrase: String(q.query_text),
          source: this.name,
          freqExact: q.indicators?.TOTAL_SHOWS ?? null,
          freqPhrase: q.indicators?.TOTAL_SHOWS ?? null,
        }));
    } catch {
      return [];
    }
  }
}

/** Stub: Metrika search phrases for registered visitors — empty on fail. */
export class MetrikaSource implements KeywordSource {
  name = "metrika";

  async collect(): Promise<RawKeyword[]> {
    const { metrikaCounterId, metrikaToken } = await import("../sources/env");
    const token = metrikaToken();
    const counter = metrikaCounterId();
    if (!token || !counter) return [];
    try {
      // Optional enrichment; degrade empty if API shape unavailable.
      const url =
        `https://api-metrika.yandex.net/stat/v1/data` +
        `?ids=${encodeURIComponent(counter)}` +
        `&metrics=ym:s:users&dimensions=ym:s:lastSearchPhrase` +
        `&filters=ym:s:goal%3D%3D${encodeURIComponent(process.env.ADS_GOAL_REGISTRATION || "0")}` +
        `&limit=100`;
      const res = await fetch(url, {
        headers: { Authorization: `OAuth ${token}` },
      });
      if (!res.ok) return [];
      const json = (await res.json()) as {
        data?: { dimensions?: { name?: string }[]; metrics?: number[] }[];
      };
      return (json.data || [])
        .map((row) => {
          const phrase = row.dimensions?.[0]?.name;
          if (!phrase || phrase === "null" || phrase === "(not set)") return null;
          return {
            phrase,
            source: this.name,
            freqExact: null,
            freqPhrase: null,
          } as RawKeyword;
        })
        .filter((x): x is RawKeyword => !!x);
    } catch {
      return [];
    }
  }
}

/** Wordstat / Cloud — degrade empty on fail or missing token. */
export class WordstatSource implements KeywordSource {
  name = "wordstat";

  constructor(private seeds: string[] = []) {}

  async collect(): Promise<RawKeyword[]> {
    const token = process.env.WORDSTAT_TOKEN;
    if (!token || !this.seeds.length) return [];
    try {
      // Placeholder: legacy Wordstat TLS is unreliable; keep empty-safe.
      // When Cloud Wordstat is wired, enrich seeds here and cache in ads.keyword_stat.
      return [];
    } catch {
      return [];
    }
  }
}

/** Optional Direct KeywordsResearch enrichment. */
export class DirectResearchSource implements KeywordSource {
  name = "direct_research";

  constructor(private phrases: string[] = []) {}

  async collect(): Promise<RawKeyword[]> {
    if (!process.env.ADS_DIRECT_TOKEN || !this.phrases.length) return [];
    try {
      const { hasSearchVolume } = await import("../direct/forecast");
      await hasSearchVolume(this.phrases.slice(0, 50));
      // Volume details vary by API version — return seeds without inventing freq.
      return this.phrases.map((phrase) => ({
        phrase,
        source: this.name,
        freqExact: null,
        freqPhrase: null,
      }));
    } catch {
      return [];
    }
  }
}

export function defaultSources(): KeywordSource[] {
  return [
    new InternalSource(),
    new WebmasterSource(),
    new MetrikaSource(),
    new WordstatSource(),
  ];
}
