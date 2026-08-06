const BASE = process.env.UX_AUDIT_BASE || "https://zovus.ru";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text: text.slice(0, 200) };
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text: text.slice(0, 240) };
}

const report = {};

report.features = await get("/api/platform/features");
report.proHealth = await get("/api/pro/health");
report.places = await get("/api/human-design/places?q=" + encodeURIComponent("Москва"));
report.transits = await get("/api/human-design/transits");
report.runesPackages = await get("/api/runes/packages");
report.ritualConfig = await get("/api/ritual/config");

report.hdChart = await post("/api/human-design/chart", {
  birthDate: "1990-05-15",
  birthTime: null,
  timezone: "Europe/Moscow",
  placeName: "Moscow, Russia",
  lat: 55.7558,
  lon: 37.6173,
  subjectKind: "self",
});
const c = report.hdChart.json?.chart?.chart || report.hdChart.json?.chart;
report.hdChartSummary = {
  status: report.hdChart.status,
  type: c?.type,
  profile: c?.profile,
  authority: c?.authority,
  gates: c?.activeGates?.length,
  error: report.hdChart.json?.error,
};

report.readingUnauth = await post("/api/reading", {});
report.matrixReportUnauth = await post("/api/numerology/matrix-report", {
  birthDate: "1990-05-15",
});
report.natalUnauth = await post("/api/natal-chart", {});
report.guestTriplet = await post("/api/guest-triplet/complete", {});
report.chatUnauth = await post("/api/chat", {});

console.log(JSON.stringify({
  features: report.features.json,
  proHealth: report.proHealth.json,
  placesCount: report.places.json?.places?.length,
  transitsOk: report.transits.status === 200 && Array.isArray(report.transits.json?.activations),
  runesPackages: report.runesPackages.status,
  ritualConfig: report.ritualConfig.status,
  hdChart: report.hdChartSummary,
  gates: {
    reading: report.readingUnauth.status,
    matrixReport: report.matrixReportUnauth.status,
    natal: report.natalUnauth.status,
    guestTriplet: { status: report.guestTriplet.status, body: report.guestTriplet.json },
    chat: report.chatUnauth.status,
  },
}, null, 2));
