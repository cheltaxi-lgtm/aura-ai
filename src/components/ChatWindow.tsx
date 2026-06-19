"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Send,
  Mic,
  MicOff,
  Camera,
  Loader2,
} from "lucide-react";
import { getCharacterById } from "@/lib/characters";
import MessageContent, { normalizeMessageText } from "@/components/MessageContent";
import MessageAudioPlayer from "@/components/MessageAudioPlayer";
import SceneImage from "@/components/SceneImage";
import TarotCardsRow from "@/components/TarotCardsRow";
import SessionFeedback from "@/components/SessionFeedback";
import MasterAvatar from "@/components/MasterAvatar";
import type { Message } from "@/types";

interface MasterDisplay {
  name: string;
  title: string;
  emoji?: string;
}

interface ChatWindowProps {
  characterId: string;
  master?: MasterDisplay | null;
  messages: Message[];
  isLoading: boolean;
  questionsLeft?: number | null;
  hasFullAccess?: boolean;
  usesRuneBilling?: boolean;
  questionCost?: number;
  headerSceneUrl?: string | null;
  spreadCards?: { name: string; meaning?: string }[];
  spreadDeckSystem?: import("@/lib/decks/types").DeckSystem;
  insufficientRunes?: { balance: number; required: number } | null;
  onOpenRuneShop?: () => void;
  onSendMessage: (content: string, imageBase64?: string) => void;
  onClose: () => void;
  sessionOffline?: boolean;
  onReconnectSession?: () => void;
  onOpenPaywall?: () => void;
}

export default function ChatWindow({
  characterId,
  messages,
  isLoading,
  questionsLeft,
  hasFullAccess,
  usesRuneBilling,
  questionCost = 10,
  headerSceneUrl,
  spreadCards,
  spreadDeckSystem,
  insufficientRunes,
  onOpenRuneShop,
  master,
  onSendMessage,
  onClose,
  sessionOffline,
  onReconnectSession,
  onOpenPaywall,
}: ChatWindowProps) {
  const character = master ?? getCharacterById(characterId);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [statusText, setStatusText] = useState("Считывает энергетику...");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (isLoading) {
      const name = character?.name ?? "Мастер";
      const statuses = [
        `${name} вглядывается…`,
        "Считывает энергетику…",
        "Соединяется с астральным планом…",
        "Расшифровывает знаки…",
      ];
      let i = 0;
      setStatusText(statuses[0]!);
      const interval = setInterval(() => {
        i = (i + 1) % statuses.length;
        setStatusText(statuses[i]!);
      }, 2000);
      return () => clearInterval(interval);
    }
    setStatusText("Готов к сеансу");
  }, [isLoading, character?.name]);

  const sessionExhausted =
    !hasFullAccess && !usesRuneBilling && questionsLeft === 0;

  const userTurnCount = messages.filter((m) => m.role === "user").length;
  const showSessionFeedback = userTurnCount >= 3 && userTurnCount % 3 === 0 && !isLoading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || sessionExhausted) return;
    onSendMessage(input);
    setInput("");
  };

  const toggleRecording = () => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Голосовой ввод не поддерживается вашим браузером");
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setIsRecording(false);
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Фото должно быть не больше 5 МБ");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      onSendMessage("Проанализируй мой расклад", base64);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (!character) return null;

  return (
    <motion.div
      className="mx-auto max-w-3xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
    >
      {/* Chat header */}
      <div className="glass-panel mb-6 flex items-center gap-4 p-4">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <MasterAvatar masterId={characterId} masterName={character.name} size="lg" priority />

        <div className="flex-1">
          <h2 className="font-display text-xl font-bold text-white">
            {character.name}
          </h2>
          <p className="text-sm text-gray-400">{character.title}</p>
          {!hasFullAccess && questionsLeft != null && questionsLeft > 0 && (
            <p className="mt-0.5 text-xs text-aura-gold">
              Осталось {questionsLeft} бесплатных {questionsLeft === 1 ? "вопрос" : "вопроса"}
            </p>
          )}
          {!hasFullAccess && usesRuneBilling && questionsLeft === 0 && (
            <p className="mt-0.5 text-xs text-gray-500">Далее — {questionCost} ᚢ за вопрос</p>
          )}
          {hasFullAccess && (
            <p className="mt-0.5 text-xs text-aura-emerald">Полный доступ активен</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${isLoading ? "animate-pulse bg-aura-gold" : "bg-aura-emerald"}`}
          />
          <span className="text-xs text-gray-500">{statusText}</span>
        </div>
      </div>

      {sessionOffline && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-100">
            Сессия не синхронизирована с сервером — сообщения не отправятся.
          </p>
          {onReconnectSession && (
            <button
              type="button"
              onClick={onReconnectSession}
              className="btn-neon shrink-0 px-4 py-2 text-sm"
            >
              Переподключить
            </button>
          )}
        </div>
      )}

      {headerSceneUrl &&
        !messages.some((m) => m.role === "assistant" && m.sceneImageUrl) && (
        <SceneImage
          imageUrl={headerSceneUrl}
          label="Карта судьбы"
          variant="card"
          expandable
          className="mb-4 mx-auto"
        />
      )}

      {spreadCards && spreadCards.length >= 3 && (
        <div className="mb-4 rounded-xl border border-aura-gold/15 bg-black/20 p-4">
          <p className="mb-3 text-center text-[10px] uppercase tracking-widest text-aura-gold">
            Расклад 3 карт
          </p>
          <TarotCardsRow
            cards={spreadCards.slice(0, 3)}
            system={spreadDeckSystem}
            masterId={characterId}
            size="md"
          />
        </div>
      )}

      {/* Messages */}
      <div className="glass-panel mb-4 flex h-[min(520px,calc(100vh-280px))] min-h-[320px] flex-col overflow-hidden">
        <div
          ref={scrollContainerRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Сообщения чата"
          className="chat-scroll flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4"
        >
          {messages.length === 0 && !isLoading && (
            <div className="flex min-h-[240px] flex-col items-center justify-center text-center text-gray-500">
              <MasterAvatar masterId={characterId} masterName={character.name} size="xl" className="mb-4" />
              <p className="text-sm">
                {character.name} готов к сеансу.
                <br />
                Задайте вопрос, надиктуйте голосом или загрузите фото расклада.
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                    msg.role === "user"
                      ? "rounded-br-md bg-gradient-to-br from-aura-purple/35 to-aura-purple/15 text-white ring-1 ring-aura-purple/30"
                      : "rounded-bl-md border border-white/10 bg-black/40 text-gray-100"
                  }`}
                >
                  {msg.role === "user" && (
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-aura-neon/70">
                      Вы
                    </p>
                  )}
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {msg.content}
                    </p>
                  ) : (
                    <>
                      {msg.sceneImageUrl && (
                        <SceneImage
                          imageUrl={msg.sceneImageUrl}
                          label={messages.indexOf(msg) === 0 ? "Карта судьбы" : "Видение мастера"}
                          variant={messages.indexOf(msg) === 0 ? "card" : "wide"}
                          expandable={messages.indexOf(msg) === 0}
                          aspectClass={messages.indexOf(msg) === 0 ? undefined : "aspect-video w-full"}
                          objectFit="contain"
                          className="mb-3"
                        />
                      )}
                      <MessageContent content={msg.content} variant="assistant" />
                    </>
                  )}
                  {msg.role === "assistant" && (
                    <MessageAudioPlayer
                      text={normalizeMessageText(msg.content)}
                      characterId={characterId}
                    />
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border border-white/10 bg-black/40 px-4 py-3">
                <MasterAvatar masterId={characterId} masterName={character.name} size="sm" thumb />
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-aura-purple" />
                <span className="text-sm text-gray-400">{statusText}</span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} className="h-1 shrink-0" />
        </div>
      </div>

      {/* Input */}
      {!hasFullAccess && !usesRuneBilling && questionsLeft === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 rounded-xl border border-aura-purple/30 bg-aura-purple/10 p-3 text-center"
        >
          <p className="text-sm text-gray-200">Бесплатные вопросы закончились.</p>
          {onOpenPaywall && (
            <button
              type="button"
              onClick={onOpenPaywall}
              className="mt-2 text-sm font-bold text-aura-neon underline"
            >
              Получить полный доступ →
            </button>
          )}
        </motion.div>
      )}

      {insufficientRunes && onOpenRuneShop && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/15 p-3"
        >
          <p className="text-xs text-amber-300">
            Нужно {insufficientRunes.required} ᚢ, у вас {insufficientRunes.balance} ᚢ
          </p>
          <button
            type="button"
            onClick={onOpenRuneShop}
            className="text-xs font-bold text-amber-400 underline"
          >
            Получить руны →
          </button>
        </motion.div>
      )}

      <SessionFeedback characterId={characterId} visible={showSessionFeedback} />

      <form onSubmit={handleSubmit} className="glass-panel flex items-center gap-2 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Загрузить фото расклада"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition-colors hover:border-aura-emerald/50 hover:text-aura-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple"
          title="Загрузить расклад"
        >
          <Camera className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={toggleRecording}
          aria-label={isRecording ? "Остановить запись голоса" : "Голосовой ввод"}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple ${
            isRecording
              ? "border-red-500/50 bg-red-500/10 text-red-400"
              : "border-white/10 text-gray-400 hover:border-aura-purple/50 hover:text-aura-purple"
          }`}
          title="Голосовой ввод"
        >
          {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (input.trim() && !isLoading && !sessionOffline && !sessionExhausted) {
                onSendMessage(input.trim());
                setInput("");
              }
            }
          }}
          placeholder="Задайте свой вопрос..."
          disabled={isLoading || sessionOffline || sessionExhausted}
          enterKeyHint="send"
          inputMode="text"
          aria-label="Текст сообщения"
          className="flex-1 bg-transparent px-2 text-sm text-white placeholder-gray-500 outline-none disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!input.trim() || isLoading || sessionOffline || sessionExhausted}
          aria-label="Отправить сообщение"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-aura-purple/30 text-aura-neon transition-all hover:bg-aura-purple/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple disabled:opacity-30"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </motion.div>
  );
}
