"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

type ProductKey = "natal" | "matrix" | "hd" | "manual_spread";

const PRODUCTS: { value: ProductKey; label: string; hint: string }[] = [
  { value: "natal", label: "Натальная карта", hint: "Планеты, дома, аспекты" },
  { value: "matrix", label: "Матрица судьбы", hint: "Энергии и линии рода" },
  { value: "hd", label: "Human Design", hint: "Тип, авторитет, центры" },
  { value: "manual_spread", label: "Другой запрос", hint: "Вопрос без расчёта карты" },
];

const ERROR_RU: Record<string, string> = {
  intake_not_found: "Ссылка недействительна или отключена практиком",
  consent_required: "Нужно согласие на обработку персональных данных",
  alias_required: "Укажите, как к вам обращаться",
  rate_limit: "Слишком много попыток. Подождите пару минут и попробуйте снова",
  pro_client_limit: "Практик временно не принимает новые анкеты",
  pro_case_daily_limit: "Практик временно не принимает новые анкеты",
};

export default function ProIntakePublicPage() {
  const params = useParams<{ token: string }>();
  const [linkState, setLinkState] = useState<"loading" | "ok" | "invalid">("loading");
  const [practitionerName, setPractitionerName] = useState<string | null>(null);
  const [alias, setAlias] = useState("");
  const [question, setQuestion] = useState("");
  const [caseType, setCaseType] = useState<ProductKey>("natal");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const needsBirth = caseType === "natal" || caseType === "matrix" || caseType === "hd";

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/pro/public/intake/${params.token}`);
        if (!res.ok) {
          setLinkState("invalid");
          return;
        }
        const json = await res.json();
        setPractitionerName(
          typeof json.practitionerName === "string" ? json.practitionerName : null
        );
        setLinkState("ok");
      } catch {
        setLinkState("invalid");
      }
    })();
  }, [params.token]);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
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
          website,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = typeof json.error === "string" ? json.error : "";
        setErr(ERROR_RU[code] ?? "Не удалось отправить анкету. Попробуйте ещё раз.");
        return;
      }
      setDone(true);
    } catch {
      setErr("Сеть недоступна. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  if (linkState === "loading") {
    return (
      <main className="pro-public mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-gray-500">Проверяем ссылку…</p>
      </main>
    );
  }

  if (linkState === "invalid") {
    return (
      <main className="pro-public mx-auto max-w-md px-4 py-16 text-center">
        <p className="pro-public__eyebrow">Zovus Pro</p>
        <h1 className="pro-public__title mt-2 text-2xl">Ссылка недействительна</h1>
        <p className="mt-3 text-sm text-gray-400">
          Анкета отключена или ссылка устарела. Попросите практика прислать новую.
        </p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="pro-public mx-auto max-w-md px-4 py-16 text-center">
        <p className="pro-public__eyebrow">Zovus Pro</p>
        <h1 className="pro-public__title mt-2 text-2xl">Спасибо</h1>
        <p className="mt-3 text-sm text-gray-400">
          Анкета отправлена. Практик получит ваши данные и подготовит разбор —
          ссылку на отчёт вам пришлют лично.
        </p>
      </main>
    );
  }

  return (
    <main className="pro-public mx-auto max-w-md px-4 py-12">
      <p className="pro-public__eyebrow">Конфиденциально</p>
      <h1 className="pro-public__title mt-1 text-2xl">Анкета-бриф</h1>
      <p className="mt-2 text-sm text-gray-400">
        {practitionerName ? `${practitionerName} · ` : ""}данные увидит только ваш практик
      </p>
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
        {/* Honeypot: скрыто от людей, видимо ботам */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-10000px",
            top: "auto",
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
        >
          <label htmlFor="intake-website">Не заполняйте это поле</label>
          <input
            id="intake-website"
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
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
        {err ? (
          <p className="text-sm text-red-300" role="alert">
            {err}
          </p>
        ) : null}
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
