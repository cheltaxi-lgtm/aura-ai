"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { EDITORIAL_SECTION_IDS } from "@/lib/editorial-landing-content";

const EXAMPLE_PARTNERS = [
  {
    mark: "СН",
    name: "Ателье колоды «Северная нить»",
    blurb: "Авторские колоды Таро — пилот «колода месяца» в цифровом салоне.",
  },
  {
    mark: "ДБ",
    name: "Дом бумаги и символа",
    blurb: "Офлайн-витрина и QR на гостевой расклад после покупки колоды.",
  },
] as const;

const ERROR_COPY: Record<string, string> = {
  name_required: "Укажите имя",
  phone_invalid: "Укажите корректный телефон",
  email_invalid: "Укажите корректный email",
  company_required: "Укажите компанию или бренд",
  message_required: "Расскажите кратко о сотрудничестве (от 10 символов)",
  rate_limited: "Слишком много заявок. Попробуйте позже.",
  captcha: "Не удалось пройти проверку. Обновите страницу и попробуйте снова.",
};

export default function LandingPartnersSection() {
  const { expertRegistrationEnabled, recaptcha, featuresLoaded } = usePlatformFeatures();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || done) return;
    setError(null);
    setSending(true);

    const body: Record<string, unknown> = {
      name,
      phone,
      email,
      company,
      website: website.trim() || undefined,
      message,
      website_url: honeypot,
    };

    try {
      if (featuresLoaded) {
        const captchaError = await attachRecaptchaToken(
          body,
          "partners",
          { expertRegistrationEnabled, recaptcha }
        );
        if (captchaError) {
          setError(captchaError);
          setSending(false);
          return;
        }
      }

      const res = await fetch("/api/partners/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = typeof data.error === "string" ? data.error : "unknown";
        setError(ERROR_COPY[code] ?? "Не удалось отправить. Попробуйте позже.");
        setSending(false);
        return;
      }
      setDone(true);
      setName("");
      setPhone("");
      setEmail("");
      setCompany("");
      setWebsite("");
      setMessage("");
    } catch {
      setError("Не удалось отправить. Проверьте соединение.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      id={EDITORIAL_SECTION_IDS.partners}
      className="editorial-partners scroll-mt-24"
      aria-labelledby="editorial-partners-title"
    >
      <div className="editorial-landing__inner">
        <div className="editorial-partners__head">
          <p className="editorial-partners__eyebrow">Сотрудничество</p>
          <h2 id="editorial-partners-title" className="editorial-partners__title">
            Для брендов колод и эзотерических магазинов
          </h2>
          <p className="editorial-partners__lead">
            Zovus — приватный цифровой салон: люди приходят с вопросом и остаются в диалоге с
            наставником. Мы открыты к пилотам с теми, кто делает колоды, издаёт материалы и ведёт
            офлайн-пространства — чтобы соединить вещь в руках и смысл в сеансе.
          </p>
          <ul className="editorial-partners__points">
            <li>Аудитория с намерением, а не холодный трафик</li>
            <li>Аккуратные форматы без «магазина в лоб»</li>
            <li>Пилот и разговор по существу</li>
          </ul>
        </div>

        <div className="editorial-partners__examples" aria-label="Примеры направлений сотрудничества">
          {EXAMPLE_PARTNERS.map((p) => (
            <article key={p.name} className="editorial-partners__example">
              <span className="editorial-partners__mark" aria-hidden>
                {p.mark}
              </span>
              <div>
                <h3 className="editorial-partners__example-name">{p.name}</h3>
                <p className="editorial-partners__example-blurb">{p.blurb}</p>
              </div>
            </article>
          ))}
          <p className="editorial-partners__examples-note">Примеры направлений сотрудничества</p>
        </div>

        <div className="editorial-partners__form-wrap">
          {done ? (
            <p className="editorial-partners__success" role="status">
              Заявка принята. Мы ответим на почту в рабочие дни.
            </p>
          ) : (
            <form
              className="editorial-partners__form relative"
              onSubmit={(e) => void onSubmit(e)}
              noValidate
            >
              <div className="editorial-partners__fields">
                <label className="editorial-partners__field">
                  <span>Имя</span>
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                  />
                </label>
                <label className="editorial-partners__field">
                  <span>Телефон</span>
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={40}
                    placeholder="+7 …"
                  />
                </label>
                <label className="editorial-partners__field">
                  <span>Email</span>
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={200}
                  />
                </label>
                <label className="editorial-partners__field">
                  <span>Компания / бренд</span>
                  <input
                    name="company"
                    autoComplete="organization"
                    required
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    maxLength={200}
                  />
                </label>
                <label className="editorial-partners__field editorial-partners__field--full">
                  <span>Сайт или соцсеть (необязательно)</span>
                  <input
                    name="website"
                    autoComplete="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    maxLength={300}
                    placeholder="https://…"
                  />
                </label>
                <label className="editorial-partners__field editorial-partners__field--full">
                  <span>Сообщение</span>
                  <textarea
                    name="message"
                    required
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={4000}
                    placeholder="Чем занимаетесь и какой формат сотрудничества интересен"
                  />
                </label>
                {/* Honeypot */}
                <label className="editorial-partners__hp" aria-hidden tabIndex={-1}>
                  <span>Сайт</span>
                  <input
                    name="website_url"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </label>
              </div>
              {error ? (
                <p className="editorial-partners__error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="editorial-btn editorial-btn--gold"
                disabled={sending}
              >
                {sending ? "Отправляем…" : "Обсудить сотрудничество"}
              </button>
              <p className="editorial-partners__legal">
                Нажимая кнопку, вы соглашаетесь на обработку данных для ответа на заявку.{" "}
                <Link href="/privacy" className="editorial-partners__legal-link">
                  Политика конфиденциальности
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
