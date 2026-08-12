"use client";

import { useCallback, useEffect, useState } from "react";
import ProShell from "@/modules/pro/ui/ProShell";
import {
  DEFAULT_LANDING_SECTIONS,
  type ProLandingSections,
} from "@/modules/pro/landing-defaults";

type LandingState = {
  published: boolean;
  headline: string;
  subheadline: string;
  promo_badge: string;
  price_rub: number | "";
  promo_limit: number | "";
  promo_used: number | "";
  contact_note: string;
  sections: ProLandingSections;
  intake_url: string | null;
};

const EMPTY: LandingState = {
  published: false,
  headline: "",
  subheadline: "",
  promo_badge: "",
  price_rub: "",
  promo_limit: "",
  promo_used: 0,
  contact_note: "",
  sections: { ...DEFAULT_LANDING_SECTIONS, includes: { ...DEFAULT_LANDING_SECTIONS.includes } },
  intake_url: null,
};

export default function ProLandingEditorPage() {
  const [state, setState] = useState<LandingState>(EMPTY);
  const [slug, setSlug] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await fetch("/api/pro/landing", { credentials: "include" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.status === 404) {
      setErr("Минилендинг выключен (PRO_PORTAL_ENABLED).");
      return;
    }
    if (!res.ok) {
      setErr(json.error || "Не удалось загрузить");
      return;
    }
    const l = json.landing as {
      published?: boolean;
      headline?: string | null;
      subheadline?: string | null;
      promo_badge?: string | null;
      price_rub?: number | null;
      promo_limit?: number | null;
      promo_used?: number;
      contact_note?: string | null;
      sections?: ProLandingSections;
      intake_url?: string | null;
    };
    setSlug(typeof json.slug === "string" ? json.slug : null);
    setPublicUrl(typeof json.publicUrl === "string" ? json.publicUrl : null);
    setState({
      published: Boolean(l.published),
      headline: l.headline ?? "",
      subheadline: l.subheadline ?? "",
      promo_badge: l.promo_badge ?? "",
      price_rub: l.price_rub ?? "",
      promo_limit: l.promo_limit ?? "",
      promo_used: l.promo_used ?? 0,
      contact_note: l.contact_note ?? "",
      sections: l.sections
        ? {
            ...DEFAULT_LANDING_SECTIONS,
            ...l.sections,
            includes: {
              ...DEFAULT_LANDING_SECTIONS.includes,
              ...l.sections.includes,
            },
          }
        : EMPTY.sections,
      intake_url: l.intake_url ?? null,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(opts?: { publish?: boolean }) {
    setSaving(true);
    setMsg(null);
    setErr(null);
    const nextPublished =
      opts?.publish !== undefined ? opts.publish : state.published;
    const body = {
      published: nextPublished,
      headline: state.headline,
      subheadline: state.subheadline,
      promo_badge: state.promo_badge || null,
      price_rub: state.price_rub === "" ? null : Number(state.price_rub),
      promo_limit: state.promo_limit === "" ? null : Number(state.promo_limit),
      promo_used: state.promo_used === "" ? 0 : Number(state.promo_used),
      contact_note: state.contact_note || null,
      sections: state.sections,
      ensureIntake: nextPublished,
    };
    const res = await fetch("/api/pro/landing", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr(json.error || "Не удалось сохранить");
      return;
    }
    setMsg(
      opts?.publish === true
        ? "Опубликовано"
        : opts?.publish === false
          ? "Снято с публикации"
          : "Сохранено"
    );
    if (json.landing) {
      const l = json.landing;
      setState((prev) => ({
        ...prev,
        published: Boolean(l.published),
        intake_url: l.intake_url ?? prev.intake_url,
      }));
    }
    if (typeof json.publicUrl === "string") setPublicUrl(json.publicUrl);
  }

  function setSection<K extends keyof ProLandingSections>(key: K, value: ProLandingSections[K]) {
    setState((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: value },
    }));
  }

  if (loading) {
    return (
      <ProShell title="Минилендинг">
        <p className="text-sm text-[var(--pro-muted)]">Загрузка…</p>
      </ProShell>
    );
  }

  return (
    <ProShell title="Минилендинг">
      <p className="mb-6 max-w-2xl text-sm text-[var(--pro-muted)]">
        Публичная страница оффера для ссылки с Авито и других каналов. CTA ведёт в анкету-бриф
        клиента. Счётчик «использовано» растёт автоматически с каждой отправленной анкетой —
        при достижении лимита промо перестаёт считаться (править можно вручную).
      </p>

      {err && (
        <p className="mb-4 text-sm text-red-300/90" role="alert">
          {err}
        </p>
      )}
      {msg && (
        <p className="mb-4 text-sm text-[var(--pro-accent-light)]" role="status">
          {msg}
        </p>
      )}

      <div className="mb-6 rounded-2xl border border-[var(--pro-border)] bg-black/20 px-4 py-3 text-sm">
        <p className="text-[var(--pro-faint)]">Публичный адрес</p>
        {publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-[var(--pro-accent-light)] underline-offset-2 hover:underline"
          >
            {typeof window !== "undefined"
              ? `${window.location.origin}${publicUrl}`
              : publicUrl}
          </a>
        ) : (
          <p className="mt-1 text-[var(--pro-muted)]">
            slug: {slug || "не задан"} — опубликуйте, чтобы открыть ссылку
          </p>
        )}
        {state.intake_url ? (
          <p className="mt-2 text-xs text-[var(--pro-faint)]">
            Анкета:{" "}
            <a href={state.intake_url} className="underline underline-offset-2">
              {state.intake_url}
            </a>
          </p>
        ) : null}
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.published}
            onChange={(e) => setState((p) => ({ ...p, published: e.target.checked }))}
          />
          Опубликован
        </label>
      </div>

      <div className="grid max-w-3xl gap-4">
        <Field label="Заголовок">
          <input
            className="pro-field"
            value={state.headline}
            onChange={(e) => setState((p) => ({ ...p, headline: e.target.value }))}
          />
        </Field>
        <Field label="Подзаголовок">
          <textarea
            className="pro-field"
            rows={2}
            value={state.subheadline}
            onChange={(e) => setState((p) => ({ ...p, subheadline: e.target.value }))}
          />
        </Field>
        <Field label="Промо-бейдж">
          <input
            className="pro-field"
            value={state.promo_badge}
            onChange={(e) => setState((p) => ({ ...p, promo_badge: e.target.value }))}
            placeholder="Первые 10 полных разборов — бесплатно"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Цена, ₽">
            <input
              className="pro-field"
              type="number"
              min={0}
              value={state.price_rub}
              onChange={(e) =>
                setState((p) => ({
                  ...p,
                  price_rub: e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
            />
          </Field>
          <Field label="Лимит промо">
            <input
              className="pro-field"
              type="number"
              min={0}
              value={state.promo_limit}
              onChange={(e) =>
                setState((p) => ({
                  ...p,
                  promo_limit: e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
            />
          </Field>
          <Field label="Использовано">
            <input
              className="pro-field"
              type="number"
              min={0}
              value={state.promo_used}
              onChange={(e) =>
                setState((p) => ({
                  ...p,
                  promo_used: e.target.value === "" ? 0 : Number(e.target.value),
                }))
              }
            />
          </Field>
        </div>
        <Field label="Примечание по связи">
          <input
            className="pro-field"
            value={state.contact_note}
            onChange={(e) => setState((p) => ({ ...p, contact_note: e.target.value }))}
          />
        </Field>

        <Field label="Кто я">
          <textarea
            className="pro-field"
            rows={8}
            value={state.sections.who}
            onChange={(e) => setSection("who", e.target.value)}
          />
        </Field>
        <Field label="Что вы получите">
          <textarea
            className="pro-field"
            rows={8}
            value={state.sections.what_you_get}
            onChange={(e) => setSection("what_you_get", e.target.value)}
          />
        </Field>

        {(["natal", "matrix", "hd"] as const).map((key) => (
          <div key={key} className="grid gap-2 rounded-xl border border-[var(--pro-border)] p-3">
            <p className="text-xs uppercase tracking-wider text-[var(--pro-faint)]">
              Блок «{key}»
            </p>
            <input
              className="pro-field"
              value={state.sections.includes[key].title}
              onChange={(e) =>
                setState((p) => ({
                  ...p,
                  sections: {
                    ...p.sections,
                    includes: {
                      ...p.sections.includes,
                      [key]: { ...p.sections.includes[key], title: e.target.value },
                    },
                  },
                }))
              }
            />
            <textarea
              className="pro-field"
              rows={3}
              value={state.sections.includes[key].body}
              onChange={(e) =>
                setState((p) => ({
                  ...p,
                  sections: {
                    ...p.sections,
                    includes: {
                      ...p.sections.includes,
                      [key]: { ...p.sections.includes[key], body: e.target.value },
                    },
                  },
                }))
              }
            />
          </div>
        ))}

        <Field label="Почему расчёт точный">
          <textarea
            className="pro-field"
            rows={5}
            value={state.sections.accuracy}
            onChange={(e) => setSection("accuracy", e.target.value)}
          />
        </Field>
        <Field label="Как это работает">
          <textarea
            className="pro-field"
            rows={5}
            value={state.sections.how_it_works}
            onChange={(e) => setSection("how_it_works", e.target.value)}
          />
        </Field>
        <Field label="Чего не будет">
          <textarea
            className="pro-field"
            rows={5}
            value={state.sections.wont_do}
            onChange={(e) => setSection("wont_do", e.target.value)}
          />
        </Field>
        <Field label="Текст кнопки CTA">
          <input
            className="pro-field"
            value={state.sections.cta}
            onChange={(e) => setSection("cta", e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-neon px-4 py-2 text-sm disabled:opacity-50"
          disabled={saving}
          onClick={() => void save()}
        >
          Сохранить
        </button>
        <button
          type="button"
          className="btn-luxe btn-luxe--gold btn-luxe--sm disabled:opacity-50"
          disabled={saving}
          onClick={() => void save({ publish: true })}
        >
          Опубликовать
        </button>
        {state.published ? (
          <button
            type="button"
            className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/70 disabled:opacity-50"
            disabled={saving}
            onClick={() => void save({ publish: false })}
          >
            Снять с публикации
          </button>
        ) : null}
      </div>
    </ProShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm text-[var(--pro-muted)]">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
