"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  RITUAL_TYPES,
  getRitualIntroduction,
  type RitualMasterKey,
  type RitualType,
} from "@/lib/ritual-config";
import { useNativeInputSync } from "@/lib/use-native-input-sync";

interface Props {
  ritualId: string;
  characterKey: RitualMasterKey;
  ritualType: RitualType;
  userName: string;
  userZodiac: string;
  onComplete: () => void;
}

interface ChatMsg {
  role: "master" | "user";
  text: string;
}

export default function RitualQuestions({
  ritualId,
  characterKey,
  ritualType,
  userName,
  userZodiac,
  onComplete,
}: Props) {
  const questions = RITUAL_TYPES[ritualType].questions;
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const inputSyncRef = useNativeInputSync<HTMLInputElement>(setInput);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [typing, setTyping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const typeMasterMessage = useCallback(
    (text: string, onDone?: () => void) => {
      setTyping(true);
      setMessages((prev) => [...prev, { role: "master", text: "" }]);
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "master", text: text.slice(0, i) };
          return copy;
        });
        if (i >= text.length) {
          clearInterval(interval);
          setTyping(false);
          onDone?.();
        }
      }, 18);
    },
    []
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const intro = getRitualIntroduction(
      characterKey,
      ritualType,
      userName,
      userZodiac
    );
    typeMasterMessage(intro, () => {
      setTimeout(() => {
        typeMasterMessage(questions[0]);
      }, 600);
    });
  }, [characterKey, ritualType, userName, userZodiac, questions, typeMasterMessage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || submitting || typing) return;

    setSubmitting(true);
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");

    try {
      const res = await fetch(`/api/ritual/${ritualId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: text }),
      });
      if (!res.ok) throw new Error("answer_failed");
      const data = await res.json();

      if (data.readyForSpread) {
        setTimeout(() => onComplete(), 800);
      } else if (data.nextQuestion) {
        setAnswerIndex((i) => i + 1);
        setTimeout(() => typeMasterMessage(data.nextQuestion), 500);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "master", text: "Что-то пошло не так. Попробуй ещё раз." },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-[400px] flex-col">
      <div
        ref={scrollRef}
        className="lux-scroll flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "master"
                ? "mr-auto border border-amber-500/20 bg-amber-950/30 text-amber-50"
                : "ml-auto bg-white/10 text-white"
            }`}
          >
            {msg.text}
            {typing && i === messages.length - 1 && msg.role === "master" ? (
              <span className="ml-1 inline-block animate-pulse">▌</span>
            ) : null}
          </motion.div>
        ))}
      </div>

      {answerIndex < questions.length && !typing && (
        <div className="border-t border-white/10 p-4">
          <div className="flex gap-2">
            <input
              ref={inputSyncRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
              placeholder="Ваш ответ…"
              disabled={submitting}
              className="flex-1 touch-auto select-text rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-amber-400/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!input.trim() || submitting}
              className="btn-luxe btn-luxe--sm btn-luxe--gold px-4"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
