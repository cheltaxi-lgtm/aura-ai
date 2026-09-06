import type { CompositeChart } from "@/lib/natal/composite";
import { BODY_NAMES, ASPECT_NAMES, signLabel } from "@/lib/natal/presentation";
import ReportCharts from "./ReportCharts";

export default function CompositeSnapshot({ chart }: { chart: CompositeChart | null | undefined }) {
  if (!chart?.bodies?.length) return null;
  const planets = Object.fromEntries(chart.bodies.filter(b => b.key !== "sun" && b.key !== "moon").map(b => [b.key, b]));
  const western = { sun: chart.bodies.find(b => b.key === "sun"), moon: chart.bodies.find(b => b.key === "moon"), planets, aspects: chart.aspects.map(a => ({ ...a, planet1: a.firstKey, planet2: a.secondKey, aspect: a.aspect, nature: "major" })) };
  return <section className="report-document__section"><h2>Композитная карта</h2>
    <ReportCharts snapshot={{ western, timeKnown: false }} />
    <table><thead><tr><th>Планета</th><th>Положение</th></tr></thead><tbody>{chart.bodies.map(b => <tr key={b.key}><td>{BODY_NAMES[b.key] ?? b.key}</td><td>{signLabel(b.sign)} · {b.degree.toFixed(2)}°</td></tr>)}</tbody></table>
    {chart.aspects.length ? <dl className="report-document__evidence">{chart.aspects.map(a => <div key={a.id}><dt>{BODY_NAMES[a.firstKey] ?? a.firstKey} — {BODY_NAMES[a.secondKey] ?? a.secondKey}</dt><dd>{ASPECT_NAMES[a.aspect] ?? a.aspect} · орб {a.orb.toFixed(2)}°</dd></div>)}</dl> : null}
    {chart.patterns?.map((p, i) => <p key={i}>{p.type === "grand-trine" ? "Большой тригон" : "Тау-квадрат"}: {p.bodyKeys.map(k => BODY_NAMES[k] ?? k).join(" · ")}</p>)}
    {chart.limitation ? <p className="report-document__disclaimer">{chart.limitation}</p> : null}
  </section>;
}
