"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  blobToBase64,
  ensureMicrophoneAccess,
  getSpeechRecognitionCtor,
  insecureContextMessage,
  isBrowserSpeechRecognitionSupported,
  isSecureSpeechContext,
  mapSpeechRecognitionError,
  pickMediaRecorderMimeType,
  type SpeechInputPhase,
} from "@/lib/speech-input-client";

const MAX_RECORDING_MS = 60_000;

interface UseSpeechInputOptions {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
}

export function useSpeechInput({
  disabled = false,
  onTranscript,
  onError,
}: UseSpeechInputOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [phase, setPhase] = useState<SpeechInputPhase>("idle");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const modeRef = useRef<"webspeech" | "server" | null>(null);
  const transcriptBufferRef = useRef("");
  const maxDurationTimerRef = useRef<number | null>(null);
  const serverMimeRef = useRef("audio/webm");
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const switchingToServerRef = useRef(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const clearMaxDurationTimer = useCallback(() => {
    if (maxDurationTimerRef.current != null) {
      window.clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  const releaseMediaStream = useCallback(() => {
    for (const track of mediaStreamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    mediaStreamRef.current = null;
  }, []);

  const resetState = useCallback(() => {
    clearMaxDurationTimer();
    modeRef.current = null;
    transcriptBufferRef.current = "";
    setIsRecording(false);
    setPhase("idle");
  }, [clearMaxDurationTimer]);

  const reportError = useCallback(
    (message: string) => {
      onErrorRef.current?.(message);
    },
    []
  );

  const transcribeServerBlob = useCallback(
    async (blob: Blob) => {
      if (blob.size < 64) {
        reportError("Запись слишком короткая. Попробуйте говорить дольше.");
        resetState();
        return;
      }

      setPhase("transcribing");
      try {
        const audio = await blobToBase64(blob);
        const res = await fetch("/api/stt", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio,
            format: serverMimeRef.current,
            language: "ru",
          }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          text?: string;
          error?: string;
          message?: string;
          code?: string;
        };

        if (!res.ok) {
          const message =
            payload.message ??
            (payload.code === "not_configured"
              ? "Серверное распознавание речи не настроено."
              : payload.error === "rate_limit"
                ? "Слишком много голосовых запросов. Подождите минуту."
                : "Не удалось распознать речь на сервере.");
          reportError(message);
          resetState();
          return;
        }

        const text = payload.text?.trim();
        if (!text) {
          reportError("Речь не распознана. Попробуйте ещё раз.");
          resetState();
          return;
        }

        onTranscriptRef.current(text);
      } catch {
        reportError("Ошибка сети при распознавании речи.");
      } finally {
        resetState();
      }
    },
    [reportError, resetState]
  );

  const stopServerRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      resetState();
      return;
    }
    recorder.stop();
  }, [resetState]);

  const startServerRecording = useCallback(async () => {
    await ensureMicrophoneAccess();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    mediaStreamRef.current = stream;

    const mimeType = pickMediaRecorderMimeType();
    serverMimeRef.current = mimeType;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      releaseMediaStream();
      reportError("Ошибка записи с микрофона.");
      resetState();
    };
    recorder.onstop = () => {
      releaseMediaStream();
      mediaRecorderRef.current = null;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      void transcribeServerBlob(blob);
    };

    mediaRecorderRef.current = recorder;
    modeRef.current = "server";
    recorder.start(250);
    setIsRecording(true);
    setPhase("listening");

    maxDurationTimerRef.current = window.setTimeout(() => {
      stopServerRecording();
    }, MAX_RECORDING_MS);
  }, [releaseMediaStream, reportError, resetState, stopServerRecording, transcribeServerBlob]);

  const stopWebSpeech = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startWebSpeech = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      throw new Error("Web Speech API недоступен");
    }

    const recognition = new Ctor();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;
    transcriptBufferRef.current = "";

    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) {
          parts.push(result[0]?.transcript ?? "");
        }
      }
      transcriptBufferRef.current = parts.join(" ").trim();
    };

    recognition.onerror = (event) => {
      const code = (event as SpeechRecognitionErrorEvent).error;
      if (code === "network" || code === "service-not-allowed") {
        switchingToServerRef.current = true;
        recognition.abort();
        recognitionRef.current = null;
        void startServerRecording()
          .catch((err) => {
            reportError(err instanceof Error ? err.message : mapSpeechRecognitionError(code));
            resetState();
          })
          .finally(() => {
            switchingToServerRef.current = false;
          });
        return;
      }
      if (code !== "aborted" && code !== "no-speech") {
        reportError(mapSpeechRecognitionError(code));
      }
      resetState();
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      clearMaxDurationTimer();
      if (switchingToServerRef.current) return;
      const text = transcriptBufferRef.current.trim();
      transcriptBufferRef.current = "";
      if (text) {
        onTranscriptRef.current(text);
      }
      resetState();
    };

    recognitionRef.current = recognition;
    modeRef.current = "webspeech";
    recognition.start();
    setIsRecording(true);
    setPhase("listening");

    maxDurationTimerRef.current = window.setTimeout(() => {
      stopWebSpeech();
    }, MAX_RECORDING_MS);
  }, [
    clearMaxDurationTimer,
    reportError,
    resetState,
    startServerRecording,
    stopWebSpeech,
  ]);

  const toggle = useCallback(async () => {
    if (disabled) return;

    if (!isSecureSpeechContext()) {
      reportError(insecureContextMessage());
      return;
    }

    if (isRecording) {
      if (modeRef.current === "webspeech") {
        stopWebSpeech();
      } else if (modeRef.current === "server") {
        stopServerRecording();
      } else {
        resetState();
      }
      return;
    }

    try {
      await ensureMicrophoneAccess();
    } catch (err) {
      reportError(
        err instanceof Error ? err.message : "Не удалось получить доступ к микрофону."
      );
      return;
    }

    if (isBrowserSpeechRecognitionSupported()) {
      try {
        startWebSpeech();
        return;
      } catch {
        /* fallback below */
      }
    }

    try {
      await startServerRecording();
    } catch (err) {
      reportError(
        err instanceof Error ? err.message : "Не удалось начать запись с микрофона."
      );
      resetState();
    }
  }, [
    disabled,
    isRecording,
    reportError,
    resetState,
    startServerRecording,
    startWebSpeech,
    stopServerRecording,
    stopWebSpeech,
  ]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      releaseMediaStream();
      clearMaxDurationTimer();
    };
  }, [clearMaxDurationTimer, releaseMediaStream]);

  return {
    isRecording,
    phase,
    toggle,
  };
}
