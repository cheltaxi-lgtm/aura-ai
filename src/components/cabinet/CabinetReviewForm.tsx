"use client";
import { FormEvent, useEffect, useId, useState } from "react";
import Link from "next/link";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import StarRow from "@/components/editorial/ReviewStars";
import {
  LANDING_REVIEW_BODY_MAX, LANDING_REVIEW_BODY_MIN, LANDING_REVIEW_NAME_MAX,
  LANDING_REVIEW_PRODUCT_LABELS, LANDING_REVIEW_PRODUCTS, type LandingReviewProduct,
} from "@/lib/landing-reviews-shared";
const ERROR_COPY: Record<string, string> = {
  auth_required: "Войдите в аккаунт, чтобы отправить отзыв.",
  disabled: "Приём отзывов сейчас закрыт.",
  name_invalid: "Укажите имя без ссылок и цифр — как к вам обращаться.",
  body_short: "Напишите чуть подробнее — хотя бы пару предложений.",
  body_long: "Текст слишком длинный. Сократите, пожалуйста.",
  rating_invalid: "Поставьте оценку от 1 до 5 звёзд.",
  product_invalid: "Выберите, о чём отзыв.",
  already_pending: "Вы уже отправили отзыв — он на проверке.",
  rate_limited: "Слишком много попыток. Попробуйте завтра.",
  captcha: "Не удалось пройти проверку. Обновите страницу и попробуйте снова.",
};

export default function CabinetReviewForm() {
  const baseId = useId();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/reviews?limit=1", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted) setAvailable(data.enabled === true);
      })
      .catch(() => { /* Keep the form hidden when availability cannot be checked. */ });
    return () => controller.abort();
  }, []);
  const { expertRegistrationEnabled, recaptcha, featuresLoaded } = usePlatformFeatures();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [product, setProduct] = useState<LandingReviewProduct>("tarot");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || sent) return;
    setError(null);
    setSending(true);

    const payload: Record<string, unknown> = {
      name,
      city: city.trim() || undefined,
      product,
      rating,
      body,
      website_url: honeypot,
    };

    try {
      if (featuresLoaded) {
        const captchaError = await attachRecaptchaToken(payload, "reviews", {
          expertRegistrationEnabled,
          recaptcha,
        });
        if (captchaError) {
          setError(ERROR_COPY.captcha);
          setSending(false);
          return;
        }
      }

      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const code = typeof data.error === "string" ? data.error : "unknown";
        setError(ERROR_COPY[code] ?? "Не удалось отправить. Попробуйте позже.");
        setSending(false);
        return;
      }
      setSent(true);
      setSending(false);
    } catch {
      setError("Не удалось отправить. Проверьте соединение.");
      setSending(false);
    }
  };

  if (!available) return null;

  return (
        <div className="editorial-reviews__form-wrap">
          <h3 className="editorial-reviews__form-title">Оставить отзыв</h3>
          <p className="editorial-reviews__form-lead">
            Оценка звёздами и несколько предложений. Публикуем после модерации — без ссылок и без
            рекламы.
          </p>
          {sent ? (
            <p className="editorial-reviews__success" role="status">
              Спасибо. Отзыв ушёл на проверку и появится после модерации.
            </p>
          ) : (
            <form
              className="editorial-reviews__form relative"
              onSubmit={(e) => void onSubmit(e)}
              noValidate
              aria-busy={sending}
            >
              <div className="editorial-reviews__fields">
                <label className="editorial-reviews__field" htmlFor={`${baseId}-name`}>
                  <span>Имя</span>
                  <input
                    id={`${baseId}-name`}
                    name="name"
                    autoComplete="nickname"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={LANDING_REVIEW_NAME_MAX}
                    placeholder="Как к вам обращаться"
                    disabled={sending}
                  />
                </label>
                <label className="editorial-reviews__field" htmlFor={`${baseId}-city`}>
                  <span>Город (необязательно)</span>
                  <input
                    id={`${baseId}-city`}
                    name="city"
                    autoComplete="address-level2"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    maxLength={48}
                    placeholder="Москва"
                    disabled={sending}
                  />
                </label>
                <fieldset className="editorial-reviews__field editorial-reviews__field--full">
                  <legend>О чём отзыв</legend>
                  <div className="editorial-reviews__chips">
                    {LANDING_REVIEW_PRODUCTS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`editorial-reviews__chip ${product === id ? "is-on" : ""}`}
                        aria-pressed={product === id}
                        onClick={() => setProduct(id)}
                        disabled={sending}
                      >
                        {LANDING_REVIEW_PRODUCT_LABELS[id]}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="editorial-reviews__field editorial-reviews__field--full">
                  <span id={`${baseId}-rating`}>Оценка</span>
                  <StarRow
                    rating={rating}
                    interactive
                    onChange={setRating}
                    labelledBy={`${baseId}-rating`}
                  />
                </div>
                <label
                  className="editorial-reviews__field editorial-reviews__field--full"
                  htmlFor={`${baseId}-body`}
                >
                  <span>Текст</span>
                  <textarea
                    id={`${baseId}-body`}
                    name="body"
                    required
                    rows={5}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    minLength={LANDING_REVIEW_BODY_MIN}
                    maxLength={LANDING_REVIEW_BODY_MAX}
                    placeholder="Что спросили, что получили, чем это было полезно — без общих восторгов."
                    disabled={sending}
                  />
                  <span className="editorial-reviews__hint">
                    {body.trim().length}/{LANDING_REVIEW_BODY_MAX}
                  </span>
                </label>
                <label className="editorial-reviews__hp" aria-hidden tabIndex={-1}>
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
                <p className="editorial-reviews__error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="editorial-btn editorial-btn--gold editorial-reviews__submit"
                disabled={sending}
              >
                {sending ? "Отправляем…" : "Отправить на модерацию"}
              </button>
              <p className="editorial-reviews__legal">
                Нажимая кнопку, вы соглашаетесь на обработку текста отзыва.{" "}
                <Link href="/privacy" className="editorial-reviews__legal-link">
                  Политика конфиденциальности
                </Link>
              </p>
            </form>
          )}
        </div>
  );
}
