"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, CheckCircle2, Circle, Archive, Trash2 } from "lucide-react";
import { getSessionTopic, topicLabel, type SessionTopicId } from "@/lib/session-topics";
import { formatCabinetPredictionPreview, stripMarkdownText, truncate } from "@/lib/cabinet-utils";
import { getSpread, normalizeSpreadId } from "@/lib/spreads";
import { decodeNumerologSpreadId, getNumerologTool } from "@/lib/numerology/tools";
import { clientSafeMatrixResolveError } from "@/lib/numerology/matrix-labels";
import { resolveMatrixForDisplayDetailed } from "@/lib/numerology/matrix-snapshot";
import DestinyMatrixGrid from "@/components/numerolog/DestinyMatrixGrid";
import MasterAvatar from "@/components/MasterAvatar";
import { getCharacterById } from "@/lib/characters";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { findShowcaseMaster } from "@/lib/showcase-masters";
import {
  RITUAL_MASTERS,
  RITUAL_TYPES,
  ritualStatusLabel,
  type RitualType,
} from "@/lib/ritual-config";
import type { RitualClientData } from "@/components/ritual/RitualCard";
import { resetWindowScroll, resetWindowScrollSoon } from "@/lib/reset-window-scroll";

export type SessionListItem = {
  id: string;
  intention: string | null;
  spreadType: string | null;
  spreadId: string | null;
  cards: string[] | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  topicSummary: string | null;
  keyCards: string[] | null;
  prediction: string | null;
  matrixSubjectId?: string | null;
  matrixBirthDate?: string | null;
  matrixCalculationVersion?: string | null;
  matrixStructuredData?: Record<string, unknown> | null;
  matrixSubjectName?: string | null;
  matrixSubjectKind?: string | null;
  readingPreview?: string | null;
  customQuestion?: string | null;
};

interface SessionListProps {
  masterId: string;
  masters?: ShowcaseMaster[];
  active: SessionListItem | null;
  completed: SessionListItem[];
  loading?: boolean;
  actionSessionId?: string | null;
  onBack: () => void;
  onNewSession: () => void;
  onStartDaily?: () => void;
  onStartRitual?: () => void;
  onOpenRitual?: (ritualId: string) => void;
  onRitualDeleted?: (ritualId: string) => void;
  onContinueActive: (session: SessionListItem) => void;
  onOpenArchive: (session: SessionListItem) => void;
  onArchiveSession: (session: SessionListItem) => void;
  onDeleteSession: (session: SessionListItem) => void;
}

function formatSessionDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function intentionLabel(raw: string | null): string {
  if (!raw) return "Сеанс";
  try {
    return topicLabel(raw as SessionTopicId);
  } catch {
    return raw;
  }
}

const KNOWN_GENERIC_SUMMARIES = new Set([
  "сеанс",
  "свой вопрос",
  "нумерология",
  "матрица судьбы",
  "матрица",
  "сеанс в процессе",
]);

function isGenericSummary(summary: string): boolean {
  return KNOWN_GENERIC_SUMMARIES.has(summary.trim().toLowerCase());
}

function looksLikeCustomQuestion(summary: string): boolean {
  const t = summary.trim();
  if (!t || isGenericSummary(t)) return false;
  if (getSessionTopic(t)) return false;
  // Free-form client question stored in topic_summary without intention=custom.
  return t.length >= 8;
}

function resolveCustomQuestion(item: SessionListItem): string | null {
  const fromApi = item.customQuestion?.trim() || "";
  if (fromApi) return fromApi;
  const summary = item.topicSummary ? stripMarkdownText(item.topicSummary) : "";
  if (looksLikeCustomQuestion(summary)) return summary;
  return null;
}

function sessionTopicLabel(item: SessionListItem): string {
  if (item.spreadType === "photo") return "Фото-расклад";
  const summary = item.topicSummary ? stripMarkdownText(item.topicSummary) : "";
  const numerologToolId = decodeNumerologSpreadId(item.spreadId);
  if (numerologToolId === "destiny_matrix" || numerologToolId === "child_matrix") {
    const who =
      item.matrixSubjectKind === "self"
        ? "Я"
        : item.matrixSubjectName?.trim() || null;
    return who || "Матрица";
  }
  const question = resolveCustomQuestion(item);
  if (item.intention === "custom" || summary === "Свой вопрос" || question) {
    return "Свой вопрос";
  }
  if (!item.intention && summary) return summary;
  return intentionLabel(item.intention);
}

/** Old rows may hold raw reading markdown (card images etc.) — always sanitize. */
function sessionPreviewText(item: SessionListItem): string {
  const stub = (item.prediction?.trim() || "").toLowerCase() === "сеанс в процессе";
  const source =
    (!stub && item.prediction?.trim()) ||
    item.readingPreview?.trim() ||
    (!isGenericSummary(item.topicSummary || "") ? item.topicSummary?.trim() : "") ||
    "";
  if (!source) return "";
  const polished = formatCabinetPredictionPreview(source);
  if (polished) return polished;
  return truncate(stripMarkdownText(source), 220);
}

function sessionSpreadLabel(item: SessionListItem): string | null {
  if (item.spreadType === "guest_resume") return null;
  if (item.spreadType === "daily") return "Карты дня";
  if (!item.spreadId || item.spreadType === "photo") return null;
  const numerologToolId = decodeNumerologSpreadId(item.spreadId);
  if (numerologToolId) return getNumerologTool(numerologToolId).label;
  const spread = getSpread(normalizeSpreadId(item.spreadId));
  if (spread.id === "triplet" && item.spreadType !== "new") return null;
  return spread.label;
}

function sessionHeading(item: SessionListItem): string {
  const topic = sessionTopicLabel(item);
  const spread = sessionSpreadLabel(item);
  if (spread && topic && spread !== topic) return `${spread} · ${topic}`;
  if (spread) return spread;
  return topic;
}

function isDestinyMatrixSession(item: SessionListItem): boolean {
  const toolId = decodeNumerologSpreadId(item.spreadId);
  return toolId === "destiny_matrix" || toolId === "child_matrix";
}

function MatrixSessionPreview({ item }: { item: SessionListItem }) {
  const resolved = useMemo(() => {
    const birth = item.matrixBirthDate?.trim();
    if (!birth) return null;
    return resolveMatrixForDisplayDetailed({
      birthDate: birth,
      calculationVersion: item.matrixCalculationVersion,
      createdAt: item.createdAt,
      structuredData: item.matrixStructuredData,
    });
  }, [
    item.matrixBirthDate,
    item.matrixCalculationVersion,
    item.createdAt,
    item.matrixStructuredData,
  ]);
  if (!resolved) return null;
  if (!resolved.ok) {
    return (
      <p className="mt-3 text-sm opacity-70">{clientSafeMatrixResolveError(resolved.error)}</p>
    );
  }
  return (
    <div className="destiny-matrix--session-list mt-3 origin-top-left">
      <DestinyMatrixGrid matrix={resolved.matrix} revealed={99} hint="" compact showPeriod={false} />
    </div>
  );
}

function minutesSince(updatedAt: string, createdAt: string): number {
  const start = new Date(createdAt).getTime();
  const end = new Date(updatedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(1, Math.round((end - start) / 60000));
}

function SessionActions({
  session,
  isActive,
  busy,
  onContinue,
  onArchive,
  onDelete,
}: {
  session: SessionListItem;
  isActive: boolean;
  busy: boolean;
  onContinue: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={onContinue}
        className="btn-luxe btn-luxe--sm btn-luxe--gold"
      >
        {busy ? "…" : "Продолжить сеанс"}
      </button>
      {isActive ? (
        <button
          type="button"
          disabled={busy}
          onClick={onArchive}
          className="btn-luxe btn-luxe--sm btn-luxe--silver"
        >
          <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden />
          В архив
        </button>
      ) : (
        <span className="btn-luxe btn-luxe--sm btn-luxe--silver opacity-50">
          <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden />
          В архиве
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="btn-luxe btn-luxe--sm btn-luxe--bronze"
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Удалить
      </button>
    </div>
  );
}

export default function SessionList({
  masterId,
  masters = [],
  active,
  completed,
  loading = false,
  actionSessionId = null,
  onBack,
  onNewSession,
  onStartDaily,
  onStartRitual,
  onOpenRitual,
  onRitualDeleted,
  onContinueActive,
  onOpenArchive,
  onArchiveSession,
  onDeleteSession,
}: SessionListProps) {
  const master =
    findShowcaseMaster(masterId, masters) ?? getCharacterById(masterId);
  const masterName = master?.name ?? "Мастер";
  const showRituals = (RITUAL_MASTERS as readonly string[]).includes(masterId);
  const [rituals, setRituals] = useState<RitualClientData[]>([]);
  const [deletingRitualId, setDeletingRitualId] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const fetchRituals = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/ritual/list?characterKey=${encodeURIComponent(masterId)}`,
        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setRituals((data.rituals ?? []).slice(0, 3));
      }
    } catch {
      /* ignore */
    }
  }, [masterId]);

  useEffect(() => {
    if (!showRituals) return;
    void fetchRituals();
  }, [fetchRituals, showRituals]);

  // Soft-nav from the masters salon keeps window scroll. Reset on open and
  // again after sessions/rituals paint (list growth used to leave you at the bottom).
  useLayoutEffect(() => {
    resetWindowScroll();
    topRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [masterId]);

  useEffect(() => {
    resetWindowScrollSoon();
    topRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [masterId, loading, active?.id, completed.length, rituals.length]);

  const handleDeleteRitual = async (ritualId: string) => {
    const confirmed = window.confirm(
      "Удалить этот обряд безвозвратно? Карточка и ответы будут потеряны."
    );
    if (!confirmed) return;

    setDeletingRitualId(ritualId);
    try {
      const res = await fetch(`/api/ritual/${encodeURIComponent(ritualId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Не удалось удалить обряд");
      setRituals((prev) => prev.filter((r) => r.id !== ritualId));
      onRitualDeleted?.(ritualId);
    } catch {
      window.alert("Не удалось удалить обряд. Попробуйте позже.");
    } finally {
      setDeletingRitualId(null);
    }
  };

  return (
    <div
      ref={topRef}
      className="mx-auto max-w-2xl px-4 pb-10 pt-2 sm:px-6"
      style={{ overflowAnchor: "none" }}
    >
      <div className="glass-panel mb-6 flex items-center gap-4 p-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Назад к мастерам"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <MasterAvatar masterId={masterId} masterName={masterName} size="lg" />
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold text-white">{masterName}</h2>
          <p className="text-sm text-gray-400">Ваши сеансы с этим мастером</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onNewSession}
        className="btn-primary mb-3 flex w-full items-center justify-center gap-2 py-3 text-sm"
      >
        <Plus className="h-4 w-4" />
        Новый сеанс с темой
      </button>

      {onStartDaily ? (
        <button
          type="button"
          onClick={onStartDaily}
          className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block mb-6"
        >
          С картами дня — расшифровка
        </button>
      ) : (
        <div className="mb-3" />
      )}

      {loading && !active && completed.length === 0 ? (
        <p className="text-center text-sm text-gray-400">Загрузка сеансов…</p>
      ) : null}

      {active ? (
        <section className="glass-panel mb-4 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm text-aura-emerald">
            <Circle className="h-3 w-3 fill-current" />
            Активный сеанс
          </div>
          <p className="font-medium text-white">
            {sessionHeading(active)} · {active.messageCount} сообщений ·{" "}
            {minutesSince(active.updatedAt, active.createdAt)} мин
          </p>
          {resolveCustomQuestion(active) ? (
            <p className="mt-2 text-sm text-amber-100/90">
              <span className="text-white/45">Вопрос: </span>
              «{truncate(resolveCustomQuestion(active)!, 120)}»
            </p>
          ) : null}
          {active.cards?.length ? (
            <p className="mt-1 text-sm text-gray-400">{active.cards.join(" · ")}</p>
          ) : null}
          {isDestinyMatrixSession(active) ? <MatrixSessionPreview item={active} /> : null}
          {sessionPreviewText(active) ? (
            <p className="mt-2 line-clamp-2 text-sm text-gray-400">
              «{sessionPreviewText(active)}»
            </p>
          ) : null}
          <SessionActions
            session={active}
            isActive
            busy={actionSessionId === active.id}
            onContinue={() => onContinueActive(active)}
            onArchive={() => onArchiveSession(active)}
            onDelete={() => onDeleteSession(active)}
          />
        </section>
      ) : null}

      {completed.length > 0 ? (
        <div className="space-y-3">
          {completed.map((item) => (
            <section key={item.id} className="glass-panel p-4">
              <div className="mb-1 flex items-center gap-2 text-sm text-gray-400">
                <CheckCircle2 className="h-4 w-4 text-aura-emerald/80" />
                {formatSessionDate(item.updatedAt || item.createdAt)}
              </div>
              <p className="font-medium text-white">
                {sessionHeading(item)}
                {!isDestinyMatrixSession(item) &&
                (item.keyCards?.length || item.cards?.length)
                  ? ` · ${(item.keyCards ?? item.cards ?? []).join(" · ")}`
                  : ""}
              </p>
              {resolveCustomQuestion(item) ? (
                <p className="mt-2 text-sm text-amber-100/90">
                  <span className="text-white/45">Вопрос: </span>
                  «{truncate(resolveCustomQuestion(item)!, 120)}»
                </p>
              ) : null}
              {isDestinyMatrixSession(item) ? <MatrixSessionPreview item={item} /> : null}
              {sessionPreviewText(item) ? (
                <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                  «{sessionPreviewText(item)}»
                </p>
              ) : null}
              <SessionActions
                session={item}
                isActive={false}
                busy={actionSessionId === item.id}
                onContinue={() => onOpenArchive(item)}
                onArchive={() => onArchiveSession(item)}
                onDelete={() => onDeleteSession(item)}
              />
            </section>
          ))}
        </div>
      ) : !active && !loading ? (
        <p className="text-center text-sm text-gray-500">
          Прошлых сеансов пока нет. Начните новый — выберите тему и карты.
        </p>
      ) : null}

      {showRituals && onStartRitual ? (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-white">🕯 Мои обряды</h3>
            <button
              type="button"
              onClick={onStartRitual}
              className="text-sm text-amber-400 hover:text-amber-300"
            >
              + Новый обряд
            </button>
          </div>
          {rituals.length === 0 ? (
            <p className="text-center text-sm text-gray-500">Обрядов пока нет</p>
          ) : (
            <div className="space-y-2">
              {rituals.map((r) => {
                const cfg = RITUAL_TYPES[r.ritualType as RitualType];
                const date = new Date(r.createdAt).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "short",
                });
                return (
                  <div
                    key={r.id}
                    className="glass-panel flex items-center gap-2 p-3"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenRitual?.(r.id)}
                      className="min-w-0 flex-1 text-left transition hover:text-amber-200"
                    >
                      <p className="text-sm font-medium text-white">
                        {cfg?.emoji} {cfg?.label} · {ritualStatusLabel(r.status)}
                      </p>
                      <p className="text-xs text-gray-400">{date}</p>
                    </button>
                    <button
                      type="button"
                      disabled={deletingRitualId === r.id}
                      onClick={() => void handleDeleteRitual(r.id)}
                      aria-label="Удалить обряд"
                      className="btn-luxe btn-luxe--sm btn-luxe--bronze shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {deletingRitualId === r.id ? "…" : "Удалить"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
