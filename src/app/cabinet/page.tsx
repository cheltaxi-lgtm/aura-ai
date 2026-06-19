"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  MessageCircle,
  CreditCard,
  Crown,
  LogOut,
  Layers,
  Brain,
  ChevronDown,
  ChevronUp,
  Sparkle,
} from "lucide-react";
import { CHARACTERS } from "@/lib/characters";
import { tarotCardsKey } from "@/lib/tarot";
import CabinetProfilePanel, { type CabinetProfile } from "@/components/CabinetProfilePanel";
import { SkeletonCard } from "@/components/Skeleton";
import ReadingActions from "@/components/ReadingActions";
import MessageAudioPlayer from "@/components/MessageAudioPlayer";
import SceneImage from "@/components/SceneImage";
import TarotCardsRow from "@/components/TarotCardsRow";
import MySpreadsGallery from "@/components/MySpreadsGallery";
import { MasterAvatarInline } from "@/components/MasterAvatar";
import type { RedrawSpread } from "@/lib/photo-spread-redraw";
import type { DeckSystem } from "@/lib/decks/types";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { requestSceneImage, tarotCardNames } from "@/lib/scene-images-client";
import { resolveSceneArtDisplayUrl } from "@/lib/scene-art-url";
import {
  getActiveDestinyDraw,
  resolveDestinyInterpretation,
} from "@/lib/destiny-card";
import type { CharacterVisualKey } from "@/lib/image-prompts";

interface SceneArt {
  tarot_atmosphere?: string;
  destiny_card?: string;
  final_report?: string;
  zodiac_avatar?: string;
}

interface ReadingEntry {
  id: string;
  characterName: string;
  contextData: {
    type?: string;
    reading?: string;
    analysis?: string;
    detectedCards?: string[];
    deckType?: string;
    spreadType?: string;
    tarotCards?: { name: string; meaning?: string; reversed?: boolean }[];
    deckSystem?: DeckSystem;
    redrawSpread?: RedrawSpread;
    question?: string;
    teaser?: string;
    sceneArt?: SceneArt;
    interpretation?: { text: string; masterId?: string; savedAt?: string };
    onboarding?: { name?: string; zodiac?: string };
  };
  isPaid: boolean;
  createdAt: string;
}

interface CabinetData {
  profile: { name: string; email: string };
  astroProfile: CabinetProfile | null;
  profileUserId: string | null;
  readings: ReadingEntry[];
  history: { character_id: string; role: string; content: string; created_at: string }[];
  payments: { amount: string; payment_type: string; status: string; created_at: string }[];
  subscription: { paid_until: string | null; has_single_unlock: boolean; is_unlimited?: boolean } | null;
  memory?: {
    readingCount: number;
    chatTurnCount: number;
    hasMainQuestion: boolean;
  } | null;
}

interface MasterInfo {
  id: string;
  name: string;
  emoji: string;
  title?: string;
}

function buildMasterMap(masters: MasterInfo[]): Map<string, MasterInfo> {
  return new Map(masters.map((m) => [m.id, m]));
}

function masterLabel(id: string, masters?: Map<string, MasterInfo>) {
  if (id === "triplet") return "Расклад 3 карт";
  return masters?.get(id)?.name ?? CHARACTERS.find((c) => c.id === id)?.name ?? id;
}

function readingPreview(entry: ReadingEntry): string {
  if (entry.contextData.type === "photo_reading") {
    return entry.contextData.analysis ?? "Фото-расклад";
  }
  return (
    entry.contextData.reading ??
    entry.contextData.teaser ??
    (entry.contextData.tarotCards?.length
      ? `Карты: ${entry.contextData.tarotCards.map((c) => c.name).join(" · ")}`
      : "Расклад сохранён")
  );
}

function readingTitle(entry: ReadingEntry, masters?: Map<string, MasterInfo>) {
  if (entry.contextData.type === "photo_reading") {
    const deck = entry.contextData.deckType?.split("·")[0]?.trim();
    return deck
      ? `${masterLabel(entry.characterName, masters)} · ${deck}`
      : `${masterLabel(entry.characterName, masters)} · фото-расклад`;
  }
  if (entry.characterName === "triplet") return "Расклад 3 карт";
  if (entry.contextData.type === "reading") {
    return `${masterLabel(entry.characterName, masters)} · расшифровка`;
  }
  return masterLabel(entry.characterName, masters);
}

function mastersForTriplet(
  readings: ReadingEntry[],
  cards: { name: string }[]
): ReadingEntry[] {
  const key = tarotCardsKey(cards);
  const seen = new Set<string>();
  const result: ReadingEntry[] = [];

  for (const r of readings) {
    if (r.contextData.type !== "reading" || r.characterName === "triplet") continue;
    if (tarotCardsKey(r.contextData.tarotCards) !== key) continue;
    if (seen.has(r.characterName)) continue;
    seen.add(r.characterName);
    result.push(r);
  }

  return result;
}

function latestMasterForTriplet(
  readings: ReadingEntry[],
  cards: { name: string }[]
): string | null {
  const key = tarotCardsKey(cards);
  let latest: ReadingEntry | null = null;

  for (const r of readings) {
    if (r.contextData.type !== "reading" || r.characterName === "triplet") continue;
    if (tarotCardsKey(r.contextData.tarotCards) !== key) continue;
    if (!latest || new Date(r.createdAt) > new Date(latest.createdAt)) {
      latest = r;
    }
  }

  return latest?.characterName ?? null;
}

function dedupeHistoryReadings(readings: ReadingEntry[]): ReadingEntry[] {
  const seen = new Set<string>();

  return readings.filter((r) => {
    if (r.contextData.type !== "reading") return true;

    const key = `${r.characterName}|${tarotCardsKey(r.contextData.tarotCards)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectCardDraws(readings: ReadingEntry[]): ReadingEntry[] {
  const active = getActiveDestinyDraw(readings);
  return active ? [active] : [];
}

function SceneArtRow({ sceneArt }: { sceneArt?: SceneArt }) {
  if (!sceneArt) return null;

  const items = [
    { key: "destiny_card", label: "Карта судьбы", url: sceneArt.destiny_card },
    { key: "final_report", label: "Отчёт судьбы", url: sceneArt.final_report },
    { key: "tarot_atmosphere", label: "Энергия расклада", url: sceneArt.tarot_atmosphere },
    { key: "zodiac_avatar", label: "Знак зодиака", url: sceneArt.zodiac_avatar },
  ].filter((item) => Boolean(item.url));

  if (items.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap justify-center gap-4">
      {items.map((item) => (
        <SceneImage
          key={item.key}
          imageUrl={item.url ?? null}
          loading={false}
          label={item.label}
          variant={
            item.key === "destiny_card" || item.key === "final_report" || item.key === "zodiac_avatar"
              ? "card"
              : "wide"
          }
          expandable={
            item.key === "destiny_card" || item.key === "final_report" || item.key === "zodiac_avatar"
          }
          aspectClass={item.key === "tarot_atmosphere" ? "aspect-video w-full max-w-md" : undefined}
          className={item.key === "tarot_atmosphere" ? "w-full max-w-md" : "w-full max-w-[260px]"}
        />
      ))}
    </div>
  );
}

function IssuedDestinyCard({
  sceneArt,
  loading = false,
}: {
  sceneArt?: SceneArt;
  loading?: boolean;
}) {
  const url = resolveSceneArtDisplayUrl(sceneArt?.destiny_card);

  if (loading) {
    return (
      <div className="mb-4 rounded-xl border border-white/10 bg-black/20 px-4 py-8 text-center">
        <p className="text-sm text-gray-400">Генерируем карту судьбы…</p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="mb-4 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-center">
        <p className="text-sm text-gray-400">Карта судьбы появится после расшифровки у мастера</p>
        <p className="mt-1 text-xs text-gray-600">Выберите наставника на главной и получите персональную карту</p>
      </div>
    );
  }

  return (
    <SceneImage
      imageUrl={url}
      loading={false}
      label="Карта судьбы"
      variant="card"
      expandable
      className="mx-auto mb-4 max-w-[280px]"
    />
  );
}

function readingSharePayload(entry: ReadingEntry, masters?: Map<string, MasterInfo>) {
  const date = new Date(entry.createdAt).toLocaleString("ru");
  const text = readingPreview(entry);
  return {
    title: readingTitle(entry, masters),
    masterName:
      entry.characterName !== "triplet" ? masterLabel(entry.characterName, masters) : undefined,
    date,
    cards: entry.contextData.tarotCards ?? entry.contextData.redrawSpread?.cards.map((c) => ({
      name: c.reversed ? `${c.name} (перев.)` : c.name,
      meaning: c.shortMeaning,
    })),
    detectedCards: entry.contextData.detectedCards,
    deckType: entry.contextData.deckType,
    spreadType: entry.contextData.spreadType,
    text,
  };
}

export default function UserCabinetPage() {
  const router = useRouter();
  const [data, setData] = useState<CabinetData | null>(null);
  const [masters, setMasters] = useState<MasterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedReadingId, setExpandedReadingId] = useState<string | null>(null);
  const [destinyBackfillIds, setDestinyBackfillIds] = useState<Set<string>>(new Set());
  const destinyBackfillStartedRef = useRef<Set<string>>(new Set());

  const loadCabinet = () =>
    fetch("/api/cabinet")
      .then(async (r) => {
        if (r.status === 401) {
          router.push("/auth/user/login?returnTo=/cabinet");
          return null;
        }
        return r.json();
      })
      .then((d) => d && setData(d));

  useEffect(() => {
    fetch("/api/masters")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (payload?.masters?.length) {
          setMasters(
            payload.masters.map((m: MasterInfo) => ({
              id: m.id,
              name: m.name,
              emoji: m.emoji,
              title: m.title,
            }))
          );
        }
      })
      .catch(() => undefined);

    loadCabinet().finally(() => setLoading(false));
  }, [router]);

  const handleReadingDeleted = (entryId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const nextReadings = prev.readings.filter((r) => r.id !== entryId);
      const deleted = prev.readings.find((r) => r.id === entryId);
      const memory = prev.memory
        ? {
            ...prev.memory,
            readingCount: Math.max(
              0,
              prev.memory.readingCount -
                (deleted &&
                (deleted.characterName === "triplet" ||
                  deleted.contextData.type === "reading" ||
                  deleted.contextData.type === "photo_reading" ||
                  deleted.contextData.type === "triplet")
                  ? 1
                  : 0)
            ),
          }
        : prev.memory;
      return {
        ...prev,
        readings: nextReadings,
        memory,
      };
    });
    if (expandedReadingId === entryId) setExpandedReadingId(null);
  };

  useEffect(() => {
    if (!data) return;

    const draws = collectCardDraws(data.readings);

    for (const draw of draws) {
      const mergedArt = draw.contextData.sceneArt;
      if (mergedArt?.destiny_card) continue;

      const cards = draw.contextData.tarotCards ?? [];
      const cardNames = tarotCardNames(cards);
      const interpretedBy = mastersForTriplet(data.readings, cards);
      if (!cardNames || interpretedBy.length === 0) continue;
      if (destinyBackfillStartedRef.current.has(draw.id)) continue;

      destinyBackfillStartedRef.current.add(draw.id);
      setDestinyBackfillIds((prev) => new Set(prev).add(draw.id));

      const masterId = interpretedBy[0].characterName;
      const userName =
        draw.contextData.onboarding?.name ?? data.astroProfile?.name ?? data.profile.name;
      const zodiac = draw.contextData.onboarding?.zodiac ?? data.astroProfile?.zodiac ?? "";

      void requestSceneImage({
        scene: "destiny_card",
        characterKey: masterId as CharacterVisualKey,
        userName,
        zodiac,
        cards: cardNames,
      }).then((url) => {
        setDestinyBackfillIds((prev) => {
          const next = new Set(prev);
          next.delete(draw.id);
          return next;
        });
        if (url) loadCabinet();
      });
    }
  }, [data]);

  const logout = async () => {
    await fetch("/api/auth/me", { method: "DELETE" });
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasSub =
    data.subscription?.is_unlimited ||
    (data.subscription?.paid_until && new Date(data.subscription.paid_until) > new Date());

  const displayName = data.astroProfile?.name ?? data.profile.name;
  const cardDraws = collectCardDraws(data.readings);
  const masterMap = buildMasterMap(masters);
  const historyReadings = dedupeHistoryReadings(data.readings);
  const mySpreads = data.readings.filter((r) => r.contextData.type === "photo_reading");

  const openSpreadReading = (id: string) => {
    setExpandedReadingId(id);
    document.getElementById(`reading-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-500 hover:text-aura-neon">
            <Sparkles className="h-5 w-5" /> Aura
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-white"
          >
            <LogOut className="h-4 w-4" /> Выйти
          </button>
        </div>

        <h1 className="font-display mb-1 text-3xl font-bold text-white">Привет, {displayName}</h1>
        <p className="mb-10 text-sm text-gray-500">Личный кабинет · {data.profile.email}</p>

        <CabinetProfilePanel
          email={data.profile.email}
          accountName={data.profile.name}
          profile={data.astroProfile}
          onSaved={(profile) => {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    astroProfile: profile,
                    profile: { ...prev.profile, name: profile.name },
                  }
                : prev
            );
          }}
        />

        {data.memory &&
          (data.memory.readingCount > 0 ||
            data.memory.chatTurnCount > 0 ||
            data.memory.hasMainQuestion) && (
          <section className="mb-8">
            <h2 className="font-display mb-4 flex items-center gap-2 text-xl text-gray-300">
              <Brain className="h-5 w-5" /> Глобальная память
            </h2>
            <div className="glass-panel p-5">
              <p className="mb-4 text-sm leading-relaxed text-gray-400">
                Aura помнит ваши сохранённые расклады и переписку — мастера используют это в новых
                сессиях, пока вы не удалите запись из истории.
              </p>
              <p className="text-xs text-gray-500">
                Раскладов: {data.memory.readingCount}
                {" · "}
                Сообщений в чатах: {data.memory.chatTurnCount}
                {data.memory.hasMainQuestion && (
                  <>
                    {" · "}
                    Главный вопрос сохранён
                  </>
                )}
              </p>
            </div>
          </section>
        )}

        <section className="mb-8">
          <h2 className="font-display mb-4 flex items-center gap-2 text-xl text-gray-300">
            <Sparkle className="h-5 w-5" /> Выданные карты
          </h2>
          {cardDraws.length === 0 ? (
            <p className="text-sm text-gray-600">
              Раскладов пока нет —{" "}
              <Link href="/" className="text-aura-neon hover:underline">
                получите карты на главной
              </Link>
            </p>
          ) : (
            <div className="space-y-4">
              {cardDraws.map((entry) => {
                const cards = entry.contextData.tarotCards ?? [];
                const deckSystem = entry.contextData.deckSystem ?? DEFAULT_DECK_SYSTEM;
                const zodiac =
                  entry.contextData.onboarding?.zodiac ?? data.astroProfile?.zodiac ?? "";
                const interpretedBy = mastersForTriplet(data.readings, cards);
                const sceneArt = entry.contextData.sceneArt;
                const interpretation = resolveDestinyInterpretation(entry, data.readings);
                const continueMasterId = latestMasterForTriplet(data.readings, cards);
                const continueChatHref = continueMasterId
                  ? `/?master=${encodeURIComponent(continueMasterId)}`
                  : "/#наставники";

                return (
                  <article key={entry.id} className="glass-panel p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <span className="font-medium text-aura-gold">
                        Карта судьбы{zodiac ? ` · ${zodiac}` : ""}
                      </span>
                      <span>{new Date(entry.createdAt).toLocaleString("ru")}</span>
                    </div>

                    <IssuedDestinyCard
                      sceneArt={sceneArt}
                      loading={destinyBackfillIds.has(entry.id)}
                    />

                    {cards.length >= 3 && (
                      <div className="mb-4 rounded-2xl border border-aura-gold/15 bg-black/20 p-4">
                        <TarotCardsRow cards={cards.slice(0, 3)} system={deckSystem} size="md" enableDetail />
                      </div>
                    )}

                    {interpretation?.text && (
                      <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-4">
                        <p className="mb-2 text-xs uppercase tracking-widest text-gray-500">
                          Расшифровка
                          {interpretation.masterId
                            ? ` · ${masterLabel(interpretation.masterId, masterMap)}`
                            : ""}
                        </p>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                          {interpretation.text}
                        </p>
                      </div>
                    )}

                    {sceneArt?.final_report && (
                      <SceneImage
                        imageUrl={sceneArt.final_report}
                        loading={false}
                        label="Отчёт судьбы"
                        variant="card"
                        expandable
                        className="mx-auto mb-4 max-w-[280px]"
                      />
                    )}

                    {interpretedBy.length > 0 && (
                      <div className="mb-4">
                        <p className="mb-2 text-xs text-gray-500">Обсуждали с мастерами:</p>
                        <div className="flex flex-wrap gap-2">
                          {interpretedBy.map((reading) => (
                            <Link
                              key={reading.id}
                              href={`/?master=${encodeURIComponent(reading.characterName)}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-aura-purple/30 bg-aura-purple/10 px-3 py-1 text-xs text-aura-neon transition-colors hover:border-aura-purple/50"
                            >
                              <MasterAvatarInline masterId={reading.characterName} size="xs" />
                              {masterLabel(reading.characterName, masterMap)}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    <ReadingActions
                      entryId={entry.id}
                      continueChatHref={continueChatHref}
                      share={{
                        title: "Карта судьбы",
                        date: new Date(entry.createdAt).toLocaleString("ru"),
                        cards,
                        text: interpretation?.text ?? "Карта судьбы",
                      }}
                      onDeleted={() => handleReadingDeleted(entry.id)}
                    />
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section id="мои-расклады" className="mb-8 scroll-mt-24">
          <h2 className="font-display mb-4 flex items-center gap-2 text-xl text-gray-300">
            <Layers className="h-5 w-5" /> Мои расклады
          </h2>
          <MySpreadsGallery
            entries={mySpreads}
            masterLabel={(id) => masterLabel(id, masterMap)}
            onOpen={openSpreadReading}
          />
        </section>

        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <div className="glass-panel flex items-center gap-4 p-5">
            <Crown className="h-8 w-8 text-aura-gold" />
            <div>
              <p className="text-sm text-gray-400">Подписка</p>
              <p className="font-medium text-white">
                {data.subscription?.is_unlimited
                  ? "Безлимит (админ)"
                  : hasSub
                    ? `Активна до ${new Date(data.subscription!.paid_until!).toLocaleDateString("ru")}`
                    : data.subscription?.has_single_unlock
                      ? "Разовый разбор куплен"
                      : "Не активна"}
              </p>
            </div>
          </div>
          <Link href="/#наставники" className="glass-panel flex items-center gap-4 p-5 hover:border-aura-purple/40">
            <MessageCircle className="h-8 w-8 text-aura-purple" />
            <div>
              <p className="text-sm text-gray-400">Новый сеанс</p>
              <p className="font-medium text-aura-neon">К наставникам →</p>
            </div>
          </Link>
        </div>

        <section className="mb-8">
          <h2 className="font-display mb-4 flex items-center gap-2 text-xl text-gray-300">
            <Layers className="h-5 w-5" /> История раскладов
          </h2>
          {historyReadings.length === 0 ? (
            <p className="text-sm text-gray-600">
              Раскладов пока нет —{" "}
              <Link href="/" className="text-aura-neon hover:underline">
                получите первый на главной
              </Link>
            </p>
          ) : (
            <div className="space-y-4">
              {historyReadings.map((entry) => {
                const cards = entry.contextData.tarotCards ?? [];
                const deckSystem = entry.contextData.deckSystem ?? DEFAULT_DECK_SYSTEM;
                const fullText = readingPreview(entry);
                const expanded = expandedReadingId === entry.id;
                const isTriplet = entry.characterName === "triplet";
                const isMasterReading =
                  entry.contextData.type === "reading" && entry.characterName !== "triplet";

                return (
                  <article key={entry.id} id={`reading-${entry.id}`} className="glass-panel p-5">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-2 font-medium text-aura-gold">
                        {isMasterReading && (
                          <MasterAvatarInline masterId={entry.characterName} size="xs" />
                        )}
                        {readingTitle(entry, masterMap)}
                      </span>
                      <span>{new Date(entry.createdAt).toLocaleString("ru")}</span>
                    </div>

                    {isMasterReading && (
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-gray-400">
                          Мастер: {masterLabel(entry.characterName, masterMap)}
                        </span>
                      </div>
                    )}

                    {entry.contextData.type === "photo_reading" && entry.contextData.spreadType && (
                      <p className="mb-2 text-xs text-gray-500">
                        <span className="text-aura-emerald">Расклад:</span> {entry.contextData.spreadType}
                      </p>
                    )}

                    {(cards.length > 0 || entry.contextData.redrawSpread?.cards.length) &&
                      (isTriplet || isMasterReading || entry.contextData.type === "photo_reading") && (
                      <div className="mb-4 rounded-2xl border border-aura-gold/15 bg-black/20 p-4">
                        <TarotCardsRow
                          cards={
                            cards.length > 0
                              ? cards
                              : (entry.contextData.redrawSpread?.cards.map((c) => ({
                                  name: c.reversed ? `${c.name} (перев.)` : c.name,
                                  meaning: c.shortMeaning,
                                })) ?? [])
                          }
                          system={deckSystem}
                          masterId={entry.characterName !== "triplet" ? entry.characterName : undefined}
                          size="md"
                          aligned={entry.contextData.type === "photo_reading"}
                          enableDetail
                        />
                      </div>
                    )}

                    {!isTriplet && <SceneArtRow sceneArt={entry.contextData.sceneArt} />}

                    <p
                      className={`text-sm leading-relaxed text-gray-300 ${expanded ? "whitespace-pre-wrap" : "line-clamp-4"}`}
                    >
                      {fullText}
                    </p>

                    {fullText.length > 280 && (
                      <button
                        type="button"
                        onClick={() => setExpandedReadingId(expanded ? null : entry.id)}
                        className="mt-3 flex items-center gap-1 text-xs text-aura-neon hover:underline"
                      >
                        {expanded ? (
                          <>
                            <ChevronUp className="h-3.5 w-3.5" /> Свернуть
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3.5 w-3.5" /> Читать полностью
                          </>
                        )}
                      </button>
                    )}

                    {(entry.contextData.type === "photo_reading" || entry.contextData.type === "reading") &&
                      entry.characterName !== "triplet" && (
                        <MessageAudioPlayer text={fullText} characterId={entry.characterName} />
                      )}

                    <ReadingActions
                      entryId={entry.id}
                      continueChatHref={
                        entry.characterName !== "triplet"
                          ? `/?master=${encodeURIComponent(entry.characterName)}`
                          : undefined
                      }
                      share={readingSharePayload(entry, masterMap)}
                      onDeleted={() => handleReadingDeleted(entry.id)}
                    />
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="mb-8">
          <h2 className="font-display mb-4 flex items-center gap-2 text-xl text-gray-300">
            <MessageCircle className="h-5 w-5" /> Переписка с мастерами
          </h2>
          {data.history.length === 0 ? (
            <p className="text-sm text-gray-600">Сообщений в чате пока нет</p>
          ) : (
            <div className="space-y-3">
              {data.history.slice(0, 20).map((msg, i) => (
                <div
                  key={i}
                  className={`glass-panel p-4 text-sm ${msg.role === "user" ? "border-l-2 border-aura-purple" : ""}`}
                >
                  <div className="mb-1 flex justify-between text-xs text-gray-600">
                    <span className="inline-flex items-center gap-2">
                      <MasterAvatarInline masterId={msg.character_id} size="xs" />
                      {masterLabel(msg.character_id, masterMap)} · {msg.role === "user" ? "Вы" : "Мастер"}
                    </span>
                    <span>{new Date(msg.created_at).toLocaleString("ru")}</span>
                  </div>
                  <p className="line-clamp-3 text-gray-300">{msg.content}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-display mb-4 flex items-center gap-2 text-xl text-gray-300">
            <CreditCard className="h-5 w-5" /> Платежи
          </h2>
          {data.payments.length === 0 ? (
            <p className="text-sm text-gray-600">Платежей пока нет</p>
          ) : (
            <div className="space-y-2">
              {data.payments.map((p, i) => (
                <div key={i} className="glass-panel flex justify-between p-4 text-sm">
                  <span className="text-gray-400">
                    {p.payment_type === "subscription" ? "Подписка" : "Разбор"} · {p.status}
                  </span>
                  <span className="text-aura-gold">{p.amount} ₽</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
