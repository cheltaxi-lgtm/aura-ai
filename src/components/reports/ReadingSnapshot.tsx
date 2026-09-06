import type { AuraSnapshot } from "@/lib/aura-constants";
import { PALM_HAND_LABELS, PALM_HAND_SHAPE_LABELS, type PalmSnapshot } from "@/lib/palm-constants";
import { PALM_MAP_LINES, PALM_MAP_VB } from "@/components/palm/palm-map-geometry";

const labels: Record<string, string> = { open: "открыта", balanced: "сбалансирована", blocked: "требует внимания", weak: "слабо выражен", strong: "выражен", short: "короткая", medium: "средняя", long: "длинная", clear: "чёткая", broken: "прерывистая", chained: "цепочкой", forked: "разветвлённая" };
const color = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : "#ad9164";
const entry = (name: string, note: string, state?: string) => <div key={name}><dt>{name}{state ? ` · ${labels[state] ?? state}` : ""}</dt><dd>{note}</dd></div>;

/** Static, complete snapshot view: no hover-only details, animation or source photo. */
export default function ReadingSnapshot({ kind, snapshot }: { kind: string; snapshot?: Record<string, unknown> }) {
  if (!snapshot) return null;
  if (kind === "aura_reading" && snapshot.dominantColor && Array.isArray(snapshot.secondaryColors)) {
    const s = snapshot as unknown as AuraSnapshot;
    const colors = [s.dominantColor, ...s.secondaryColors];
    return <div className="report-snapshot">
      <figure><svg viewBox="0 0 600 340" role="img" aria-label="Цветовая карта ауры" width="600">
        {colors.slice(0, 4).reverse().map((c, i) => <ellipse key={c.key} cx="300" cy="170" rx={145 - i * 24} ry={155 - i * 26} fill={color(c.hex)} fillOpacity=".45" stroke={color(c.hex)} strokeWidth="1" />)}
        <circle cx="300" cy="127" r="24" fill="#fffdf8" fillOpacity=".8" /><path d="M260 225 Q250 165 300 163 Q350 165 340 225 Z" fill="#fffdf8" fillOpacity=".8" />
      </svg><figcaption>Символическая карта · цвета сохранённого разбора</figcaption></figure>
      <dl className="report-document__evidence">{colors.map(c => entry(c.name, c.meaning))}</dl>
      {s.layers?.length ? <><h2>Слои ауры</h2><dl className="report-document__evidence">{s.layers.map(l => entry(l.name, l.state))}</dl></> : null}
      {s.chakras?.length ? <><h2>Энергетические центры</h2><dl className="report-document__evidence">{s.chakras.map(c => entry(c.name, c.note, c.openness))}</dl></> : null}
    </div>;
  }
  if (kind === "palm_reading" && Array.isArray(snapshot.majorLines)) {
    const s = snapshot as unknown as PalmSnapshot;
    return <div className="report-snapshot"><figure>
      <svg viewBox={`0 0 ${PALM_MAP_VB.w} ${PALM_MAP_VB.h}`} width="300" role="img" aria-label="Схема линий ладони">
        <g transform={s.whichHand === "left" ? `translate(${PALM_MAP_VB.w},0) scale(-1,1)` : undefined}>
          <image href="/palm/palm-realistic-right-v1.png" width={PALM_MAP_VB.w} height={PALM_MAP_VB.h} />
          {s.majorLines.filter(l => l.present && PALM_MAP_LINES[l.key]).map(l => <path key={l.key} d={PALM_MAP_LINES[l.key].d} fill="none" stroke="#704225" strokeWidth="9" strokeLinecap="round" strokeDasharray={l.quality === "broken" ? "20 12" : undefined} />)}
        </g>
      </svg><figcaption>{PALM_HAND_LABELS[s.whichHand]} · {PALM_HAND_SHAPE_LABELS[s.handShape]}<br />Условная схема расположения линий; не исходная фотография.</figcaption></figure>
      <h2>Линии ладони</h2><dl className="report-document__evidence">{s.majorLines.map(l => entry(l.name, [l.present ? `${labels[l.length]}, ${labels[l.quality]}.` : "Не выделена на снимке.", l.note].join(" ")))}</dl>
      {s.mounts?.length ? <><h2>Холмы ладони</h2><dl className="report-document__evidence">{s.mounts.map(m => entry(m.name, m.note, m.prominence))}</dl></> : null}
      {s.marks?.length ? <><h2>Особые знаки</h2><dl className="report-document__evidence">{s.marks.map(m => entry(m.name, `${m.where}. ${m.note}`))}</dl></> : null}
    </div>;
  }
  return null;
}
