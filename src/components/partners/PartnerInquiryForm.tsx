"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

const ERROR_COPY: Record<string, string> = {
  name_required: "Укажите имя",
  phone_invalid: "Укажите корректный телефон",
  email_invalid: "Укажите корректный email",
  company_required: "Укажите компанию или бренд",
  message_required: "Расскажите кратко о сотрудничестве (от 10 символов)",
  rate_limited: "Слишком много заявок. Попробуйте позже.",
  captcha: "Не удалось пройти проверку. Обновите страницу и попробуйте снова.",
};

export type PartnerInquiryFormProps = {
  onSuccess?: () => void;
  /** Parent should remount via `key` to clear fields after close. */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
};

export default function PartnerInquiryForm({
  onSuccess,
  onBusyChange,
  className = "",
}: PartnerInquiryFormProps) {
  const baseId = useId();
  const { expertRegistrationEnabled, recaptcha, featuresLoaded } = usePlatformFeatures();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setBusy = (busy: boolean) => {
    setSending(busy);
    onBusyChange?.(busy);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setBusy(true);

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
        const captchaError = await attachRecaptchaToken(body, "partners", {
          expertRegistrationEnabled,
          recaptcha,
        });
        if (captchaError) {
          setError(captchaError);
          setBusy(false);
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
        setBusy(false);
        return;
      }
      setBusy(false);
      onSuccess?.();
    } catch {
      setError("Не удалось отправить. Проверьте соединение.");
      setBusy(false);
    }
  };

  return (
    <form
      className={`editorial-partners__form relative ${className}`.trim()}
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      aria-busy={sending}
    >
      <div className="editorial-partners__fields">
        <label className="editorial-partners__field" htmlFor={`${baseId}-name`}>
          <span>Имя</span>
          <input
            id={`${baseId}-name`}
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            disabled={sending}
          />
        </label>
        <label className="editorial-partners__field" htmlFor={`${baseId}-phone`}>
          <span>Телефон</span>
          <input
            id={`${baseId}-phone`}
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
            placeholder="+7 …"
            disabled={sending}
          />
        </label>
        <label className="editorial-partners__field" htmlFor={`${baseId}-email`}>
          <span>Email</span>
          <input
            id={`${baseId}-email`}
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            disabled={sending}
          />
        </label>
        <label className="editorial-partners__field" htmlFor={`${baseId}-company`}>
          <span>Компания / бренд</span>
          <input
            id={`${baseId}-company`}
            name="company"
            autoComplete="organization"
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            maxLength={200}
            disabled={sending}
          />
        </label>
        <label
          className="editorial-partners__field editorial-partners__field--full"
          htmlFor={`${baseId}-website`}
        >
          <span>Сайт или соцсеть (необязательно)</span>
          <input
            id={`${baseId}-website`}
            name="website"
            autoComplete="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            maxLength={300}
            placeholder="https://…"
            disabled={sending}
          />
        </label>
        <label
          className="editorial-partners__field editorial-partners__field--full"
          htmlFor={`${baseId}-message`}
        >
          <span>Сообщение</span>
          <textarea
            id={`${baseId}-message`}
            name="message"
            required
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={4000}
            placeholder="Чем занимаетесь и какой формат сотрудничества интересен"
            disabled={sending}
          />
        </label>
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
        className="editorial-btn editorial-btn--gold editorial-partners__submit"
        disabled={sending}
      >
        {sending ? "Отправляем…" : "Отправить заявку"}
      </button>
      <p className="editorial-partners__legal">
        Нажимая кнопку, вы соглашаетесь на обработку данных для ответа на заявку.{" "}
        <Link href="/privacy" className="editorial-partners__legal-link">
          Политика конфиденциальности
        </Link>
      </p>
    </form>
  );
}
