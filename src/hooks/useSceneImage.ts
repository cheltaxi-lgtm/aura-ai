"use client";

import { useEffect, useRef, useState } from "react";
import type { ImageGenerateRequest } from "@/lib/image-prompts";
import { requestSceneImage } from "@/lib/scene-images-client";

export function useSceneImage(request: ImageGenerateRequest | null, enabled = true) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const fetchedRef = useRef<string>("");
  const requestRef = useRef<ImageGenerateRequest | null>(request);
  const [retryVersion, setRetryVersion] = useState(0);
  requestRef.current = request;

  const sig = request
    ? JSON.stringify({
        scene: request.scene,
        zodiac: request.zodiac,
        userName: request.userName,
        cards: request.cards,
        characterKey: request.characterKey,
        isPaid: request.isPaid,
        question: request.userQuestionText?.slice(0, 80),
        text: request.aiResponseText?.slice(0, 80),
      })
    : "";

  useEffect(() => {
    const currentRequest = requestRef.current;
    if (!enabled || !currentRequest) {
      setImageUrl(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    const fetchKey = `${sig}:${retryVersion}`;
    if (fetchedRef.current === fetchKey) return;
    fetchedRef.current = fetchKey;

    let cancelled = false;
    setLoading(true);
    setFailed(false);

    const timeout = setTimeout(() => {
      if (cancelled) return;
      setLoading(false);
      setFailed(true);
    }, 80_000);

    requestSceneImage(currentRequest).then((url) => {
      if (cancelled) return;
      clearTimeout(timeout);
      setImageUrl(url);
      setFailed(!url);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [enabled, sig, retryVersion]);

  const retry = () => {
    fetchedRef.current = "";
    setRetryVersion((version) => version + 1);
  };

  return { imageUrl, loading, failed, retry };
}
