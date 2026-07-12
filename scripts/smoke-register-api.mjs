#!/usr/bin/env node
/** Smoke tests for registration API validation (run against local or prod). */
const base = process.argv[2] || "http://127.0.0.1:3000";

async function post(body) {
  const res = await fetch(`${base}/api/auth/user/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

const cases = [
  {
    name: "missing acceptedTerms",
    body: { email: "smoke@example.com", password: "testpass12345", name: "Smoke", ageConfirmed: true },
    expectStatus: 400,
    expectError: "согласие",
  },
  {
    name: "missing ageConfirmed",
    body: { email: "smoke@example.com", password: "testpass12345", name: "Smoke", acceptedTerms: true },
    expectStatus: 400,
    expectError: "18",
  },
  {
    name: "whitespace name",
    body: { email: "smoke@example.com", password: "testpass12345", name: "   ", acceptedTerms: true, ageConfirmed: true },
    expectStatus: 400,
  },
  {
    name: "short password",
    body: { email: "smoke@example.com", password: "short", name: "Smoke", acceptedTerms: true, ageConfirmed: true },
    expectStatus: 400,
  },
];

let failed = 0;
for (const c of cases) {
  const { status, json } = await post(c.body);
  const ok =
    status === c.expectStatus &&
    (!c.expectError || String(json.error || "").toLowerCase().includes(c.expectError.toLowerCase()));
  console.log(`${ok ? "OK" : "FAIL"} ${c.name}: status=${status} error=${json.error ?? json.raw ?? ""}`);
  if (!ok) failed++;
}

process.exit(failed > 0 ? 1 : 0);
