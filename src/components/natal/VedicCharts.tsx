"use client";

import type {
  NavamsaPosition,
  VedicChart,
  VedicGrahaKey,
  VedicHouseNumber,
  VedicPosition,
  VimshottariPeriod,
} from "@/lib/natal/vedic";
import { VEDIC_GRAHA_KEYS } from "@/lib/natal/vedic";
import { evidenceAnchorId } from "@/lib/natal/evidence-anchor";
import { russianGrahaLabel } from "@/lib/natal/labels";

const GRAHA: Record<VedicGrahaKey, { name: string; glyph: string }> = {
  sun: { name: "Сурья", glyph: "☉" },
  moon: { name: "Чандра", glyph: "☽" },
  mercury: { name: "Будха", glyph: "☿" },
  venus: { name: "Шукра", glyph: "♀" },
  mars: { name: "Мангала", glyph: "♂" },
  jupiter: { name: "Гуру", glyph: "♃" },
  saturn: { name: "Шани", glyph: "♄" },
  rahu: { name: "Раху", glyph: "☊" },
  ketu: { name: "Кету", glyph: "☋" },
  ascendant: { name: "Лагна", glyph: "L" },
};

const GRID_POSITION: Record<VedicHouseNumber, string> = {
  1: "col-start-2 row-start-1",
  2: "col-start-3 row-start-1",
  3: "col-start-4 row-start-1",
  4: "col-start-4 row-start-2",
  5: "col-start-4 row-start-3",
  6: "col-start-4 row-start-4",
  7: "col-start-3 row-start-4",
  8: "col-start-2 row-start-4",
  9: "col-start-1 row-start-4",
  10: "col-start-1 row-start-3",
  11: "col-start-1 row-start-2",
  12: "col-start-1 row-start-1",
};

const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string): string {
  return DATE_FORMAT.format(new Date(value));
}

function formatDegree(value: number): string {
  return `${Math.max(0, value).toFixed(2)}°`;
}

function bodyLabel(key: VedicGrahaKey): string {
  return `${GRAHA[key].glyph} ${russianGrahaLabel(key)}`;
}

function D1HouseCell({
  number,
  chart,
}: {
  number: VedicHouseNumber;
  chart: VedicChart;
}) {
  const house = chart.houses?.[number];
  const bodies = VEDIC_GRAHA_KEYS.filter((key) => {
    if (key === "ascendant") return number === 1 && chart.hasExactLagna;
    return house?.planets.some((planet) => planet.name === key);
  });
  const label = house
    ? `Дом ${number}, ${house.sign.name}. ${bodies.length ? bodies.map(bodyLabel).join(", ") : "без грах"}`
    : `Дом ${number}`;
  return (
    <article
      tabIndex={0}
      aria-label={label}
      className={`${GRID_POSITION[number]} min-h-20 rounded-lg border border-violet-200/15 bg-violet-300/[0.035] p-2 outline-none transition focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 sm:min-h-24`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] font-semibold text-violet-100/60">H{number}</span>
        <span className="text-xs text-violet-100/75" aria-hidden>{house?.sign.symbol}</span>
      </div>
      <p className="mt-1 truncate text-[10px] text-white/45">{house?.sign.name ?? "—"}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {bodies.map((key) => (
          <span key={key} title={GRAHA[key].name} className="text-sm text-amber-100/85">
            {GRAHA[key].glyph}<span className="sr-only"> {GRAHA[key].name}</span>
          </span>
        ))}
      </div>
    </article>
  );
}

function D9SignCell({
  number,
  positions,
}: {
  number: VedicHouseNumber;
  positions: Array<[VedicGrahaKey, NavamsaPosition]>;
}) {
  const rashi = positions[0]?.[1];
  const label = `Раши ${number}, ${rashi?.rashiName ?? "нет положений"}. ${
    positions.length ? positions.map(([key]) => bodyLabel(key)).join(", ") : "без грах"
  }`;
  return (
    <article
      tabIndex={0}
      aria-label={label}
      className={`${GRID_POSITION[number]} min-h-20 rounded-lg border border-cyan-200/15 bg-cyan-300/[0.025] p-2 outline-none transition focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 sm:min-h-24`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] font-semibold text-cyan-100/55">R{number}</span>
        <span className="text-xs text-cyan-100/75" aria-hidden>{rashi?.symbol}</span>
      </div>
      <p className="mt-1 truncate text-[10px] text-white/45">{rashi?.rashiName ?? "—"}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {positions.map(([key]) => (
          <span key={key} title={GRAHA[key].name} className="text-sm text-amber-100/85">
            {GRAHA[key].glyph}<span className="sr-only"> {GRAHA[key].name}</span>
          </span>
        ))}
      </div>
    </article>
  );
}

function D1RashiCell({
  number,
  positions,
}: {
  number: VedicHouseNumber;
  positions: Array<[VedicGrahaKey, VedicPosition]>;
}) {
  const rashi = positions[0]?.[1].rashi;
  const reference = [
    "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
    "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena",
  ][number - 1];
  const label = `Раши ${number}, ${rashi?.name ?? reference}. ${
    positions.length ? positions.map(([key]) => bodyLabel(key)).join(", ") : "без грах"
  }`;
  return (
    <article
      tabIndex={0}
      aria-label={label}
      className={`${GRID_POSITION[number]} min-h-20 rounded-lg border border-violet-200/15 bg-violet-300/[0.035] p-2 outline-none transition focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 sm:min-h-24`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] font-semibold text-violet-100/60">R{number}</span>
        <span className="text-[10px] text-violet-100/65">{rashi?.symbol}</span>
      </div>
      <p className="mt-1 truncate text-[10px] text-white/45">{rashi?.name ?? reference}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {positions.map(([key]) => (
          <span key={key} title={GRAHA[key].name} className="text-sm text-amber-100/85">
            {GRAHA[key].glyph}<span className="sr-only"> {GRAHA[key].name}</span>
          </span>
        ))}
      </div>
    </article>
  );
}

function ChartCenter({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="col-start-2 col-end-4 row-start-2 row-end-4 flex items-center justify-center rounded-xl border border-white/8 bg-black/25 p-3 text-center">
      <div>
        <p className="font-display text-xl font-semibold text-amber-50">{title}</p>
        <p className="mt-1 text-[10px] leading-4 text-white/35">{subtitle}</p>
      </div>
    </div>
  );
}

function PositionDetails({
  positions,
  navamsa = false,
}: {
  positions: Partial<Record<VedicGrahaKey, VedicPosition | NavamsaPosition>>;
  navamsa?: boolean;
}) {
  return (
    <details className="mt-4 rounded-xl border border-white/8 bg-black/15">
      <summary className="cursor-pointer px-3 py-2 text-xs text-white/55">
        Текстовая версия карты
      </summary>
      <ul className="grid gap-2 border-t border-white/8 p-3 sm:grid-cols-2" aria-label="Текстовые положения грах">
        {VEDIC_GRAHA_KEYS.flatMap((key) => {
          const position = positions[key];
          if (!position) return [];
          if (navamsa) {
            const d9 = position as NavamsaPosition;
            return [(
              <li id={evidenceAnchorId("vedic-navamsa", key)} tabIndex={-1} key={key} className="text-xs leading-5 text-white/55 focus:ring-2 focus:ring-amber-300/50">
                <b className="font-medium text-amber-100/80">{bodyLabel(key)}</b>
                {" — "}{d9.symbol} {d9.rashiName}, {formatDegree(d9.degreeInSign)}
              </li>
            )];
          }
          const d1 = position as VedicPosition;
          return [(
            <li id={evidenceAnchorId("vedic", key)} tabIndex={-1} key={key} className="text-xs leading-5 text-white/55 focus:ring-2 focus:ring-amber-300/50">
              <b className="font-medium text-amber-100/80">{bodyLabel(key)}</b>
              {" — "}{d1.rashi.symbol} {d1.rashi.name} {d1.degree}; {d1.nakshatra.name},
              {" "}пада {d1.nakshatra.pada}, управитель {russianGrahaLabel(d1.nakshatra.lord)}
            </li>
          )];
        })}
      </ul>
    </details>
  );
}

export function VedicChartPair({ chart }: { chart: VedicChart }) {
  const d9BySign = new Map<VedicHouseNumber, Array<[VedicGrahaKey, NavamsaPosition]>>();
  const d1BySign = new Map<VedicHouseNumber, Array<[VedicGrahaKey, VedicPosition]>>();
  for (const key of VEDIC_GRAHA_KEYS) {
    const d1Position = chart.positions[key];
    if (d1Position) {
      const existing = d1BySign.get(d1Position.rashi.index) ?? [];
      existing.push([key, d1Position]);
      d1BySign.set(d1Position.rashi.index, existing);
    }
    const position = chart.navamsa[key];
    if (!position) continue;
    const existing = d9BySign.get(position.rashiIndex) ?? [];
    existing.push([key, position]);
    d9BySign.set(position.rashiIndex, existing);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="isolate overflow-hidden rounded-2xl border border-violet-200/15 bg-violet-300/[0.025] shadow-[0_12px_36px_rgba(0,0,0,.1)]">
        <header className="border-b border-white/[0.06] px-3 py-4 sm:px-5 sm:py-5">
          <p className="text-[10px] font-medium uppercase leading-relaxed tracking-[.14em] text-violet-200/45">D1 · цельнознаковые дома</p>
          <h3 className="mt-2 font-display text-xl font-semibold leading-snug text-white">Раши-чакра</h3>
        </header>
        <div className="space-y-4 px-3 py-4 sm:px-5 sm:py-5">
        <p className="text-sm leading-6 text-white/60">D1 — основная карта джйотиш. При точном времени ячейки читаются как дома от лагны; без него остаются только знаки.</p>
        {chart.hasExactLagna && chart.houses ? (
          <>
            <div className="mt-4 grid grid-cols-4 grid-rows-4 gap-1" aria-label="D1 Раши, двенадцать домов">
              {Array.from({ length: 12 }, (_, index) => (
                <D1HouseCell key={index + 1} number={(index + 1) as VedicHouseNumber} chart={chart} />
              ))}
              <ChartCenter title="D1" subtitle="Дома отсчитываются от точной лагны" />
            </div>
            <PositionDetails positions={chart.positions} />
          </>
        ) : (
          <>
            <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.04] p-3 text-xs leading-5 text-amber-50/65">
              Лагна и номера домов скрыты: для них нужны точные время и место рождения. Поэтому D1 ниже
              закрепляет ячейки за раши, а не выдаёт их за дома.
            </div>
            <div className="mt-4 grid grid-cols-4 grid-rows-4 gap-1" aria-label="D1 Раши без домов, двенадцать знаков">
              {Array.from({ length: 12 }, (_, index) => {
                const number = (index + 1) as VedicHouseNumber;
                return <D1RashiCell key={number} number={number} positions={d1BySign.get(number) ?? []} />;
              })}
              <ChartCenter title="D1" subtitle="Раши без домов: точное время неизвестно" />
            </div>
            <PositionDetails positions={chart.positions} />
          </>
        )}
        </div>
      </section>

      <section className="isolate overflow-hidden rounded-2xl border border-cyan-200/15 bg-cyan-300/[0.02] shadow-[0_12px_36px_rgba(0,0,0,.1)]">
        <header className="border-b border-white/[0.06] px-3 py-4 sm:px-5 sm:py-5">
          <p className="text-[10px] font-medium uppercase leading-relaxed tracking-[.14em] text-cyan-200/45">D9 · Navamsa</p>
          <h3 className="mt-2 font-display text-xl font-semibold leading-snug text-white">Навамша</h3>
        </header>
        <div className="space-y-4 px-3 py-4 sm:px-5 sm:py-5">
        <p className="text-sm leading-6 text-white/60">D9 — вспомогательная карта, полученная делением каждого знака на девять частей. Она не заменяет D1.</p>
        <div className="grid grid-cols-4 grid-rows-4 gap-1" aria-label="D9 Навамша, двенадцать раши">
          {Array.from({ length: 12 }, (_, index) => {
            const number = (index + 1) as VedicHouseNumber;
            return <D9SignCell key={number} number={number} positions={d9BySign.get(number) ?? []} />;
          })}
          <ChartCenter title="D9" subtitle="Навамша по девяти частям каждого раши" />
        </div>
        <PositionDetails positions={chart.navamsa} navamsa />
        {!chart.hasExactLagna && (
          <p className="text-xs leading-5 text-amber-100/55">
            Асцендент D9 исключён, потому что время рождения неизвестно.
          </p>
        )}
        </div>
      </section>
    </div>
  );
}

function samePeriod(period: VimshottariPeriod, current: VimshottariPeriod | null): boolean {
  return Boolean(
    current &&
    period.lord === current.lord &&
    period.startDate === current.startDate &&
    period.endDate === current.endDate
  );
}

function remainingYears(period: VimshottariPeriod): number {
  const remainingMs = Math.max(0, new Date(period.endDate).getTime() - Date.now());
  return remainingMs / (365.2425 * 24 * 60 * 60 * 1000);
}

export function VimshottariTimeline({ chart }: { chart: VedicChart }) {
  const current = chart.dasha.current;
  return (
    <section className="isolate overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] shadow-[0_12px_36px_rgba(0,0,0,.12)]">
      <header className="border-b border-white/[0.06] px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[10px] font-medium uppercase leading-relaxed tracking-[.14em] text-amber-200/45">120-летний цикл · только махадаши</p>
        <h2 className="mt-2 font-display text-xl font-semibold leading-snug text-white">Вимшоттари-даша</h2>
      </header>
      <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
      <p className="text-xs leading-5 text-white/45">
        Последовательность крупных периодов, рассчитанная по традиционной схеме. Антардаши и пратьянтардаши не вычисляются и не показаны.
      </p>
      <ol className="space-y-2" aria-label="Хронология махадаш">
        {chart.dasha.dashas.map((period, index) => {
          const active = samePeriod(period, current);
          return (
            <li
              key={`${period.lord}-${period.startDate}`}
              aria-current={active ? "true" : undefined}
              className={`grid gap-2 rounded-xl border px-3 py-3 sm:grid-cols-[2rem_1fr_auto] sm:items-center ${
                active
                  ? "border-amber-200/35 bg-amber-200/[0.09]"
                  : "border-white/8 bg-black/15"
              }`}
            >
              <span className="text-xs tabular-nums text-white/25">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-sm font-medium text-white/80">
                  {russianGrahaLabel(period.lord)}
                  {active && <span className="ml-2 rounded-full bg-amber-200/15 px-2 py-0.5 text-[10px] text-amber-100">текущая</span>}
                  {period.isPartial && <span className="ml-2 text-[10px] text-violet-200/60">частичная при рождении</span>}
                </p>
                <p className="mt-1 text-xs text-white/40">
                  {formatDate(period.startDate)} — {formatDate(period.endDate)}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs text-white/55">{period.years.toFixed(2)} лет</p>
                {active && <p className="mt-1 text-[10px] text-amber-100/65">осталось ≈ {remainingYears(period).toFixed(2)} лет</p>}
              </div>
            </li>
          );
        })}
      </ol>
      </div>
    </section>
  );
}
