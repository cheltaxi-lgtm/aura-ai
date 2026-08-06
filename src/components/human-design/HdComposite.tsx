"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import {
  AUTHORITY_NAMES_RU,
  CENTER_NAMES_RU,
  HD_CONNECTION_RELATIONS,
  HD_CONNECTION_REPORT_MODULES,
  PROFILE_NAMES_RU,
  TYPE_META,
  analyzeHdConnection,
  sanitizeHdCompositeReportText,
  type HdConnectionRelation,
} from "@/lib/human-design";
import PaywallModal from "@/components/PaywallModal";
import { useRuneConfig } from "@/lib/useRuneConfig";
import Bodygraph from "./Bodygraph";
import type { HdChartPayload } from "./HdChartView";
import HdGenerating from "./HdGenerating";
import { hdApiErrorMessage } from "./hd-errors";
import { hdChartChipLabel } from "./hd-labels";
import { useHdReportWait } from "./useHdReportWait";

interface Props {
  base: HdChartPayload;
  partner: HdChartPayload;
  /** Optional default relation scenario for the paid report tone. */
  initialRelation?: HdConnectionRelation;
}

type ViewMode = "connection" | "base" | "partner";
type FocusFilter = "all" | "electro" | "harmony" | "friction";

/** Premium Connection Chart: mechanics + bodygraph + paid Evelina report. */
export default function HdComposite({ base, partner, initialRelation = "partner" }: Props) {
  const baseLabel =
    base.subjectKind === "other"
      ? hdChartChipLabel(base)
      : base.subjectName?.trim() || "вы";
  const partnerName =
    partner.subjectKind === "other" && partner.subjectName?.trim()
      ? partner.subjectName.trim()
      : hdChartChipLabel(partner);

  const conn = useMemo(
    () =>
      analyzeHdConnection(base.chart, partner.chart, {
        a: baseLabel,
        b: partnerName,
      }),
    [base.chart, partner.chart, baseLabel, partnerName]
  );

  const { cost, formatRunesWithRub, ready } = useRuneConfig();
  const reportCost = cost("HD_COMPOSITE_REPORT");
  const priceLabel = ready ? formatRunesWithRub(reportCost) : `${reportCost} ᚢ`;

  const [report, setReport] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [paywall, setPaywall] = useState<{ balance: number; required: number } | null>(null);
  const [relation, setRelation] = useState<HdConnectionRelation>(initialRelation);
  const [view, setView] = useState<ViewMode>("connection");
  const [focus, setFocus] = useState<FocusFilter>("all");
  const [ack, setAck] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>("harmony");
  const postInFlightRef = useRef(false);

  const { waiting, startedAt, startWait, stopWait } = useHdReportWait({
    mode: "composite",
    enabled: true,
    baseChartId: base.id,
    partnerChartId: partner.id,
    onDone: (r) => {
      if (r.reportText) {
        setReport(sanitizeHdCompositeReportText(r.reportText));
        setReportId(r.id);
      }
      setBusy(false);
    },
    onError: (msg) => {
      setError(msg);
      setBusy(false);
    },
  });

  useEffect(() => {
    setReport(null);
    setReportId(null);
    setError(null);
    setBusy(false);
    setNeedsLogin(false);
    setPaywall(null);
    setAck(false);
    setView("connection");
    setFocus("all");
    stopWait();

    let cancelled = false;
    const load = async () => {
      try {
        const qs = new URLSearchParams({
          baseChartId: base.id,
          partnerChartId: partner.id,
        });
        const res = await fetch(`/api/human-design/composite-report?${qs}`, {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json().catch(() => ({}))) as {
          report?: { id?: string; status?: string; reportText?: string | null };
        };
        if (cancelled) return;
        if (
          data.report?.status === "done" &&
          typeof data.report.reportText === "string" &&
          data.report.reportText.trim()
        ) {
          setReport(sanitizeHdCompositeReportText(data.report.reportText));
          if (typeof data.report.id === "string") setReportId(data.report.id);
          return;
        }
        if (data.report?.status === "pending") {
          if (typeof data.report.id === "string") setReportId(data.report.id);
          startWait();
          setBusy(true);
        }
      } catch {
        /* ignore — paid CTA still available */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [base.id, partner.id, startWait, stopWait]);

  const highlightChannels = useMemo(() => {
    if (focus === "electro") return conn.electromagneticKeys;
    if (focus === "harmony") {
      return new Set([
        ...conn.electromagnetic.map((c) => c.key),
        ...conn.companionship.map((c) => c.key),
      ]);
    }
    if (focus === "friction") {
      return new Set([
        ...conn.compromise.map((c) => c.key),
        ...conn.dominanceA.map((c) => c.key),
        ...conn.dominanceB.map((c) => c.key),
      ]);
    }
    return null;
  }, [conn, focus]);

  const bodyChart =
    view === "base" ? base.chart : view === "partner" ? partner.chart : conn.mergedChart;

  const buyReport = async (opts?: { regenerate?: boolean }) => {
    if (busy || postInFlightRef.current) return;
    if (!ack && !opts?.regenerate && !waiting) {
      setError("Подтвердите передачу данных карт языковой модели.");
      return;
    }
    setBusy(true);
    setError(null);
    startWait();
    postInFlightRef.current = true;
    try {
      const res = await fetch("/api/human-design/composite-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          baseChartId: base.id,
          partnerChartId: partner.id,
          aiDataUseAcknowledged: true,
          relation,
          regenerate: opts?.regenerate === true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        report?: { id?: string; status?: string; reportText?: string | null };
        error?: string;
        message?: string;
        balance?: number;
        required?: number;
        code?: string;
      };
      if (res.status === 401) {
        stopWait();
        setBusy(false);
        setNeedsLogin(true);
        setError("Разбор совместимости доступен после входа в аккаунт — карты сохранятся в кабинете.");
        return;
      }
      if (res.status === 402) {
        stopWait();
        setBusy(false);
        setPaywall({
          balance: Number(data.balance) || 0,
          required: Number(data.required) || reportCost,
        });
        return;
      }
      if (res.status === 409 && data?.code === "CLAIM_BUSY") {
        startWait();
        return;
      }
      if (data.report?.status === "done" && data.report.reportText) {
        setReport(sanitizeHdCompositeReportText(data.report.reportText));
        if (typeof data.report.id === "string") setReportId(data.report.id);
        stopWait();
        setBusy(false);
        return;
      }
      if (!res.ok) {
        stopWait();
        setBusy(false);
        setError(hdApiErrorMessage(data, "Не удалось получить разбор. Попробуйте позже."));
        return;
      }
      // Pending / long generate — keep polling.
      if (typeof data.report?.id === "string") setReportId(data.report.id);
      startWait();
    } catch {
      startWait();
      setError("Связь прервалась — ждём результат на сервере…");
    } finally {
      postInFlightRef.current = false;
    }
  };

  const toggleSection = (id: string) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  return (
    <div className="hd-connection space-y-5">
      {/* Hero */}
      <header className="hd-connection__hero">
        <p className="hd-connection__eyebrow">Дизайн Человека · карта связи</p>
        <h2 className="hd-connection__title">
          {baseLabel}
          <span className="hd-connection__amp"> × </span>
          {partnerName}
        </h2>
        <p className="hd-connection__headline">{conn.headline}</p>
        <div className="hd-connection__pair">
          <div className="hd-connection__person">
            <span className="hd-connection__person-label">{baseLabel}</span>
            <strong>{TYPE_META[conn.typeA].nameRu}</strong>
            <span>
              {conn.profileA} · {PROFILE_NAMES_RU[conn.profileA] ?? ""} ·{" "}
              {AUTHORITY_NAMES_RU[conn.authorityA]}
            </span>
          </div>
          <div className="hd-connection__person">
            <span className="hd-connection__person-label">{partnerName}</span>
            <strong>{TYPE_META[conn.typeB].nameRu}</strong>
            <span>
              {conn.profileB} · {PROFILE_NAMES_RU[conn.profileB] ?? ""} ·{" "}
              {AUTHORITY_NAMES_RU[conn.authorityB]}
            </span>
          </div>
        </div>
        <ul className="hd-connection__stats" aria-label="Сводка связи">
          <li>
            <strong>{conn.stats.electroCount}</strong>
            <span>электро</span>
          </li>
          <li>
            <strong>{conn.stats.companionshipCount}</strong>
            <span>общих каналов</span>
          </li>
          <li>
            <strong>{conn.stats.sharedCenterCount}</strong>
            <span>общих центров</span>
          </li>
          <li>
            <strong>{conn.stats.sharedGateCount}</strong>
            <span>общих ворот</span>
          </li>
        </ul>
      </header>

      {/* View controls */}
      <div className="hd-connection__toolbar hd-print-hidden">
        <div className="hd-connection__seg" role="group" aria-label="Режим бодиграфа">
          {(
            [
              ["connection", "Связь"],
              ["base", baseLabel],
              ["partner", partnerName],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={view === id ? "is-active" : undefined}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "connection" && (
          <div className="hd-connection__seg" role="group" aria-label="Фокус каналов">
            {(
              [
                ["all", "Всё"],
                ["electro", "Химия"],
                ["harmony", "Соответствия"],
                ["friction", "Трение"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={focus === id ? "is-active" : undefined}
                onClick={() => setFocus(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Bodygraph
        chart={bodyChart}
        electromagneticChannels={view === "connection" ? conn.electromagneticKeys : null}
        partnerGates={view === "connection" ? conn.partnerOnlyGates : null}
        focusChannels={view === "connection" ? highlightChannels : null}
      />

      <p className="hd-connection__decision">{conn.decisionNote}</p>

      {/* Deterministic sections */}
      <div className="hd-connection__sections">
        <ConnectionSection
          id="harmony"
          title="Соответствия"
          open={openSection === "harmony"}
          onToggle={() => toggleSection("harmony")}
        >
          {conn.harmonyNotes.length ? (
            <ul className="hd-connection__list">
              {conn.harmonyNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="hd-connection__muted">Явных опор мало — смотрите типы и центры ниже.</p>
          )}
          {conn.companionship.length > 0 && (
            <div className="hd-connection__chips">
              {conn.companionship.map((c) => (
                <span key={c.key} className="hd-connection__chip">
                  {c.key} · {c.nameRu}
                </span>
              ))}
            </div>
          )}
        </ConnectionSection>

        <ConnectionSection
          id="electro"
          title="Химия · электромагнетика"
          open={openSection === "electro"}
          onToggle={() => toggleSection("electro")}
        >
          {conn.electromagnetic.length ? (
            <ul className="hd-connection__list">
              {conn.electromagnetic.map((c) => (
                <li key={c.key}>
                  <strong>
                    {c.key} «{c.nameRu}»
                  </strong>
                  <span>{c.summary}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hd-connection__muted">
              Электромагнитных каналов нет — связь мягче, без классической «искры» ворот.
            </p>
          )}
        </ConnectionSection>

        <ConnectionSection
          id="friction"
          title="Несоответствия · трение"
          open={openSection === "friction"}
          onToggle={() => toggleSection("friction")}
        >
          {conn.frictionNotes.length ? (
            <ul className="hd-connection__list">
              {conn.frictionNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="hd-connection__muted">По механике явного трения мало.</p>
          )}
          {(conn.compromise.length > 0 ||
            conn.dominanceA.length > 0 ||
            conn.dominanceB.length > 0) && (
            <ul className="hd-connection__list mt-3">
              {[...conn.compromise, ...conn.dominanceA, ...conn.dominanceB].map((c) => (
                <li key={`${c.kind}-${c.key}`}>
                  <strong>
                    {c.key} «{c.nameRu}»
                  </strong>
                  <span>{c.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </ConnectionSection>

        <ConnectionSection
          id="centers"
          title="Центры · кто задаёт тон"
          open={openSection === "centers"}
          onToggle={() => toggleSection("centers")}
        >
          <ul className="hd-connection__centers">
            {conn.centers.map((c) => (
              <li key={c.center} data-kind={c.kind}>
                <span>{CENTER_NAMES_RU[c.center]}</span>
                <em>
                  {c.kind === "both"
                    ? "оба"
                    : c.kind === "aOnly"
                      ? baseLabel
                      : c.kind === "bOnly"
                        ? partnerName
                        : "открыт"}
                </em>
              </li>
            ))}
          </ul>
        </ConnectionSection>

        <ConnectionSection
          id="decisions"
          title="Решения и стратегии"
          open={openSection === "decisions"}
          onToggle={() => toggleSection("decisions")}
        >
          <p>{conn.decisionNote}</p>
          <p className="mt-2 text-sm text-white/55">
            {baseLabel}: подпись «{TYPE_META[conn.typeA].signatureRu}», ложное «я» —{" "}
            {TYPE_META[conn.typeA].notSelfRu}. {partnerName}: подпись «
            {TYPE_META[conn.typeB].signatureRu}», ложное «я» — {TYPE_META[conn.typeB].notSelfRu}.
          </p>
        </ConnectionSection>
      </div>

      {/* Paid report */}
      <div className="hd-panel hd-print-hidden">
        <p className="hd-panel__title">Разбор связи от Эвелины</p>

        {(waiting || busy) && !report ? (
          <div className="mt-4">
            <HdGenerating kind="composite" startedAt={startedAt ?? Date.now()} />
            {error && (
              <p className="mt-3 text-sm text-amber-100/70" role="status">
                {error}
              </p>
            )}
          </div>
        ) : (waiting || busy) && report ? (
          <div className="mt-4">
            <HdGenerating kind="composite" startedAt={startedAt ?? Date.now()} />
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/60">
              Механика выше — бесплатно. Ниже модульный текст Эвелины по вашей карте связи. Сначала
              выберите контекст.
            </p>

            <div className="hd-connection__relations" role="radiogroup" aria-label="Контекст связи">
              {HD_CONNECTION_RELATIONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={relation === r.id}
                  className={relation === r.id ? "is-active" : undefined}
                  onClick={() => setRelation(r.id)}
                >
                  <strong>{r.label}</strong>
                  <span>{r.hint}</span>
                </button>
              ))}
            </div>

            {!report && (
              <>
                <div className="hd-packages hd-packages--single mt-4">
                  <div className="hd-package is-active is-featured">
                    <span className="hd-package__badge">Премиум</span>
                    <strong className="hd-package__label">Карта связи</strong>
                    <span className="hd-package__tagline">
                      Модульный разбор под выбранный сценарий
                    </span>
                    <span className="hd-package__price">{priceLabel}</span>
                    <ul className="hd-package__modules">
                      {HD_CONNECTION_REPORT_MODULES.map((m) => (
                        <li key={m.id}>
                          <span aria-hidden="true">✓</span>
                          <span>
                            <em>{m.title}</em>
                            {m.blurb}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <label className="mt-4 flex items-start gap-2.5 text-xs leading-relaxed text-white/60">
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                    className="mt-0.5 accent-amber-500"
                  />
                  <span>
                    Подтверждаю передачу рассчитанных данных обеих карт внешней языковой модели для
                    генерации разбора.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => void buyReport()}
                  disabled={busy || waiting || !ack}
                  className="btn-luxe btn-luxe--gold mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {`Получить разбор связи · ${priceLabel}`}
                </button>
              </>
            )}

            {error && (
              <p
                className="mt-3 rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-xs text-red-200/90"
                role="alert"
              >
                {error}
                {needsLogin && (
                  <>
                    {" "}
                    <a
                      href="/auth/user/login?returnTo=/cabinet/human-design"
                      className="underline underline-offset-2 hover:text-red-100"
                    >
                      Войти
                    </a>
                  </>
                )}
              </p>
            )}

            {report && (
              <div className="hd-report mt-5">
                <ReactMarkdown>{report}</ReactMarkdown>
                <div className="hd-report__actions hd-print-hidden mt-5 flex flex-wrap gap-2">
                  {reportId ? (
                    <a
                      href={`/cabinet/human-design/composite-reports/${reportId}/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hd-bodygraph__export"
                    >
                      Печать / PDF
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="hd-bodygraph__export"
                      onClick={() => window.print()}
                      title="Печать или сохранение как PDF"
                    >
                      Печать / PDF
                    </button>
                  )}
                  <button
                    type="button"
                    className="hd-bodygraph__export"
                    disabled={busy || waiting}
                    onClick={() => void buyReport({ regenerate: true })}
                    title="Бесплатно пересобрать текст в новом формате"
                  >
                    Пересобрать разбор
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <PaywallModal
        isOpen={paywall !== null}
        onClose={() => setPaywall(null)}
        options={{
          currentBalance: paywall?.balance ?? 0,
          requiredRunes: paywall?.required ?? reportCost,
          onUnlocked: () => setPaywall(null),
        }}
      />
    </div>
  );
}

function ConnectionSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="hd-connection__section" data-open={open || undefined}>
      <button
        type="button"
        className="hd-connection__section-head"
        aria-expanded={open}
        aria-controls={`hd-conn-${id}`}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id={`hd-conn-${id}`} className="hd-connection__section-body">
          {children}
        </div>
      )}
    </section>
  );
}
