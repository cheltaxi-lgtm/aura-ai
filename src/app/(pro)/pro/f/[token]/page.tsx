"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

type ProductKey = "natal" | "matrix" | "hd" | "manual_spread";

const PRODUCTS: { value: ProductKey; label: string; hint: string }[] = [
  { value: "natal", label: "Натальная карта", hint: "Планеты, дома, аспекты" },
  { value: "matrix", label: "Матрица судьбы", hint: "Энергии и линии рода" },
  { value: "hd", label: "Human Design", hint: "Тип, авторитет, центры" },
  { value: "manual_spread", label: "Другой запрос", hint: "Вопрос без расчёта карты" },
];

export default function ProIntakePublicPage() {
  const params = useParams<{ token: string }>();
  const [alias, setAlias] = useState("");
  const [question, setQuestion] = useState("");
  const [caseType, setCaseType] = useState<ProductKey>("natal");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsBirth = caseType === "natal" || caseType === "matrix" || caseType === "hd";

  async function submit() {
    setErr(null);
    setBusy(true);
    const res = await fetch(`/api/pro/public/intake/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias,
        question,
        caseType,
        birthDate: birthDate || undefined,
        birthTime: birthTime || undefined,
        birthPlace: birthPlace || undefined,
        consentPdn: consent,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(json.error || "Ошибка");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="pro-public mx-auto max-w-md px-4 py-16 text-center">
        <p className="pro-public__eyebrow">Zovus Pro</p>
        <h1 className="pro-public__title mt-2 text-2xl">Спасибо</h1>
        <p className="mt-3 text-sm text-gray-400">
          Анкета отправлена практику. Он свяжется с вами через отчёт.
        </p>
      </main>
    );
  }

  return (
    <main className="pro-public mx-auto max-w-md px-4 py-12">
      <p className="pro-public__eyebrow">Конфиденциально</p>
      <h1 className="pro-public__title mt-1 text-2xl">Анкета-бриф</h1>
      <p className="mt-2 text-sm text-gray-400">Zovus Pro · данные увидит только практик</p>
      <div className="mt-6 flex flex-col gap-3">
        <div>
          <label className="pro-label" htmlFor="intake-alias">
            Как к вам обращаться
          </label>
          <input
            id="intake-alias"
            className="pro-field"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            autoComplete="nickname"
          />
        </div>
        <fieldset>
          <legend className="pro-label">Что разобрать</legend>
          <div className="mt-2 flex flex-col gap-2">
            {PRODUCTS.map((p) => (
              <label
                key={p.value}
                className="flex cursor-pointer items-start gap-2 rounded border border-[color:var(--pro-border)] px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="caseType"
                  className="mt-1"
                  checked={caseType === p.value}
                  onChange={() => setCaseType(p.value)}
                />
                <span>
                  <span className="text-[#ede6da]">{p.label}</span>
                  <span className="mt-0.5 block text-xs text-gray-500">{p.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="pro-label" htmlFor="intake-question">
            Ваш вопрос
          </label>
          <textarea
            id="intake-question"
            className="pro-field"
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>
        {needsBirth ? (
          <>
            <div>
              <label className="pro-label" htmlFor="intake-birth">
                Дата рождения
              </label>
              <input
                id="intake-birth"
                type="date"
                className="pro-field"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div>
              <label className="pro-label" htmlFor="intake-time">
                Время рождения (если известно)
              </label>
              <input
                id="intake-time"
                type="time"
                className="pro-field"
                value={birthTime}
                onChange={(e) => setBirthTime(e.target.value)}
              />
            </div>
            <div>
              <label className="pro-label" htmlFor="intake-place">
                Город рождения
              </label>
              <input
                id="intake-place"
                className="pro-field"
                value={birthPlace}
                onChange={(e) => setBirthPlace(e.target.value)}
                placeholder="Например, Москва"
                autoComplete="address-level2"
              />
            </div>
          </>
        ) : null}
        <label className="flex items-start gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Согласен(на) на обработку персональных данных для разбора.{" "}
            <Link href="/privacy" className="text-aura-champagne/70 underline-offset-2 hover:underline">
              Политика ПДн
            </Link>
          </span>
        </label>
        {err ? <p className="text-sm text-red-300">{err}</p> : null}
        <button
          type="button"
          className="btn-neon px-4 py-2 text-sm"
          disabled={
            !alias.trim() ||
            !consent ||
            busy ||
            (needsBirth && !birthDate)
          }
          onClick={() => void submit()}
        >
          {busy ? "Отправка…" : "Отправить"}
        </button>
      </div>
    </main>
  );
}
