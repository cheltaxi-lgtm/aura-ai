"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SessionIntention, SessionTopicId } from "@/lib/intention";
import { getIntentionMeta, readSessionCustomQuestion } from "@/lib/intention";
import { getSessionTopic } from "@/lib/session-topics";
import { getTopicSubtitle } from "@/lib/session-topic-subtitles";

interface SessionIntentionBarProps {
  intention: SessionIntention | SessionTopicId;
  masterName: string;
  characterKey: string;
  activeCharacterKey: string;
  highlight?: boolean;
}

function intentionDisplay(intention: SessionIntention | SessionTopicId) {
  const topic = getSessionTopic(intention);
  if (topic) return { icon: topic.icon, label: topic.label, focus: topic.focus };
  return getIntentionMeta(intention as SessionIntention);
}

export default function SessionIntentionBar({
  intention,
  masterName,
  characterKey,
  activeCharacterKey,
  highlight = false,
}: SessionIntentionBarProps) {
  if (!intention || characterKey !== activeCharacterKey) return null;

  const customQ = intention === "custom" ? readSessionCustomQuestion(characterKey) : null;
  const meta = intentionDisplay(intention);
  const displayLabel =
    intention === "custom" && customQ
      ? customQ.length > 72
        ? `${customQ.slice(0, 72).trim()}…`
        : customQ
      : meta.label;
  const subtitle =
    intention === "custom" && customQ
      ? `${masterName} отвечает на ваш вопрос через символы расклада`
      : (characterKey ? getTopicSubtitle(characterKey, intention) : null) ??
        `${masterName} ведёт разговор через призму: ${meta.focus}`;
  const [pulse, setPulse] = useState(highlight);

  useEffect(() => {
    if (!highlight) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 4500);
    return () => clearTimeout(t);
  }, [highlight, intention]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`mb-4 overflow-hidden rounded-2xl border transition-colors duration-700 ${
          pulse
            ? "border-amber-400/50 bg-gradient-to-r from-amber-900/35 via-amber-950/20 to-transparent shadow-lg shadow-amber-500/10"
            : "border-amber-500/25 bg-gradient-to-r from-amber-900/20 to-black/30"
        }`}
      >
        {pulse && (
          <motion.div
            className="h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent"
            initial={{ scaleX: 0, opacity: 0.8 }}
            animate={{ scaleX: 1, opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        )}
        <div className="flex items-start gap-4 px-4 py-3.5">
          <span className="text-3xl leading-none" aria-hidden>
            {meta.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400/90">
              Тема сеанса
            </p>
            <p className="font-display text-lg font-semibold text-amber-100">{displayLabel}</p>
            <p className="mt-0.5 text-xs text-gray-400">
              {pulse ? (
                <span className="text-amber-200/90">
                  {intention === "custom"
                    ? `${masterName} настраивает расклад на ваш вопрос…`
                    : `${masterName} настраивает расклад на «${meta.label.toLowerCase()}»…`}
                </span>
              ) : (
                subtitle
              )}
            </p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
