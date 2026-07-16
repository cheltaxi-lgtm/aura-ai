"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Play, Pause, Volume2, Loader2, AlertCircle } from "lucide-react";
import {
  getTtsCache,
  hasTtsCache,
  setTtsCache,
  ttsCacheKey,
} from "@/lib/tts-audio-cache";
import { useTtsEnabled } from "@/hooks/useTtsEnabled";
import { isCharacterTtsEnabled } from "@/lib/voice-config";

interface MessageAudioPlayerProps {
  text: string;
  characterId: string;
}

export default function MessageAudioPlayer({ text, characterId }: MessageAudioPlayerProps) {
  const ttsEnabled = useTtsEnabled();
  const cacheKey = useMemo(() => ttsCacheKey(characterId, text), [characterId, text]);
  const cachedOnMount = useMemo(() => hasTtsCache(cacheKey), [cacheKey]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [provider, setProvider] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(cachedOnMount);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopPlaybackRef = useRef(false);

  const cleanupAudio = useCallback(() => {
    stopPlaybackRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cleanupAudio();
  }, [cleanupAudio]);

  const stop = useCallback(() => {
    cleanupAudio();
    setIsPlaying(false);
    setProgress(0);
  }, [cleanupAudio]);

  const playBlobUrl = useCallback(
    (url: string) => {
      stopPlaybackRef.current = false;
      cleanupAudio();
      stopPlaybackRef.current = false;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => {
        setIsPlaying(true);
        setError(null);
      };
      audio.onended = () => {
        setIsPlaying(false);
        setProgress(100);
      };
      audio.ontimeupdate = () => {
        if (audio.duration > 0) {
          setProgress((audio.currentTime / audio.duration) * 100);
        }
      };
      audio.onerror = () => {
        setError("Не удалось воспроизвести аудио");
        stop();
      };
      void audio.play().catch(() => {
        setError("Браузер заблокировал воспроизведение");
        stop();
      });
    },
    [cleanupAudio, stop]
  );

  const playPartsSequentially = useCallback(
    async (parts: string[], contentType: string) => {
      stopPlaybackRef.current = false;
      cleanupAudio();
      stopPlaybackRef.current = false;
      setIsPlaying(true);
      setError(null);

      for (let i = 0; i < parts.length; i++) {
        if (stopPlaybackRef.current) break;

        const binary = atob(parts[i]);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));

        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            setProgress(Math.round(((i + 1) / parts.length) * 100));
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("playback error"));
          };
          void audio.play().catch(reject);
        }).catch(() => {
          setError("Не удалось воспроизвести часть озвучки");
          throw new Error("part playback failed");
        });
      }

      if (!stopPlaybackRef.current) {
        setIsPlaying(false);
        setProgress(100);
      }
    },
    [cleanupAudio]
  );

  const playCached = useCallback(async () => {
    const cached = getTtsCache(cacheKey);
    if (!cached) return false;

    setFromCache(true);
    if (cached.provider) setProvider(cached.provider);

    if (cached.kind === "multipart") {
      await playPartsSequentially(cached.parts, cached.contentType);
      return true;
    }

    playBlobUrl(cached.objectUrl);
    return true;
  }, [cacheKey, playBlobUrl, playPartsSequentially]);

  const loadAndPlay = useCallback(async () => {
    if (!text.trim()) return;

    if (hasTtsCache(cacheKey)) {
      try {
        await playCached();
      } catch {
        /* error set in player */
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    setFromCache(false);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 240000);

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify({ text, characterId }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (data.code === "disabled") {
          setError("Озвучка отключена");
          return;
        }
        setError(data.error ?? "Озвучка недоступна");
        return;
      }

      const ttsProvider = res.headers.get("x-tts-provider") ?? "openrouter";
      const ttsModel = res.headers.get("x-tts-model") ?? "";
      const ttsChunks = res.headers.get("x-tts-chunks");
      const providerLabel = `${ttsProvider}${ttsModel ? ` · ${ttsModel.split("/").pop()}` : ""}${ttsChunks ? ` · ${ttsChunks} ч.` : ""}`;
      setProvider(providerLabel);

      const responseType = res.headers.get("content-type") ?? "";

      if (responseType.includes("application/json")) {
        const data = (await res.json()) as {
          parts?: string[];
          contentType?: string;
        };
        if (!data.parts?.length) {
          setError("Не удалось озвучить ответ");
          return;
        }

        const contentType = data.contentType ?? "audio/wav";
        setTtsCache(cacheKey, {
          kind: "multipart",
          parts: data.parts,
          contentType,
          provider: providerLabel,
        });
        await playPartsSequentially(data.parts, contentType);
        return;
      }

      const mime = responseType || "audio/mpeg";
      const blob = await res.blob();
      if (blob.size < 256) {
        setError("Не удалось озвучить ответ");
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      setTtsCache(cacheKey, {
        kind: "blob",
        blob,
        contentType: mime,
        provider: providerLabel,
        objectUrl,
      });
      playBlobUrl(objectUrl);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "Озвучка заняла слишком много времени — попробуйте ещё раз"
          : "Ошибка сети"
      );
    } finally {
      setIsLoading(false);
    }
  }, [text, characterId, cacheKey, playBlobUrl, playCached, playPartsSequentially]);

  const toggle = () => {
    if (isLoading) return;
    if (isPlaying) {
      stop();
      return;
    }
    void loadAndPlay();
  };

  if (ttsEnabled === false) return null;
  if (ttsEnabled === null) return null;
  if (!isCharacterTtsEnabled(characterId)) return null;

  return (
    <div className="mt-2">
      <div className="aura-audio-player">
        <button
          type="button"
          onClick={toggle}
          disabled={isLoading}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-aura-purple/20 text-aura-neon transition-colors hover:bg-aura-purple/40 disabled:opacity-50"
          title={
            fromCache
              ? "Повтор из кэша (без повторной оплаты)"
              : provider
                ? `Озвучка: ${provider}`
                : "Озвучить ответ мастера"
          }
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          readOnly
          className="flex-1"
        />
        <Volume2
          className={`h-4 w-4 ${provider || fromCache ? "text-aura-emerald/80" : "text-gray-500"}`}
        />
      </div>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-red-400/90">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
      {(provider || fromCache) && !error && !isPlaying && !isLoading && (
        <p className="mt-1 text-[10px] text-gray-600">
          {fromCache ? "Сохранено · повтор без оплаты" : `Голос наставника · ${provider}`}
        </p>
      )}
    </div>
  );
}
