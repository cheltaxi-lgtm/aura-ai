"use client";

import { useEffect } from "react";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";

function isChunkLoadError(error: Error): boolean {
  const msg = error.message ?? "";
  return (
    error.name === "ChunkLoadError" ||
    msg.includes("Loading chunk") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed")
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!isChunkLoadError(error) || typeof window === "undefined") return;
    const key = "aura_chunk_reload_v1";
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <BrandMark size={40} className="mb-4" />
      <h1 className="font-display mb-2 text-3xl font-bold text-white">Что-то пошло не так</h1>
      <p className="mb-8 max-w-sm text-sm text-gray-400">
        Временная ошибка на стороне сервиса. Попробуйте обновить страницу или вернитесь на главную.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn-neon px-8 py-3 text-sm">
          Повторить
        </button>
        <Link href="/" className="btn-luxe btn-luxe--sm btn-luxe--gold px-8 py-3 text-sm">
          На главную
        </Link>
      </div>
    </div>
  );
}
