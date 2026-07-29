"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { usePaywall } from "@/contexts/PaywallContext";
import { useAuth } from "@/lib/useAuth";
import { navigateToBirthProfileOnboarding } from "@/lib/app-shell-nav";
import {
  persistSessionIntention,
  persistIntentionSpreadState,
} from "@/lib/intention";
import { clearChatCache } from "@/lib/chat-cache";
import { sortCabinetSessionsByDate } from "@/lib/cabinet-utils";
import CabinetNatalChart from "@/components/cabinet/CabinetNatalChart";
import CabinetProfilePanel, {
  type CabinetProfile as EditableCabinetProfile,
} from "@/components/CabinetProfilePanel";
import CabinetProfileHeader, {
  CabinetProfileHeaderSkeleton,
} from "@/components/cabinet/CabinetProfileHeader";
import CabinetStatsGrid, { CabinetStatsGridSkeleton } from "@/components/cabinet/CabinetStatsGrid";
import CabinetAchievementsRow, {
  CabinetAchievementsSkeleton,
} from "@/components/cabinet/CabinetAchievementsRow";
import CabinetSessionHistory, {
  CabinetSessionHistorySkeleton,
} from "@/components/cabinet/CabinetSessionHistory";
import CabinetDiaryPreview, {
  CabinetDiaryPreviewSkeleton,
} from "@/components/cabinet/CabinetDiaryPreview";
import CabinetBottomNav, { type CabinetTab } from "@/components/cabinet/CabinetBottomNav";
import CabinetTabHero from "@/components/cabinet/CabinetTabHero";
import CabinetRunesPanel, { CabinetRunesPanelSkeleton } from "@/components/cabinet/CabinetRunesPanel";
import CabinetLegacyAccessPanel from "@/components/cabinet/CabinetLegacyAccessPanel";
import CabinetPhotoSpreads from "@/components/cabinet/CabinetPhotoSpreads";
import CabinetDailySpreads from "@/components/cabinet/CabinetDailySpreads";
import CabinetRitualsPanel from "@/components/cabinet/CabinetRitualsPanel";
import CabinetRitualReviewBanner from "@/components/cabinet/CabinetRitualReviewBanner";
import CabinetDangerZone from "@/components/cabinet/CabinetDangerZone";
import CabinetTelegramLink from "@/components/cabinet/CabinetTelegramLink";
import CabinetDeleteAccount from "@/components/cabinet/CabinetDeleteAccount";
import { redirectHomeAfterAccountDeletion } from "@/lib/account-deleted";
import CabinetDailyNotifications from "@/components/cabinet/CabinetDailyNotifications";
import CabinetAppVersion from "@/components/cabinet/CabinetAppVersion";
import CabinetJointReadings from "@/components/cabinet/CabinetJointReadings";
import CabinetMemoryFacts from "@/components/cabinet/CabinetMemoryFacts";
import CabinetSupportLink from "@/components/cabinet/CabinetSupportLink";
import RitualFlow from "@/components/ritual/RitualFlow";
import { clearClientActivityState } from "@/lib/client-logout";
import type { RitualMasterKey } from "@/lib/ritual-config";
import type { CabinetRitualStats } from "@/lib/ritual-service";
import type {
  CabinetProfile,
  CabinetStats,
  CabinetSessionRow,
  CabinetAchievementEarned,
  CabinetAchievementLocked,
  CabinetDiaryPreview as DiaryEntry,
  CabinetRuneTransaction,
  CabinetLegacyAccess,
  CabinetPhotoSpreadRow,
  CabinetDailyReadingRow,
} from "@/lib/cabinet-data";

interface CabinetResponse {
  needsOnboarding?: boolean;
  profile: CabinetProfile;
  stats: CabinetStats;
  achievements: { earned: CabinetAchievementEarned[]; locked: CabinetAchievementLocked[] };
  sessions: CabinetSessionRow[];
  sessionsTotal: number;
  sessionsHasMore: boolean;
  diaryPreview: DiaryEntry[];
  runes: { enabled: boolean; balance: number; transactions: CabinetRuneTransaction[] };
  legacyAccess: CabinetLegacyAccess | null;
  photoSpreads: CabinetPhotoSpreadRow[];
  dailyReadings: CabinetDailyReadingRow[];
}

const TAB_MOTION = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.22, ease: "easeOut" as const },
};

const FETCH_RETRY_ATTEMPTS = 3;
const FETCH_RETRY_DELAY_MS = 600;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < FETCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(input, init);
      if (res.status >= 500 && attempt < FETCH_RETRY_ATTEMPTS - 1) {
        await sleep(FETCH_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < FETCH_RETRY_ATTEMPTS - 1) {
        await sleep(FETCH_RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Network error");
}

export default function CabinetPage() {
  const router = useRouter();
  const { openPaywall } = usePaywall();
  const { user: authUser, loading: authLoading, refresh: refreshAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CabinetResponse | null>(null);
  const [sessions, setSessions] = useState<CabinetSessionRow[]>([]);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<CabinetTab>("profile");
  const [balancePulse, setBalancePulse] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deletingPhotoSpreadId, setDeletingPhotoSpreadId] = useState<string | null>(null);
  const [deletingDiaryId, setDeletingDiaryId] = useState<string | null>(null);
  const [showRitualFlow, setShowRitualFlow] = useState(false);
  const [openRitualId, setOpenRitualId] = useState<string | null>(null);
  const [ritualFlowMaster, setRitualFlowMaster] = useState<RitualMasterKey>("ragnar");
  const [ritualStats, setRitualStats] = useState<CabinetRitualStats | null>(null);
  const [editableProfile, setEditableProfile] = useState<EditableCabinetProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [natalChartEnabled, setNatalChartEnabled] = useState(false);
  const [natalChartRefreshKey, setNatalChartRefreshKey] = useState(0);
  const sessionsOffset = useRef(0);

  const needsOnboarding =
    Boolean(data?.needsOnboarding) && !authUser?.profileUserId && !data?.profile?.birthDate;

  const fetchCabinet = useCallback(async (offset = 0, append = false) => {
    const res = await fetchWithRetry(
      `/api/cabinet?sessionsLimit=20&sessionsOffset=${offset}`,
      { credentials: "include" }
    );
    if (res.status === 401) {
      if (redirectHomeAfterAccountDeletion()) return null;
      router.replace("/auth/user/login?returnTo=" + encodeURIComponent("/cabinet?app=1"));
      return null;
    }
    if (res.status === 403) {
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      if (body?.code === "age_required") {
        await refreshAuth();
        return null;
      }
    }
    if (!res.ok) {
      throw new Error("Не удалось загрузить кабинет");
    }
    const json = (await res.json()) as CabinetResponse;
    if (append) {
      setSessions((prev) => {
        const ids = new Set(prev.map((s) => s.id));
        const merged = [...prev, ...json.sessions.filter((s) => !ids.has(s.id))];
        return sortCabinetSessionsByDate(merged);
      });
    } else {
      setSessions(sortCabinetSessionsByDate(json.sessions));
      setData(json);
    }
    setSessionsHasMore(json.sessionsHasMore);
    sessionsOffset.current = offset + json.sessions.length;
    return json;
  }, [refreshAuth, router]);

  useEffect(() => {
    if (authLoading) return;

    if (!authUser) {
      // After account deletion, go to guest homepage — never the login wall.
      if (redirectHomeAfterAccountDeletion()) return;
      router.replace("/auth/user/login?returnTo=" + encodeURIComponent("/cabinet?app=1"));
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        await fetchCabinet(0, false);
        const statsRes = await fetchWithRetry("/api/ritual/cabinet-stats", {
          credentials: "include",
        });
        if (statsRes.ok && !cancelled) {
          const json = await statsRes.json();
          setRitualStats(json.stats as CabinetRitualStats);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, authUser, fetchCabinet, router]);

  useEffect(() => {
    void fetch("/api/platform/features", { credentials: "include" })
      .then((res) => res.json())
      .then((json: { natalChartEnabled?: boolean }) => {
        setNatalChartEnabled(Boolean(json.natalChartEnabled));
      })
      .catch(() => setNatalChartEnabled(false));
  }, []);

  useEffect(() => {
    if (authLoading || !authUser?.profileUserId) return;
    if (!data?.needsOnboarding) return;
    void fetchCabinet(0, false);
  }, [authLoading, authUser?.profileUserId, data?.needsOnboarding, fetchCabinet]);

  useEffect(() => {
    if (authLoading || !authUser) {
      setProfileLoading(authLoading);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

    (async () => {
      const startedAt = Date.now();
      for (let attempt = 0; attempt < FETCH_RETRY_ATTEMPTS; attempt += 1) {
        try {
          const r = await fetchWithRetry("/api/profile", { credentials: "include" });
          const json = r.ok ? await r.json() : null;
          if (cancelled) return;
          setEditableProfile(json?.profile ?? null);
          setProfileLoading(false);
          return;
        } catch {
          if (attempt >= FETCH_RETRY_ATTEMPTS - 1) {
            if (!cancelled) setProfileLoading(false);
          } else {
            await sleep(FETCH_RETRY_DELAY_MS * (attempt + 1));
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, authUser, data?.needsOnboarding]);

  const handleProfileSaved = useCallback(
    async (saved: EditableCabinetProfile) => {
      setEditableProfile(saved);
      await refreshAuth();
      await fetchCabinet(0, false);
      setNatalChartRefreshKey((value) => value + 1);
    },
    [fetchCabinet, refreshAuth]
  );

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      await fetchCabinet(sessionsOffset.current, true);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRate = async (sessionId: string, rating: 1 | 2 | 3) => {
    const res = await fetch(`/api/cabinet/readings/${sessionId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcomeRating: rating }),
    });
    if (!res.ok) throw new Error("Не удалось сохранить оценку");
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, outcomeRating: rating } : s))
    );
  };

  const handleDeleteSession = async (memoryId: string) => {
    const confirmed = window.confirm(
      "Удалить этот сеанс безвозвратно? Переписка пропадёт из кабинета, списка сеансов мастера и чата."
    );
    if (!confirmed) return;

    setDeletingSessionId(memoryId);
    try {
      const res = await fetch(`/api/cabinet/readings/${encodeURIComponent(memoryId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Не удалось удалить сеанс");

      const payload = (await res.json()) as { characterKey?: string | null };
      const characterKey = payload.characterKey;
      if (characterKey) {
        clearChatCache(characterKey);
        persistSessionIntention(characterKey, null);
        persistIntentionSpreadState(characterKey, null);
      }

      setSessions((prev) => prev.filter((s) => s.id !== memoryId));
      setData((prev) =>
        prev
          ? {
              ...prev,
              sessionsTotal: Math.max(0, prev.sessionsTotal - 1),
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleDeletePhotoSpread = async (historyId: string) => {
    const confirmed = window.confirm(
      "Удалить этот фото-расклад безвозвратно? Карты и расшифровка пропадут из кабинета."
    );
    if (!confirmed) return;

    setDeletingPhotoSpreadId(historyId);
    try {
      const res = await fetch(
        `/api/cabinet/photo-spreads/${encodeURIComponent(historyId)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) throw new Error("Не удалось удалить фото-расклад");

      setData((prev) =>
        prev
          ? {
              ...prev,
              photoSpreads: prev.photoSpreads.filter((s) => s.id !== historyId),
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setDeletingPhotoSpreadId(null);
    }
  };

  const handleSavePhotoSpreadNote = async (historyId: string, notes: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/cabinet/photo-spreads/${encodeURIComponent(historyId)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes }),
        }
      );
      if (!res.ok) throw new Error("Не удалось сохранить заметку");
      const savedNotes = notes.trim().slice(0, 500);

      setData((prev) =>
        prev
          ? {
              ...prev,
              photoSpreads: prev.photoSpreads.map((s) =>
                s.id === historyId
                  ? { ...s, contextData: { ...s.contextData, notes: savedNotes } }
                  : s
              ),
            }
          : prev
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения заметки");
      return false;
    }
  };

  const handleDeleteDiaryEntry = async (entryId: string) => {
    const confirmed = window.confirm(
      "Удалить эту запись дневника безвозвратно?"
    );
    if (!confirmed) return;

    setDeletingDiaryId(entryId);
    try {
      const res = await fetch(`/api/diary/${encodeURIComponent(entryId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Не удалось удалить запись");

      setData((prev) =>
        prev
          ? {
              ...prev,
              diaryPreview: prev.diaryPreview.filter((e) => e.id !== entryId),
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setDeletingDiaryId(null);
    }
  };

  const handlePurgeAll = async () => {
    clearClientActivityState();
    setShowRitualFlow(false);
    setOpenRitualId(null);
    setSessions([]);
    setSessionsHasMore(false);
    sessionsOffset.current = 0;
    setRitualStats(null);
    setData((prev) =>
      prev
        ? {
            ...prev,
            sessionsTotal: 0,
            diaryPreview: [],
            photoSpreads: [],
          }
        : prev
    );
    await fetchCabinet(0, false);
    const statsRes = await fetch("/api/ritual/cabinet-stats", { credentials: "include" });
    if (statsRes.ok) {
      const json = await statsRes.json();
      setRitualStats(json.stats as CabinetRitualStats);
    } else {
      setRitualStats(null);
    }
  };

  const scrollToSection = (tab: CabinetTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const profile = data?.profile;
  const stats = data?.stats;
  const achievements = data?.achievements;
  const diary = data?.diaryPreview ?? [];
  const runes = data?.runes;
  const legacyAccess = data?.legacyAccess;
  const photoSpreads = data?.photoSpreads ?? [];
  const dailyReadings = data?.dailyReadings ?? [];
  const runesEnabled = Boolean(runes?.enabled);
  const ritualAttentionCount =
    (ritualStats?.inProgress ?? 0) + (ritualStats?.pendingReview ?? 0);

  const openRitual = (id: string, characterKey: RitualMasterKey) => {
    setRitualFlowMaster(characterKey);
    setOpenRitualId(id);
    setShowRitualFlow(true);
  };

  const handleTopUp = () => {
    openPaywall({
      currentBalance: profile?.runeBalance ?? runes?.balance ?? 0,
      onClose: async () => {
        await fetchCabinet(0, false);
        setBalancePulse(true);
        setTimeout(() => setBalancePulse(false), 600);
      },
    });
  };

  const renderTabSkeleton = () => {
    switch (activeTab) {
      case "profile":
        return (
          <>
            <CabinetProfileHeaderSkeleton />
            <CabinetStatsGridSkeleton />
            <CabinetAchievementsSkeleton />
          </>
        );
      case "history":
        return <CabinetSessionHistorySkeleton />;
      case "rituals":
        return <div className="h-48 animate-pulse rounded-2xl bg-white/5" />;
      case "diary":
        return <CabinetDiaryPreviewSkeleton />;
      case "memory":
        return <div className="h-64 animate-pulse rounded-2xl bg-white/5" />;
      case "runes":
        return <CabinetRunesPanelSkeleton />;
      default:
        return null;
    }
  };

  const renderTabContent = () => {
    if (!data) return null;

    switch (activeTab) {
      case "profile":
        return (
          <div className="space-y-6">
            {profile && !needsOnboarding ? (
              <CabinetProfileHeader
                profile={profile}
                onTopUp={runesEnabled ? handleTopUp : undefined}
                showRuneTopUp={runesEnabled}
                balancePulse={balancePulse}
              />
            ) : null}
            {authUser?.email && !profileLoading ? (
              <CabinetProfilePanel
                email={authUser.email}
                accountName={authUser.name}
                profile={editableProfile}
                onSaved={(saved) => void handleProfileSaved(saved)}
                enableNatalFields={natalChartEnabled}
              />
            ) : authUser?.email && profileLoading ? (
              <CabinetProfileHeaderSkeleton />
            ) : null}
            {natalChartEnabled ? <CabinetNatalChart key={natalChartRefreshKey} /> : null}
            {stats ? <CabinetStatsGrid stats={stats} /> : null}
            {achievements ? (
              <CabinetAchievementsRow
                earned={achievements.earned}
                locked={achievements.locked}
              />
            ) : null}
            <CabinetSupportLink />
            <CabinetTelegramLink />
            <CabinetJointReadings variant="compact" />
            <CabinetDailyNotifications />
            <CabinetAppVersion />
            <CabinetDangerZone onPurged={handlePurgeAll} />
            <CabinetDeleteAccount />
          </div>
        );

      case "history":
        return (
          <div className="space-y-8">
            <CabinetTabHero
              kicker="Архив"
              title="История сеансов"
              subtitle="Все расклады, карты и расшифровки — в одном месте."
            />
            <CabinetJointReadings />
            <CabinetSessionHistory
              sessions={sessions}
              hasMore={sessionsHasMore}
              loadingMore={loadingMore}
              onLoadMore={handleLoadMore}
              onRate={handleRate}
              onDelete={handleDeleteSession}
              deletingId={deletingSessionId}
              hideTitle
            />
            <CabinetPhotoSpreads
              spreads={photoSpreads}
              onDelete={(id) => void handleDeletePhotoSpread(id)}
              deletingId={deletingPhotoSpreadId}
              onSaveNote={handleSavePhotoSpreadNote}
            />
            <CabinetDailySpreads readings={dailyReadings} />
          </div>
        );

      case "rituals":
        return (
          <div className="space-y-6">
            <CabinetTabHero
              kicker="Ритуалы"
              title="Обряды и практики"
              subtitle="Лунные ритуалы, намерения и отслеживание результата."
            />
            <CabinetRitualReviewBanner onReview={openRitual} />
            <CabinetRitualsPanel
              onOpenRitual={openRitual}
              onNewRitual={(master) => {
                setRitualFlowMaster(master ?? "ragnar");
                setOpenRitualId(null);
                setShowRitualFlow(true);
              }}
              onRitualDeleted={(id) => {
                if (openRitualId === id) {
                  setShowRitualFlow(false);
                  setOpenRitualId(null);
                }
              }}
              onStatsLoaded={setRitualStats}
            />
          </div>
        );

      case "diary":
        return (
          <div className="space-y-6">
            <CabinetTabHero
              kicker="Личное"
              title="Дневник судьбы"
              subtitle="Записи после сеансов — для размышлений и возвращения к инсайтам."
            />
            <CabinetDiaryPreview
              entries={diary}
              onDelete={(id) => void handleDeleteDiaryEntry(id)}
              deletingId={deletingDiaryId}
              hideTitle
            />
          </div>
        );

      case "memory":
        return (
          <div className="space-y-6">
            <CabinetTabHero
              kicker="Контекст"
              title="Память о вас"
              subtitle="Добавляйте важное о себе — мастер учтёт это в будущих сеансах, если тема совпадёт."
            />
            <CabinetMemoryFacts hideTitle />
          </div>
        );

      case "runes":
        return (
          <div className="space-y-6">
            <CabinetTabHero
              kicker="Баланс"
              title="Руны и доступ"
              subtitle="Пополнение, история операций и статус подписки."
            />
            {needsOnboarding ? (
              <div className="rounded-xl border border-aura-gold/25 bg-aura-gold/10 p-5 text-sm text-aura-champagne">
                <p className="font-medium text-white">Баланс появится после профиля</p>
                <p className="mt-2 text-white/70">
                  Укажите дату рождения — мы создадим профиль, начислим стартовые руны и откроем
                  историю операций.
                </p>
                <button
                  type="button"
                  className="btn-luxe btn-luxe--sm btn-luxe--gold mt-4"
                  onClick={() => navigateToBirthProfileOnboarding()}
                >
                  Указать дату рождения
                </button>
              </div>
            ) : runesEnabled && runes ? (
              <CabinetRunesPanel
                balance={runes.balance}
                enabled={runes.enabled}
                transactions={runes.transactions}
                onTopUp={handleTopUp}
              />
            ) : legacyAccess ? (
              <CabinetLegacyAccessPanel
                access={legacyAccess}
                onOpenPaywall={() => openPaywall()}
              />
            ) : (
              <section className="cabinet-empty-state text-sm text-white/60">
                Система рун временно недоступна. Попробуйте обновить страницу позже.
              </section>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="cabinet-page min-h-screen bg-[radial-gradient(ellipse_at_top,_rgba(88,28,135,0.18)_0%,_transparent_55%),#000] pb-24 pt-[var(--app-header-h,3.25rem)] text-white">
      <div className="border-b border-white/10 bg-black/40 py-2.5 text-center">
        <span className="text-sm font-semibold text-white/90">Личный кабинет</span>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {needsOnboarding ? (
          <div className="mb-6 rounded-xl border border-aura-gold/25 bg-aura-gold/10 p-4 text-sm text-aura-champagne">
            <p className="font-medium text-white">Укажите дату рождения</p>
            <p className="mt-1 text-white/70">
              Аккаунт уже создан. Остался один шаг — дата рождения для персонализации раскладов.
              После этого откроется кабинет и начислятся стартовые руны.
            </p>
            <button
              type="button"
              className="btn-luxe btn-luxe--sm btn-luxe--gold mt-4"
              onClick={() => navigateToBirthProfileOnboarding()}
            >
              Указать дату рождения
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-6">{renderTabSkeleton()}</div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} {...TAB_MOTION} className="cabinet-tab-pane min-h-[50vh]">
              {renderTabContent()}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <CabinetBottomNav
        active={activeTab}
        onTab={scrollToSection}
        showRituals
        ritualPendingReview={ritualStats?.pendingReview ?? 0}
        ritualAttentionCount={ritualAttentionCount}
      />

      <RitualFlow
        isOpen={showRitualFlow}
        characterKey={ritualFlowMaster}
        userName={profile?.name ?? "друг"}
        userZodiac={profile?.zodiac ?? ""}
        balance={profile?.runeBalance ?? runes?.balance}
        isUnlimited={Boolean(legacyAccess?.isUnlimited)}
        initialRitualId={openRitualId}
        onClose={() => {
          setShowRitualFlow(false);
          setOpenRitualId(null);
        }}
        onBalanceChange={() => void fetchCabinet(0, false)}
      />
    </div>
  );
}
