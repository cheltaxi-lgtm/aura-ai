"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Mic, MicOff } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import { useNativeInputSync } from "@/lib/use-native-input-sync";
import { resolveJointReadingToken } from "@/lib/joint-reading-storage";
import {
  SESSION_TOPICS,
  topicLabel,
  type SessionTopicId,
} from "@/lib/session-topics";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import type { DeckSystem } from "@/lib/decks/types";
import { resolveMasterDeckSystem, resolveSpreadDeckSystem } from "@/lib/decks";
import MasterAvatar from "@/components/MasterAvatar";
import SpreadLayout from "@/components/SpreadLayout";
import SpreadFlipRow from "@/components/SpreadFlipRow";
import MagicalSpreadTable from "@/components/MagicalSpreadTable";
import SpreadPicker from "@/components/SpreadPicker";
import NumerologCalculationPicker, {
  numerologCalculationReady,
  numerologCalculationSummary,
} from "@/components/numerolog/NumerologCalculationPicker";
import NumerologSessionReveal from "@/components/numerolog/NumerologSessionReveal";
import type { NumerologSessionResult } from "@/lib/numerology/session-result";
import {
  DEFAULT_NUMEROLOG_SESSION_TOOL,
  getNumerologTool,
  numerologToolPositions,
  appendPartnerContextToQuestion,
  partnerInfoReady,
  type NumerologToolId,
  type NumerologToolParams,
} from "@/lib/numerology/tools";
import {
  DEFAULT_SPREAD_ID,
  getSpread,
  isDailyOnlySpread,
  listSpreads,
  spreadMatchesSystem,
  spreadMatchesTopic,
  type SpreadId,
} from "@/lib/spreads";
import RuneCost from "@/components/RuneCost";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { RITUAL_MASTERS } from "@/lib/ritual-config";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import { PRICING } from "@/lib/config/pricing";
import { formatSpreadUnitRu } from "@/lib/spread-ritual-copy";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import DeckShuffleAnimation from "@/components/DeckShuffleAnimation";

/** Minimum time for a full riffle shuffle ritual (split → riffle → square). */
const DECK_SHUFFLE_MIN_MS = 3600;

export interface SessionStartParams {
  characterKey: string;
  intention: SessionTopicId | null;
  spreadType: "daily" | "new";
  spreadId?: SpreadId;
  cards: string[];
  /** Свой вопрос клиента — когда intention === "custom". */
  customQuestion?: string | null;
  /** Cards already flipped in the flow modal — chat should not ask to flip again. */
  cardsRevealed?: boolean;
  previewCards?: { name: string; meaning?: string }[];
  deckSystem?: DeckSystem;
  numerologToolId?: NumerologToolId;
  numerologToolParams?: NumerologToolParams;
}

interface MasterSessionFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (params: SessionStartParams) => void;
  onStartRitual?: () => void;
  preselectedMaster?: string;
  dailyCards?: string[];
  masters?: ShowcaseMaster[];
  /** Только новый расклад по теме — без «карт дня». */
  newSpreadOnly?: boolean;
  /** Deep link: preselect spread scheme */
  initialSpreadId?: SpreadId;
  /** Preselect topic (skips topic step, opens scheme picker). */
  initialTopic?: SessionTopicId | null;
  /** Pre-filled custom question when initialTopic is custom. */
  initialCustomQuestion?: string | null;
  /** Open directly on the card draw step when master/topic/spread are known. */
  autoDrawOnOpen?: boolean;
  /** Collect partner name and birth date before the spread (compatibility intents). */
  requiresPartnerInfo?: boolean;
  /** Preselect numerolog calculation (SEO / deep links). */
  initialNumerologTool?: NumerologToolId;
  /** Birth date from profile — required for several numerolog calculations. */
  userBirthDate?: string;
  /** Full name from profile — required for chaldean/karma. */
  userFullName?: string;
  /** Pre-fill partner fields for compatibility / joint flows. */
  initialPartnerInfo?: { partnerName?: string; partnerDate?: string };
  /** SEO / joint-reading intent slug — used for ritual copy instead of «Свой вопрос». */
  spreadIntentSlug?: string | null;
}

type Step = "topic" | "master" | "cards" | "scheme" | "calculation" | "ritual" | "reveal" | "pick" | "flip" | "partner";

function resolveSessionSpreadId(id?: SpreadId | null): SpreadId {
  if (!id || isDailyOnlySpread(id)) return DEFAULT_SPREAD_ID;
  return id;
}

function hasPresetSpread(id?: SpreadId | null): boolean {
  return Boolean(id && !isDailyOnlySpread(id));
}

function emptyFlipped(count: number): boolean[] {
  return Array.from({ length: count }, () => false);
}

/** Steps the user will actually visit in this open — drives progress dots. */
function buildActiveSteps(ctx: {
  numerologFlow: boolean;
  requiresPartnerInfo: boolean;
  topicLocked: boolean;
  masterLocked: boolean;
  showCardsChoice: boolean;
  presetSpreadLocked: boolean;
}): Step[] {
  if (ctx.numerologFlow) {
    const steps: Step[] = [];
    if (!ctx.topicLocked) steps.push("topic");
    if (!ctx.masterLocked) steps.push("master");
    steps.push("calculation", "ritual", "reveal");
    return steps;
  }
  const steps: Step[] = [];
  if (ctx.requiresPartnerInfo) steps.push("partner");
  if (!ctx.topicLocked) steps.push("topic");
  if (!ctx.masterLocked) steps.push("master");
  if (ctx.showCardsChoice) steps.push("cards");
  if (!ctx.presetSpreadLocked) steps.push("scheme");
  steps.push("ritual", "pick", "flip");
  return steps;
}

function activeStepIndex(step: Step, active: Step[]): number {
  const idx = active.indexOf(step);
  if (idx >= 0) return idx;
  // Collapsed aliases when a screen was skipped mid-flight
  if (step === "reveal") {
    const r = active.indexOf("ritual");
    return r >= 0 ? r : 0;
  }
  if (step === "partner") {
    const t = active.indexOf("topic");
    return t >= 0 ? t : 0;
  }
  return Math.max(0, active.length - 1);
}

export default function MasterSessionFlow({
  isOpen,
  onClose,
  onStart,
  onStartRitual,
  preselectedMaster,
  dailyCards = [],
  masters = [],
  newSpreadOnly = false,
  initialSpreadId,
  initialTopic,
  initialCustomQuestion,
  autoDrawOnOpen = false,
  requiresPartnerInfo = false,
  initialNumerologTool,
  userBirthDate,
  userFullName,
  initialPartnerInfo,
  spreadIntentSlug,
}: MasterSessionFlowProps) {
  const [step, setStep] = useState<Step>("topic");
  const [topic, setTopic] = useState<SessionTopicId | null>(null);
  const [master, setMaster] = useState(preselectedMaster ?? "");
  const [cardType, setCardType] = useState<"daily" | "new" | null>(null);
  const [newCards, setNewCards] = useState<{ name: string; meaning?: string }[]>([]);
  const [deckSystem, setDeckSystem] = useState<DeckSystem>("tarot-veronika");
  const [selectedSpreadId, setSelectedSpreadId] = useState<SpreadId>(
    resolveSessionSpreadId(initialSpreadId)
  );
  const [flipped, setFlipped] = useState<boolean[]>(() => emptyFlipped(3));
  const [drawLoading, setDrawLoading] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [sessionSeed, setSessionSeed] = useState("");
  const [ritualTitle, setRitualTitle] = useState("");
  const [ritualBody, setRitualBody] = useState("");
  const [drawHint, setDrawHint] = useState("");
  const [pickHint, setPickHint] = useState("");
  const [tableSize, setTableSize] = useState(9);
  const [tableCards, setTableCards] = useState<{ name: string }[]>([]);
  const [pickedIndices, setPickedIndices] = useState<number[]>([]);
  const [pickResolving, setPickResolving] = useState(false);
  const [personalNote, setPersonalNote] = useState("");
  const [computingHint, setComputingHint] = useState("");
  const [reshuffleSalt, setReshuffleSalt] = useState("");
  const [topicPickMode, setTopicPickMode] = useState<"grid" | "custom">("grid");
  const [customQuestion, setCustomQuestion] = useState("");
  const customQuestionRef = useNativeInputSync<HTMLTextAreaElement>(setCustomQuestion);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [selectedNumerologTool, setSelectedNumerologTool] = useState<NumerologToolId>(
    DEFAULT_NUMEROLOG_SESSION_TOOL
  );
  const [numerologToolParams, setNumerologToolParams] = useState<NumerologToolParams>({});

  useEffect(() => {
    if (!isOpen || !initialPartnerInfo) return;
    setNumerologToolParams((prev) => ({
      ...prev,
      partnerName: prev.partnerName?.trim() || initialPartnerInfo.partnerName?.trim() || prev.partnerName,
      partnerDate: prev.partnerDate?.trim() || initialPartnerInfo.partnerDate?.trim() || prev.partnerDate,
    }));
  }, [isOpen, initialPartnerInfo?.partnerName, initialPartnerInfo?.partnerDate]);
  const [numerologResult, setNumerologResult] = useState<NumerologSessionResult | null>(null);
  const [numerologRevealReady, setNumerologRevealReady] = useState(false);
  const [matrixOwned, setMatrixOwned] = useState(false);
  const { config: runeConfig, cost: runeCost } = useRuneConfig();
  const numerologFlow = isNumerologMaster(master);
  const spreadDef = getSpread(selectedSpreadId);
  const numerologTool = numerologFlow ? getNumerologTool(selectedNumerologTool) : null;
  const cardCount = numerologFlow ? (numerologTool?.drawCount ?? 3) : spreadDef.cardCount;
  const matrixBuyOnceOwned =
    numerologFlow && selectedNumerologTool === "destiny_matrix" && matrixOwned;
  const spreadCost = matrixBuyOnceOwned
    ? 0
    : numerologFlow
      ? (numerologTool?.cost ?? PRICING.NUMEROLOGY_SESSION)
      : Math.max(1, Math.round(runeCost("INTENTION_SPREAD") * spreadDef.costMultiplier));

  useEffect(() => {
    if (!isOpen || !numerologFlow || selectedNumerologTool !== "destiny_matrix") {
      setMatrixOwned(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const birthDate = userBirthDate?.trim();
        if (birthDate) {
          const res = await fetch(
            `/api/numerology/matrix-report?birthDate=${encodeURIComponent(birthDate)}`,
            { credentials: "include" }
          );
          if (res.ok) {
            const data = (await res.json()) as { owned?: boolean };
            if (!cancelled && data.owned) {
              setMatrixOwned(true);
              return;
            }
          }
        }
        // Fallback: only match this birth date (ISO or dotted) — never unlock other dates.
        if (!birthDate) {
          if (!cancelled) setMatrixOwned(false);
          return;
        }
        const listRes = await fetch(`/api/numerology/matrix-report?list=1`, {
          credentials: "include",
        });
        if (!listRes.ok || cancelled) {
          if (!cancelled) setMatrixOwned(false);
          return;
        }
        const listData = (await listRes.json()) as {
          reports?: Array<{ content?: string; birthDate?: string }>;
        };
        const birthKey = birthDate.slice(0, 10);
        if (!cancelled) {
          setMatrixOwned(
            Boolean(
              listData.reports?.some(
                (r) =>
                  Boolean(String(r.content ?? "").trim()) &&
                  (r.birthDate === birthKey || r.birthDate === birthDate)
              )
            )
          );
        }
      } catch {
        if (!cancelled) setMatrixOwned(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, numerologFlow, selectedNumerologTool, userBirthDate]);

  /** If Full Matrix is already bought — skip picker CTA and open the saved report. */
  const ownedMatrixAutoStartedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      ownedMatrixAutoStartedRef.current = false;
      return;
    }
    if (!matrixBuyOnceOwned || ownedMatrixAutoStartedRef.current || !master) return;
    ownedMatrixAutoStartedRef.current = true;
    onStart({
      characterKey: master,
      intention: null,
      spreadType: "new",
      cards: [],
      cardsRevealed: true,
      previewCards: [],
      deckSystem,
      numerologToolId: "destiny_matrix",
      numerologToolParams,
    });
  }, [isOpen, matrixBuyOnceOwned, master, deckSystem, numerologToolParams, onStart]);
  const numerologPreselected = isNumerologMaster(preselectedMaster);
  const presetSpreadLocked = hasPresetSpread(initialSpreadId);
  const customQuestionReady = customQuestion.trim().length >= 8;
  const partnerReady = !requiresPartnerInfo || partnerInfoReady(numerologToolParams);
  const resolvedCustomQuestion =
    topic === "custom"
      ? requiresPartnerInfo
        ? appendPartnerContextToQuestion(customQuestion, numerologToolParams)
        : customQuestion.trim()
      : null;
  const numerologPositions =
    numerologFlow && selectedNumerologTool
      ? numerologToolPositions(selectedNumerologTool)
      : [];

  const { isRecording, phase: voicePhase, toggle: toggleRecording } = useSpeechInput({
    onTranscript: (text) => {
      setVoiceNotice(null);
      setCustomQuestion((prev) => (prev ? `${prev} ${text}` : text));
    },
    onError: (message) => setVoiceNotice(message),
  });

  const goToRitualStep = useCallback(() => {
    setCardType("new");
    setNewCards([]);
    setFlipped(emptyFlipped(cardCount));
    setSessionSeed("");
    setReshuffleSalt("");
    setPickedIndices([]);
    setPickResolving(false);
    setTableCards([]);
    setNumerologResult(null);
    setNumerologRevealReady(false);
    setComputingHint("");
    setStep("ritual");
  }, [cardCount]);

  const goToDrawStep = useCallback(() => {
    setCardType("new");
    if (isNumerologMaster(master)) {
      setStep("calculation");
    } else if (!master) {
      setStep("master");
    } else if (presetSpreadLocked) {
      goToRitualStep();
    } else {
      setStep("scheme");
    }
  }, [master, presetSpreadLocked, goToRitualStep]);

  const goToNewSpreadDraw = goToDrawStep;

  // When master changes, drop a scheme that doesn't match their deck.
  useEffect(() => {
    if (!master || numerologFlow || presetSpreadLocked) return;
    const system = resolveMasterDeckSystem(master);
    const current = getSpread(selectedSpreadId);
    if (spreadMatchesSystem(current, system)) return;
    const fallback =
      listSpreads({
        topic: topic && topic !== "custom" ? topic : null,
        system,
      })[0]?.id ?? DEFAULT_SPREAD_ID;
    setSelectedSpreadId(fallback);
  }, [master, numerologFlow, presetSpreadLocked, selectedSpreadId, topic]);

  const hasDailyCards = dailyCards.length >= 3 && !newSpreadOnly;
  const showCardsChoice = hasDailyCards && !numerologFlow;
  const allFlipped = flipped.slice(0, cardCount).every(Boolean);
  const spreadReady =
    newCards.slice(0, cardCount).filter((c) => c.name.trim()).length >= cardCount;
  const topicLocked = Boolean(initialTopic);
  const masterLocked = Boolean(preselectedMaster);
  const activeSteps = buildActiveSteps({
    numerologFlow,
    requiresPartnerInfo,
    topicLocked,
    masterLocked,
    showCardsChoice,
    presetSpreadLocked,
  });
  const currentStepIdx = activeStepIndex(step, activeSteps);

  const initializeFlow = useCallback(() => {
    setTopic(initialTopic ?? null);
    setTopicPickMode("grid");
    setCustomQuestion(initialCustomQuestion ?? "");
    setVoiceNotice(null);
    setMaster(preselectedMaster ?? "");
    setNewCards([]);
    setSelectedSpreadId(resolveSessionSpreadId(initialSpreadId));
    setFlipped(
      emptyFlipped(
        initialSpreadId && !isDailyOnlySpread(initialSpreadId)
          ? getSpread(initialSpreadId).cardCount
          : 3
      )
    );
    setDrawError(null);
    setDrawLoading(false);
    setSessionSeed("");
    setRitualTitle("");
    setRitualBody("");
    setDrawHint("");
    setPickHint("");
    setTableSize(9);
    setTableCards([]);
    setPickedIndices([]);
    setPickResolving(false);
    setPersonalNote("");
    setComputingHint("");
    setReshuffleSalt("");
    setSelectedNumerologTool(initialNumerologTool ?? DEFAULT_NUMEROLOG_SESSION_TOOL);
    setNumerologToolParams({});
    setNumerologResult(null);
    setNumerologRevealReady(false);

    if (numerologPreselected || (newSpreadOnly && isNumerologMaster(preselectedMaster))) {
      setCardType("new");
      setFlipped(emptyFlipped(getNumerologTool(DEFAULT_NUMEROLOG_SESSION_TOOL).drawCount));
      // Collect session topic so numerology calc can seed spheres (love/money/…).
      setStep(initialTopic ? "calculation" : "topic");
      return;
    }

    if (newSpreadOnly) {
      setCardType("new");
      if (requiresPartnerInfo) {
        if (initialTopic) setTopic(initialTopic);
        setStep("partner");
        return;
      }
      if (
        presetSpreadLocked ||
        (autoDrawOnOpen && preselectedMaster && initialTopic)
      ) {
        setStep("ritual");
        return;
      }
      if (initialTopic) {
        // Master before scheme so progress dots never jump backward.
        if (!preselectedMaster) {
          setStep("master");
        } else {
          setStep(presetSpreadLocked ? "ritual" : "scheme");
        }
        return;
      }
      setStep(numerologPreselected ? "calculation" : "topic");
      return;
    }

    setCardType(null);
    if (hasDailyCards) {
      setStep("master");
    } else if (presetSpreadLocked) {
      setCardType("new");
      setStep("ritual");
    } else if (initialTopic && !preselectedMaster) {
      setStep("master");
    } else {
      setStep(initialTopic ? "scheme" : "topic");
    }
  }, [
    hasDailyCards,
    preselectedMaster,
    numerologPreselected,
    newSpreadOnly,
    initialSpreadId,
    presetSpreadLocked,
    initialTopic,
    initialCustomQuestion,
    autoDrawOnOpen,
    requiresPartnerInfo,
    initialNumerologTool,
  ]);

  const flowOpenedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      flowOpenedRef.current = false;
      return;
    }
    if (flowOpenedRef.current) return;
    flowOpenedRef.current = true;
    initializeFlow();
  }, [isOpen, initializeFlow]);

  const spreadDrawSpreadIdRef = useRef<SpreadId | null>(null);

  useEffect(() => {
    if (!isOpen) {
      spreadDrawSpreadIdRef.current = null;
      return;
    }
    if (spreadDrawSpreadIdRef.current === selectedSpreadId) return;
    if (spreadDrawSpreadIdRef.current !== null) {
      setSessionSeed("");
      setPickedIndices([]);
      setTableCards([]);
      setNewCards([]);
      setDrawError(null);
      setPickResolving(false);
      setFlipped(emptyFlipped(getSpread(selectedSpreadId).cardCount));
    }
    spreadDrawSpreadIdRef.current = selectedSpreadId;
  }, [isOpen, selectedSpreadId]);

  // SEO / intent deep links: spread is fixed — never show the scheme picker.
  useEffect(() => {
    if (!isOpen || numerologFlow || !presetSpreadLocked) return;
    if (step === "scheme") {
      setStep("ritual");
    }
  }, [isOpen, numerologFlow, presetSpreadLocked, step]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add("flow-overlay-open");
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.classList.remove("flow-overlay-open");
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const goBack = () => {
    if (step === "topic" && topicPickMode === "custom") {
      setTopicPickMode("grid");
      setTopic(null);
      setCustomQuestion("");
      return;
    }
    if (step === "master") {
      if (!hasDailyCards && !numerologFlow) setStep("topic");
    } else if (step === "cards") setStep("master");
    else if (step === "topic" && cardType === "new") {
      if (numerologFlow) onClose();
      else setStep("scheme");
    }
    else if (step === "scheme") {
      if (requiresPartnerInfo) setStep("partner");
      else if (topic) setStep("topic");
      else if (showCardsChoice && cardType === "new") setStep("cards");
      else if (master) setStep("master");
      else setStep("topic");
    }
    else if (step === "calculation") {
      if (showCardsChoice && cardType === "new") setStep("cards");
      else if (master) setStep("master");
      else setStep("topic");
    }
    else if (step === "ritual") {
      if (numerologFlow) setStep("calculation");
      else if (requiresPartnerInfo) setStep("partner");
      else if (presetSpreadLocked) onClose();
      else if (showCardsChoice && cardType === "new") setStep("scheme");
      else if (showCardsChoice) setStep("cards");
      else setStep("scheme");
    }
    else if (step === "reveal") {
      setNumerologResult(null);
      setNumerologRevealReady(false);
      setSessionSeed("");
      setNewCards([]);
      setStep("calculation");
    }
    else if (step === "pick") {
      setStep("ritual");
      setPickedIndices([]);
    }
    else if (step === "flip") {
      setStep("pick");
      setFlipped(emptyFlipped(cardCount));
      setNewCards([]);
    }
  };

  const buildSpreadQuery = useCallback(
    (extra?: Record<string, string>) => {
      const qs = new URLSearchParams({ master });
      if (numerologFlow) {
        qs.set("numerologTool", selectedNumerologTool);
        const partnerDate = numerologToolParams.partnerDate?.trim();
        const partnerName = numerologToolParams.partnerName?.trim();
        const objectValue = numerologToolParams.objectValue?.trim();
        if (partnerDate) qs.set("partnerDate", partnerDate);
        if (partnerName) qs.set("partnerName", partnerName);
        if (objectValue) qs.set("objectValue", objectValue);
      } else if (topic) {
        qs.set("topic", topic);
        if (topic === "custom" && resolvedCustomQuestion) {
          qs.set("customQuestion", resolvedCustomQuestion);
        }
      }
      if (!numerologFlow) {
        qs.set("spreadId", selectedSpreadId);
      }
      if (spreadIntentSlug?.trim()) {
        qs.set("intentSlug", spreadIntentSlug.trim());
      }
      const jointToken = resolveJointReadingToken();
      if (jointToken) {
        qs.set("jointToken", jointToken);
      }
      if (reshuffleSalt) qs.set("reshuffleSalt", reshuffleSalt);
      if (extra) {
        for (const [k, v] of Object.entries(extra)) qs.set(k, v);
      }
      return qs;
    },
    [
      master,
      numerologFlow,
      topic,
      resolvedCustomQuestion,
      selectedSpreadId,
      selectedNumerologTool,
      numerologToolParams,
      reshuffleSalt,
      spreadIntentSlug,
    ]
  );

  const initSpreadSession = useCallback(
    async (opts?: { reshuffleSaltOverride?: string }) => {
      if (!master) return;
      if (!numerologFlow && !topic) return;
      if (topic === "custom" && !customQuestionReady) return;
      if (requiresPartnerInfo && !partnerReady) return;
      if (
        numerologFlow &&
        !numerologCalculationReady(
          selectedNumerologTool,
          numerologToolParams,
          userBirthDate,
          userFullName
        )
      ) {
        return;
      }
      setDrawLoading(true);
      setDrawError(null);
      const startedAt = Date.now();
      try {
        const qs = buildSpreadQuery({
          sessionInit: "1",
          ...(opts?.reshuffleSaltOverride
            ? { reshuffleSalt: opts.reshuffleSaltOverride }
            : {}),
        });
        const res = await fetch(`/api/intention-spread?${qs}`, {
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          sessionSeed?: string;
          ritualTitle?: string;
          ritualBody?: string;
          drawHint?: string;
          computingHint?: string;
          personalNote?: string;
          pickHint?: string;
          tableSize?: number;
          system?: string;
          deck?: string;
          tableCards?: { name: string }[];
          numerologResult?: NumerologSessionResult;
        };
        if (res.status === 401) {
          setDrawError("Нужна регистрация");
          return;
        }
        if (!res.ok) {
          throw new Error(data.error || "init_failed");
        }

        // Keep the shuffle ritual on screen long enough to feel deliberate.
        if (!numerologFlow) {
          const wait = DECK_SHUFFLE_MIN_MS - (Date.now() - startedAt);
          if (wait > 0) {
            await new Promise((r) => window.setTimeout(r, wait));
          }
        }

        setSessionSeed(String(data.sessionSeed ?? ""));
        setRitualTitle(String(data.ritualTitle ?? ""));
        setRitualBody(String(data.ritualBody ?? ""));
        setDrawHint(String(data.drawHint ?? ""));
        setComputingHint(String(data.computingHint ?? ""));
        setPersonalNote(String(data.personalNote ?? ""));
        setDeckSystem(
          (data.system ??
            data.deck ??
            resolveSpreadDeckSystem(selectedSpreadId, master)) as DeckSystem
        );

        if (numerologFlow && data.numerologResult) {
          const result = data.numerologResult as NumerologSessionResult;
          setNumerologResult(result);
          setNewCards(result.cardNames.map((name) => ({ name })));
          setFlipped(result.cardNames.map(() => true));
          setNumerologRevealReady(false);
          setStep("reveal");
          return;
        }

        setPickHint(String(data.pickHint ?? ""));
        setTableSize(Number(data.tableSize) || 9);
        setTableCards(
          Array.isArray(data.tableCards)
            ? (data.tableCards as { name: string }[]).filter((c) => c?.name)
            : []
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        setDrawError(
          numerologFlow
            ? "Не удалось подготовить числа. Попробуйте снова."
            : msg && msg !== "init_failed"
              ? msg
              : "Не удалось подготовить колоду. Попробуйте снова."
        );
      } finally {
        setDrawLoading(false);
      }
    },
    [
      master,
      numerologFlow,
      topic,
      customQuestionReady,
      requiresPartnerInfo,
      partnerReady,
      selectedNumerologTool,
      numerologToolParams,
      userBirthDate,
      userFullName,
      buildSpreadQuery,
      selectedSpreadId,
    ]
  );

  const resolveSpreadPicks = useCallback(
    async (indices: number[]) => {
      if (!master || !sessionSeed || indices.length !== cardCount) return;
      setPickResolving(true);
      setDrawError(null);
      try {
        const qs = buildSpreadQuery({
          sessionSeed,
          pickedIndices: indices.join(","),
        });
        const res = await fetch(`/api/intention-spread?${qs}`, { credentials: "include" });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error ?? "resolve_failed");
        }
        const data = await res.json();
        const cards = (data.cards ?? []) as { name: string; meaning?: string }[];
        if (cards.length < cardCount) throw new Error("incomplete");
        setNewCards(cards);
        setFlipped(emptyFlipped(cardCount));
        setStep("flip");
      } catch {
        setDrawError(
          numerologFlow
            ? "Не удалось принять выбор — попробуйте другие числа."
            : "Не удалось принять выбор — попробуйте другие карты."
        );
        setPickedIndices([]);
      } finally {
        setPickResolving(false);
      }
    },
    [master, sessionSeed, cardCount, buildSpreadQuery, numerologFlow]
  );

  const handleTablePick = useCallback(
    (index: number) => {
      if (pickResolving || pickedIndices.includes(index)) return;
      setDrawError(null);
      const next = [...pickedIndices, index];
      setPickedIndices(next);
      if (next.length >= cardCount) {
        void resolveSpreadPicks(next);
      }
    },
    [pickResolving, pickedIndices, cardCount, resolveSpreadPicks]
  );

  useEffect(() => {
    if (step !== "ritual" || !master || sessionSeed || drawLoading || drawError) return;
    if (!numerologFlow && !topic) return;
    if (topic === "custom" && !customQuestionReady) return;
    void initSpreadSession();
  }, [
    step,
    master,
    topic,
    customQuestionReady,
    sessionSeed,
    drawLoading,
    drawError,
    numerologFlow,
    selectedSpreadId,
    initSpreadSession,
  ]);

  useEffect(() => {
    if (step === "flip" && !numerologFlow && !topic) {
      setCardType("new");
      setStep("topic");
    }
  }, [step, numerologFlow, topic]);

  useEffect(() => {
    if (numerologFlow && step === "calculation") {
      setFlipped(emptyFlipped(cardCount));
      setNewCards([]);
      setDrawError(null);
      setSessionSeed("");
      setNumerologResult(null);
      setNumerologRevealReady(false);
    }
  }, [selectedNumerologTool, numerologFlow, step, cardCount]);

  const handleNumerologRevealReady = useCallback(() => {
    setNumerologRevealReady(true);
  }, []);

  const handleFlip = useCallback(
    (index: number) => {
      if (flipped[index] || !newCards[index]?.name?.trim()) return;
      setFlipped((prev) => {
        const next = [...prev];
        next[index] = true;
        return next;
      });
    },
    [flipped, newCards]
  );

  const handleSelectNewSpread = () => {
    setCardType("new");
    setNewCards([]);
    goToDrawStep();
  };

  const handleStartDaily = () => {
    if (!master || numerologFlow) return;
    onStart({
      characterKey: master,
      intention: null,
      spreadType: "daily",
      cards: dailyCards.slice(0, 3),
    });
  };

  /** Open saved Full Matrix without ritual / redraw / second charge. */
  const startOwnedMatrixSession = () => {
    if (!master) return;
    onStart({
      characterKey: master,
      intention: null,
      spreadType: "new",
      cards: [],
      cardsRevealed: true,
      previewCards: [],
      deckSystem,
      numerologToolId: "destiny_matrix",
      numerologToolParams,
    });
  };

  const handleStartNew = async () => {
    if (!master) return;
    if (numerologFlow) {
      if (matrixBuyOnceOwned && selectedNumerologTool === "destiny_matrix") {
        startOwnedMatrixSession();
        return;
      }
      if (!numerologRevealReady) return;
      if (!numerologCalculationReady(selectedNumerologTool, numerologToolParams, userBirthDate, userFullName)) {
        return;
      }
      const cards = numerologResult?.cardNames ?? newCards.map((c) => c.name);
      onStart({
        characterKey: master,
        intention: topic,
        spreadType: "new",
        cards,
        cardsRevealed: true,
        previewCards: newCards.slice(0, Math.max(cards.length, 1)),
        deckSystem,
        numerologToolId: selectedNumerologTool,
        numerologToolParams,
        customQuestion: resolvedCustomQuestion,
      });
      return;
    }
    if (!allFlipped || !spreadReady) return;
    if (!topic) return;
    if (topic === "custom" && !customQuestionReady) return;
    if (requiresPartnerInfo && !partnerReady) return;
    onStart({
      characterKey: master,
      intention: topic,
      spreadType: "new",
      spreadId: selectedSpreadId,
      cards: newCards.map((c) => c.name),
      cardsRevealed: true,
      previewCards: newCards.slice(0, cardCount),
      deckSystem,
      customQuestion: resolvedCustomQuestion,
    });
  };

  const handlePartnerDateChange = (value: string) => {
    let v = value.replace(/\D/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length > 4) v = `${v.slice(0, 2)}.${v.slice(2, 4)}.${v.slice(4)}`;
    else if (v.length > 2) v = `${v.slice(0, 2)}.${v.slice(2)}`;
    setNumerologToolParams((prev) => ({ ...prev, partnerDate: v }));
  };

  const partnerInputClass =
    "mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-amber-400/45";

  if (!isOpen) return null;

  const footerPadding = { paddingBottom: "max(1rem, env(safe-area-inset-bottom))" } as const;

  const actionFooter =
    step === "topic" && topicPickMode === "custom" ? (
      <button
        type="button"
        disabled={!customQuestionReady || drawLoading}
        onClick={() => {
          setTopic("custom");
          setCardType("new");
          goToDrawStep();
        }}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block flex flex-col items-center gap-1 disabled:opacity-50"
      >
        <span>Получить карты</span>
        {runeConfig.enabled ? (
          <RuneCost cost={spreadCost} enabled className="text-black/70 text-xs" />
        ) : null}
      </button>
    ) : step === "topic" && topic ? (
      <button
        type="button"
        onClick={() => {
          if (numerologFlow) {
            setStep("calculation");
          } else {
            goToDrawStep();
          }
        }}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block"
      >
        Далее
      </button>
    ) : step === "master" && master ? (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => {
            if (showCardsChoice) {
              setStep("cards");
            } else {
              goToNewSpreadDraw();
            }
          }}
          className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block"
        >
          {showCardsChoice ? "Далее" : numerologFlow ? "Выбрать расчёт" : "Вытянуть карты"}
        </button>
        {onStartRitual && (RITUAL_MASTERS as readonly string[]).includes(master) ? (
          <button
            type="button"
            onClick={onStartRitual}
            className="btn-luxe btn-luxe--md btn-luxe--block w-full border border-amber-500/30 bg-amber-950/20 text-amber-200"
          >
            🕯 Заказать обряд
          </button>
        ) : null}
      </div>
    ) : step === "cards" && showCardsChoice && cardType === "daily" ? (
      <button
        type="button"
        onClick={handleStartDaily}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block"
      >
        Начать сеанс с картами дня
      </button>
    ) : step === "cards" && showCardsChoice && cardType === "new" ? (
      <button
        type="button"
        onClick={() => {
          if (numerologFlow) {
            setStep("calculation");
          } else {
            handleSelectNewSpread();
          }
        }}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block flex flex-col items-center gap-1"
      >
        <span>{numerologFlow ? "Выбрать новый расчёт" : "Вытянуть новые карты"}</span>
        {runeConfig.enabled ? (
          <RuneCost cost={spreadCost} enabled className="text-black/70 text-xs" />
        ) : null}
      </button>
    ) : step === "partner" ? (
      <button
        type="button"
        disabled={!partnerReady}
        onClick={() => setStep(presetSpreadLocked ? "ritual" : "scheme")}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block disabled:opacity-50"
      >
        Далее
      </button>
    ) : step === "scheme" ? (
      <button
        type="button"
        disabled={requiresPartnerInfo && !partnerReady || !topic || !master}
        onClick={() => {
          if (requiresPartnerInfo && !partnerReady) {
            setStep("partner");
            return;
          }
          if (!topic) {
            setStep("topic");
            return;
          }
          if (!master) {
            setStep("master");
            return;
          }
          goToRitualStep();
        }}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block flex flex-col items-center gap-1"
      >
        <span>
          {!topic ? "Выбрать тему" : !master ? "Выбрать мастера" : "Подготовить колоду"}
        </span>
        {runeConfig.enabled && master && topic ? (
          <RuneCost cost={spreadCost} enabled className="text-black/70 text-xs" />
        ) : null}
      </button>
    ) : step === "calculation" && numerologFlow ? (
      <div className="space-y-3">
        {(() => {
          const summary = numerologCalculationSummary(selectedNumerologTool);
          return (
            <div className="numerolog-calc-picker__footer-summary rounded-xl border border-aura-gold/15 bg-amber-950/20 px-3 py-2.5">
              <p className="numerolog-calc-picker__footer-title font-medium text-aura-gold/90">
                {summary.label}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/60">{summary.description}</p>
            </div>
          );
        })()}
        <button
          type="button"
          disabled={
            !matrixBuyOnceOwned &&
            !numerologCalculationReady(
              selectedNumerologTool,
              numerologToolParams,
              userBirthDate,
              userFullName
            )
          }
          onClick={() => {
            if (matrixBuyOnceOwned && selectedNumerologTool === "destiny_matrix") {
              startOwnedMatrixSession();
              return;
            }
            setFlipped(emptyFlipped(cardCount));
            setNewCards([]);
            goToRitualStep();
          }}
          className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block flex flex-col items-center gap-1 disabled:opacity-50"
        >
          <span>{matrixBuyOnceOwned ? "Открыть разбор" : "Посчитать"}</span>
          {!matrixBuyOnceOwned && runeConfig.enabled && spreadCost > 0 ? (
            <RuneCost cost={spreadCost} enabled className="text-black/70 text-xs" />
          ) : null}
        </button>
      </div>
    ) : step === "reveal" && numerologResult && numerologRevealReady ? (
      <button
        type="button"
        onClick={() => void handleStartNew()}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block flex flex-col items-center gap-1 animate-pulse"
      >
        <span>
          {matrixBuyOnceOwned ? "Открыть сохранённый разбор" : "Начать сеанс"}
        </span>
        {runeConfig.enabled && spreadCost > 0 ? (
          <RuneCost cost={spreadCost} enabled className="text-black/70 text-xs" />
        ) : matrixBuyOnceOwned ? (
          <span className="text-xs text-black/70">0 ᚢ · отчёт сохранён</span>
        ) : null}
      </button>
    ) : step === "ritual" && sessionSeed && !drawLoading && !numerologFlow ? (
      <button
        type="button"
        onClick={() => {
          setFlipped(emptyFlipped(cardCount));
          setNewCards([]);
          setPickedIndices([]);
          setDrawError(null);
          setStep(cardCount > 0 ? "pick" : "flip");
        }}
        className="btn-luxe btn-luxe--md btn-luxe--gold btn-luxe--block flex flex-col items-center gap-1"
      >
        <span>{numerologFlow ? "К столу чисел" : "К столу карт"}</span>
        {personalNote ? (
          <span className="text-[10px] font-normal text-black/60">{personalNote}</span>
        ) : null}
      </button>
    ) : step === "flip" && spreadReady && !drawLoading && !drawError ? (
      <button
        type="button"
        disabled={!allFlipped}
        onClick={() => void handleStartNew()}
        className={`btn-luxe btn-luxe--md btn-luxe--block flex flex-col items-center gap-1 transition-all duration-200 ${
          allFlipped
            ? "btn-luxe--gold animate-pulse"
            : "btn-luxe--silver opacity-40 cursor-not-allowed"
        }`}
      >
        <span>Начать сеанс</span>
        {runeConfig.enabled && allFlipped ? (
          <RuneCost cost={spreadCost} enabled className="text-black/70 text-xs" />
        ) : null}
      </button>
    ) : null;

  return (
    <>
    <BodyPortal active={isOpen && step !== "pick"}>
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[6500] flex items-end justify-center sm:items-center"
        data-flow-overlay="true"
        role="dialog"
        aria-modal="true"
        aria-label="Сеанс с мастером"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
          aria-label="Закрыть"
        />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-black/90 backdrop-blur-xl sm:mx-4 sm:max-h-[90dvh] sm:rounded-2xl"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
            {step !== "topic" && step !== "partner" && !(step === "master" && hasDailyCards) ? (
              <button
                type="button"
                onClick={goBack}
                className="text-sm text-white/60 transition-colors hover:text-white"
              >
                ← Назад
              </button>
            ) : step === "topic" && topicPickMode === "custom" ? (
              <button
                type="button"
                onClick={goBack}
                className="text-sm text-white/60 transition-colors hover:text-white"
              >
                ← Назад
              </button>
            ) : (
              <span className="w-12" />
            )}
            <div className="flex items-center gap-1.5">
              {activeSteps.map((s, i) => (
                <span
                  key={s}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i <= currentStepIdx ? "bg-amber-400" : "bg-white/20"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>

          <div
            className={`lux-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6${
              actionFooter
                ? step === "calculation" && numerologFlow
                  ? " lux-scroll--above-footer-tall"
                  : " lux-scroll--above-footer"
                : ""
            }`}
          >
            {/* Step 1 — Topic */}
            {step === "topic" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {topicPickMode === "custom" ? (
                  <>
                    <h2 className="text-center font-display text-xl font-bold text-white">
                      Свой вопрос
                    </h2>
                    <p className="mt-1 text-center text-sm text-white/60">
                      Сформулируйте запрос — мастер ответит по выпавшим картам
                    </p>
                    <div className="mt-5 space-y-3">
                      <textarea
                        ref={customQuestionRef}
                        value={customQuestion}
                        onChange={(e) => setCustomQuestion(e.target.value)}
                        placeholder="Например: стоит ли мне менять работу этой осенью?"
                        rows={4}
                        maxLength={400}
                        inputMode="text"
                        autoComplete="off"
                        autoCorrect="on"
                        spellCheck
                        className="w-full touch-auto select-text resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-400/20"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleRecording()}
                          disabled={voicePhase === "transcribing"}
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                            isRecording
                              ? "border-red-500/50 bg-red-500/10 text-red-400"
                              : "border-white/10 text-gray-400 hover:border-aura-purple/50 hover:text-aura-purple"
                          }`}
                          aria-label={isRecording ? "Остановить запись" : "Диктовка голосом"}
                        >
                          {voicePhase === "transcribing" ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : isRecording ? (
                            <MicOff className="h-5 w-5" />
                          ) : (
                            <Mic className="h-5 w-5" />
                          )}
                        </button>
                        <p className="text-xs text-white/40">
                          {customQuestion.trim().length}/400 · мин. 8 символов
                        </p>
                      </div>
                      {voiceNotice ? (
                        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                          {voiceNotice}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-center font-display text-xl font-bold text-white">
                      О чём поговорим?
                    </h2>
                    <p className="mt-1 text-center text-sm text-white/60">
                      Выберите тему сеанса
                    </p>
                    <div className="mt-6 grid grid-cols-2 gap-3">
                      {SESSION_TOPICS.filter(
                        (t) =>
                          t.id !== "custom" &&
                          !(numerologFlow && t.id === "life_death")
                      ).map((card) => {
                    const isSelected = topic === card.id;
                    const isLifeDeath = card.id === "life_death";
                    const topicCompatible = spreadMatchesTopic(spreadDef, card.id);
                    const dimOthers = topic && !isSelected;

                    let cardClass =
                      "rounded-2xl border p-4 text-center transition-all duration-200 ";

                    if (isLifeDeath) {
                      cardClass += isSelected
                        ? "col-span-2 scale-[1.03] border-violet-400/50 bg-violet-950/20 shadow-lg shadow-violet-900/20"
                        : dimOthers
                          ? "col-span-2 border-white/10 bg-white/5 opacity-50"
                          : "col-span-2 border-white/10 bg-white/5 hover:border-violet-400/40 hover:bg-white/10";
                    } else {
                      cardClass += isSelected
                        ? "scale-[1.03] border-amber-400 bg-amber-950/20 shadow-lg shadow-amber-500/20"
                        : dimOthers
                          ? "border-white/10 bg-white/5 opacity-50"
                          : "border-white/10 bg-white/5 hover:border-amber-400/50 hover:bg-white/10";
                    }

                    return (
                      <button
                        key={card.id}
                        type="button"
                        disabled={!topicCompatible}
                        onClick={() => setTopic(card.id)}
                        className={`${cardClass}${!topicCompatible ? " opacity-30 cursor-not-allowed" : ""}`}
                      >
                        <span className="text-2xl">{card.icon}</span>
                        <p
                          className={`mt-2 text-xs font-medium leading-snug ${
                            isSelected
                              ? isLifeDeath
                                ? "text-violet-200"
                                : "text-amber-300"
                              : "text-white/80"
                          }`}
                        >
                          {card.label}
                        </p>
                        {card.sub ? (
                          <p className="mt-1 text-xs text-white/40">{card.sub}</p>
                        ) : null}
                      </button>
                    );
                  })}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTopicPickMode("custom");
                        setTopic(null);
                      }}
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-center transition-all duration-200 hover:border-amber-400/50 hover:bg-white/10"
                    >
                      <span className="text-2xl">💬</span>
                      <p className="mt-2 text-xs font-medium text-white/80">Свой вопрос</p>
                      <p className="mt-1 text-xs text-white/40">Напишите или продиктуйте запрос</p>
                    </button>
                  </>
                )}
              </motion.div>
            )}

            {/* Step 2 — Master */}
            {step === "master" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-center font-display text-xl font-bold text-white">
                  Выберите мастера
                </h2>
                <p className="mt-1 text-center text-sm text-white/60">
                  {topic === "custom"
                    ? `Ваш вопрос: «${customQuestion.trim().slice(0, 48)}${customQuestion.trim().length > 48 ? "…" : ""}»`
                    : topic === "life_death"
                      ? "Кто поможет разобраться в ситуации"
                      : topic
                        ? `Тема: «${topicLabel(topic)}»`
                        : hasDailyCards
                          ? "Кто проведёт сеанс с вашими картами дня"
                          : "Выберите наставника"}
                </p>

                <div className="mt-6 space-y-2">
                  {masters.map((m) => {
                    const isSelected = master === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setMaster(m.id);
                          setNewCards([]);
                          if (isNumerologMaster(m.id)) {
                            setSelectedNumerologTool(DEFAULT_NUMEROLOG_SESSION_TOOL);
                            setNumerologToolParams({});
                            setFlipped(
                              emptyFlipped(getNumerologTool(DEFAULT_NUMEROLOG_SESSION_TOOL).drawCount)
                            );
                          } else {
                            setFlipped(emptyFlipped(3));
                          }
                          setDrawError(null);
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                          isSelected
                            ? "scale-[1.01] border-amber-400 bg-amber-500/10 shadow-md shadow-amber-500/10"
                            : "border-white/10 bg-white/5 hover:border-amber-400/40 hover:bg-white/10"
                        }`}
                      >
                        <MasterAvatar masterId={m.id} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{m.name}</p>
                          <p className="truncate text-xs text-white/50">{m.title}</p>
                        </div>
                        {isSelected && (
                          <span className="text-xs text-amber-400" aria-hidden>
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 3 — Cards choice (only when daily spread exists) */}
            {step === "cards" && showCardsChoice && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-center font-display text-xl font-bold text-white">
                  Какой расклад взять?
                </h2>
                <p className="mt-1 text-center text-sm text-white/60">
                  Карты дня уже выпали — продолжите с ними или вытащите новые под тему
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setCardType("daily")}
                    className={`rounded-2xl border p-5 text-left transition-all duration-200 ${
                      cardType === "daily"
                        ? "scale-[1.02] border-amber-400 bg-amber-500/10"
                        : "border-white/10 bg-white/5 hover:border-amber-400/50"
                    }`}
                  >
                    <span className="text-2xl">🌅</span>
                    <p className="mt-2 font-display text-base font-bold text-white">
                      Карты дня
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      Быстрый старт — без нового расклада
                    </p>
                    <div className="mt-3 space-y-1">
                      {dailyCards.slice(0, 3).map((name) => (
                        <p key={name} className="text-xs text-amber-200/80">
                          · {name}
                        </p>
                      ))}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (numerologFlow) {
                        setCardType("new");
                        setStep("calculation");
                      } else {
                        handleSelectNewSpread();
                      }
                    }}
                    className={`rounded-2xl border p-5 text-left transition-all duration-200 ${
                      cardType === "new"
                        ? "scale-[1.02] border-amber-400 bg-amber-500/10"
                        : "border-white/10 bg-white/5 hover:border-amber-400/50"
                    }`}
                  >
                    <span className="text-2xl">🃏</span>
                    <p className="mt-2 font-display text-base font-bold text-white">
                      Новый расклад
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      Свежие карты под вашу тему — выберите схему на следующем шаге
                      {runeConfig.enabled ? (
                        <span className="ml-1">
                          · <RuneCost cost={spreadCost} enabled className="inline" />
                        </span>
                      ) : null}
                    </p>
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step — Numerolog calculation */}
            {step === "calculation" && numerologFlow && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-center font-display text-xl font-bold text-white">
                  Выберите расчёт
                </h2>
                <p className="mt-1 text-center text-sm text-white/60">
                  Техника сеанса — выберите расчёт, ниже кратко, что он даёт
                </p>
                <div className="mt-6">
                  <NumerologCalculationPicker
                    selectedId={selectedNumerologTool}
                    params={numerologToolParams}
                    onSelect={(id) => {
                      setSelectedNumerologTool(id);
                      setNumerologToolParams({});
                    }}
                    onParamsChange={setNumerologToolParams}
                    runeBillingEnabled={runeConfig.enabled}
                    userBirthDate={userBirthDate}
                    userFullName={userFullName}
                    hideSummaryPanel
                  />
                </div>
              </motion.div>
            )}

            {/* Step — Partner info (compatibility spreads) */}
            {step === "partner" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-center font-display text-xl font-bold text-white">
                  Данные партнёра
                </h2>
                <p className="mt-1 text-center text-sm text-white/60">
                  {initialCustomQuestion
                    ? `Расклад: «${initialCustomQuestion}»`
                    : "Укажите второго человека — мастер учтёт обоих в расшифровке"}
                </p>
                <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-white/60">
                      Имя
                      <input
                        type="text"
                        value={numerologToolParams.partnerName ?? ""}
                        onChange={(e) =>
                          setNumerologToolParams((prev) => ({
                            ...prev,
                            partnerName: e.target.value,
                          }))
                        }
                        placeholder="Иван"
                        className={partnerInputClass}
                      />
                    </label>
                    <label className="block text-xs text-white/60">
                      Дата рождения
                      <input
                        type="text"
                        value={numerologToolParams.partnerDate ?? ""}
                        onChange={(e) => handlePartnerDateChange(e.target.value)}
                        placeholder="ДД.ММ.ГГГГ"
                        maxLength={10}
                        inputMode="numeric"
                        className={partnerInputClass}
                      />
                    </label>
                  </div>
                  {!partnerReady && numerologToolParams.partnerDate?.trim() ? (
                    <p className="mt-2 text-xs text-red-300">
                      Некорректная дата. Формат: ДД.ММ.ГГГГ (например, 17.03.1993).
                    </p>
                  ) : null}
                </div>
              </motion.div>
            )}

            {/* Step — Spread scheme */}
            {step === "scheme" && !numerologFlow && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-center font-display text-xl font-bold text-white">
                  Выберите схему
                </h2>
                <p className="mt-1 text-center text-sm text-white/60">
                  {spreadDef.label} · {formatSpreadUnitRu(spreadDef.cardCount, master, "nominative")}
                </p>
                <div className="mt-6">
                  <SpreadPicker
                    selectedId={selectedSpreadId}
                    onSelect={(id) => {
                      setSelectedSpreadId(id);
                    }}
                    masterId={master}
                    topic={topic}
                  />
                </div>
              </motion.div>
            )}

            {/* Step — Personal shuffle ritual */}
            {step === "ritual" && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-center font-display text-xl font-bold text-white">
                  {ritualTitle || (numerologFlow ? "Ваши числа" : "Ваша колода")}
                </h2>
                {drawLoading ? (
                  numerologFlow ? (
                    <div className="mt-10 flex flex-col items-center gap-3">
                      <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                      <p className="text-sm text-white/60">
                        {computingHint || "Считаем ваш нумерологический код…"}
                      </p>
                    </div>
                  ) : (
                    <DeckShuffleAnimation
                      active
                      system={resolveSpreadDeckSystem(selectedSpreadId, master)}
                      topicLabel={topic && topic !== "custom" ? topicLabel(topic) : null}
                    />
                  )
                ) : drawError ? (
                  <div className="mt-8 text-center">
                    <p className="text-sm text-red-300">{drawError}</p>
                    <button
                      type="button"
                      onClick={() => void initSpreadSession()}
                      className="btn-luxe btn-luxe--sm btn-luxe--gold mt-3"
                    >
                      Попробовать снова
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="mt-3 text-center text-sm leading-relaxed text-white/70">
                      {ritualBody ||
                        "Сосредоточьтесь на вопросе. Колода собрана под ваш профиль — откройте символы по одному."}
                    </p>
                    {personalNote ? (
                      <p className="mt-4 text-center text-xs uppercase tracking-widest text-amber-400/80">
                        {personalNote}
                      </p>
                    ) : null}
                    {!numerologFlow ? (
                      <div className="deck-shuffle-btn">
                        <DeckShuffleAnimation
                          active
                          idle
                          system={resolveSpreadDeckSystem(selectedSpreadId, master)}
                        />
                        <button
                          type="button"
                          disabled={drawLoading}
                          onClick={() => {
                            if (drawLoading) return;
                            const salt = String(Date.now());
                            setDrawLoading(true);
                            setReshuffleSalt(salt);
                            setSessionSeed("");
                            setPickedIndices([]);
                            setTableCards([]);
                            void initSpreadSession({ reshuffleSaltOverride: salt });
                          }}
                          className="btn-ghost btn-luxe--md mt-1 w-full max-w-xs disabled:opacity-40"
                        >
                          Перемешать колоду
                        </button>
                        <p className="mt-2 text-center text-[11px] text-white/40">
                          Новый порядок карт под ту же тему и ваш код
                        </p>
                      </div>
                    ) : null}
                  </>
                )}
              </motion.div>
            )}

            {/* Step — Numerolog reveal */}
            {step === "reveal" && numerologFlow && numerologResult ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <NumerologSessionReveal
                  result={numerologResult}
                  onAllRevealed={handleNumerologRevealReady}
                />
                {drawHint ? (
                  <p className="mt-4 text-center text-xs text-white/45">{drawHint}</p>
                ) : null}
              </motion.div>
            ) : null}

            {/* Step — Pick: fullscreen MagicalSpreadTable (portal below) */}

            {/* Step — Flip new cards */}
            {step === "flip" && !numerologFlow && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-center font-display text-xl font-bold text-white">
                  {numerologFlow
                    ? cardCount === 1
                      ? "Откройте число"
                      : cardCount < 5
                        ? `Откройте ${cardCount} числа`
                        : `Откройте ${cardCount} чисел`
                    : cardCount === 1
                      ? "Откройте карту"
                      : `Откройте ${cardCount} карт`}
                </h2>
                <p className="mt-1 text-center text-sm text-white/60">
                  {drawHint ||
                    (numerologFlow
                      ? "Коснитесь числа — это ваш расчёт"
                      : "Коснитесь карту — откройте выбранный символ")}
                </p>
                {personalNote ? (
                  <p className="mt-2 text-center text-[10px] uppercase tracking-widest text-amber-400/70">
                    {personalNote}
                  </p>
                ) : null}

                {drawError ? (
                  <div className="mt-8 text-center">
                    <p className="text-sm text-red-300">{drawError}</p>
                  </div>
                ) : (
                  <>
                    <div className="relative mt-6">
                      {numerologFlow ? (
                        <SpreadFlipRow
                          cards={newCards.slice(0, cardCount).map((c, i) =>
                            c.name.trim()
                              ? c
                              : { name: `Число ${i + 1}`, meaning: c.meaning ?? "" }
                          )}
                          system={deckSystem}
                          masterId={master}
                          flipped={flipped.slice(0, cardCount)}
                          onFlip={handleFlip}
                          compact={cardCount <= 5}
                          positions={numerologPositions}
                        />
                      ) : (
                        <SpreadLayout
                          spreadId={selectedSpreadId}
                          cards={newCards.slice(0, cardCount).map((c, i) =>
                            c.name.trim()
                              ? c
                              : { name: `Карта ${i + 1}`, meaning: c.meaning ?? "" }
                          )}
                          system={deckSystem}
                          topic={topic}
                          flipped={flipped}
                          onFlip={handleFlip}
                          compact
                        />
                      )}
                    </div>
                    {!allFlipped && (
                      <p className="mt-4 text-center text-sm text-amber-400/90">
                        {numerologFlow
                          ? "Откройте выбранные числа в любом порядке"
                          : "Откройте выбранные карты в любом порядке"}
                      </p>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </div>

          {actionFooter ? (
            <div
              className="shrink-0 border-t border-white/10 bg-black/95 px-5 py-4 shadow-[0_-12px_32px_rgba(0,0,0,0.45)]"
              style={footerPadding}
            >
              {actionFooter}
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </AnimatePresence>
    </BodyPortal>
    {isOpen && step === "pick" && !numerologFlow && cardCount > 0 ? (
      <MagicalSpreadTable
        tableSize={tableSize}
        cardCount={cardCount}
        system={deckSystem}
        masterId={master}
        pickedIndices={pickedIndices}
        onPick={handleTablePick}
        disabled={pickResolving}
        resolving={pickResolving}
        pickHint={pickHint}
        error={drawError}
        personalNote={personalNote}
        title="Выберите карты"
        onBack={goBack}
        tableCards={undefined}
      />
    ) : null}
    </>
  );
}
