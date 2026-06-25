"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: { ctaPath?: string; ctaLabel?: string } & Record<string, unknown>;
  created_at: string;
}

const POLL_MS = 60_000;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  return `${days} дн назад`;
}

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { notifications?: NotificationItem[] };
      setItems(Array.isArray(json.notifications) ? json.notifications : []);
    } catch {
      // best-effort — notifications are non-critical
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = useCallback(async () => {
    setItems([]);
    try {
      await fetch("/api/notifications", { method: "POST", credentials: "include" });
    } catch {
      // ignore — UI already cleared
    }
  }, []);

  const count = items.length;

  if (!loaded && count === 0) {
    // Avoid layout flash before first load resolves.
    return (
      <div className="relative z-10 shrink-0">
        <span className="inline-flex h-8 w-8 items-center justify-center text-gray-500">
          <Bell className="h-4 w-4" aria-hidden />
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative z-10 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl text-gray-300 transition hover:bg-white/5 hover:text-white"
        title="Уведомления"
        aria-label={count > 0 ? `Уведомления: ${count} новых` : "Уведомления"}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-aura-gold px-1 text-[10px] font-bold leading-none text-black shadow">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-aura-gold/20 bg-[rgba(15,10,30,0.97)] shadow-[0_12px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          role="dialog"
          aria-label="Уведомления"
        >
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <span className="font-display text-sm font-semibold text-white">Уведомления</span>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-aura-gold/90 underline-offset-2 hover:underline"
                >
                  Прочитать всё
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-white"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {count === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Пока нет новых уведомлений
            </div>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-white/6 overflow-y-auto">
              {items.map((n) => {
                const href = typeof n.data?.ctaPath === "string" ? n.data.ctaPath : null;
                const label =
                  typeof n.data?.ctaLabel === "string" ? n.data.ctaLabel : "Открыть";
                return (
                  <li key={n.id} className="px-4 py-3">
                    <p className="text-sm font-semibold text-mystic-gold">{n.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-gray-300">{n.body}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-gray-500">{timeAgo(n.created_at)}</span>
                      {href && (
                        <a
                          href={href}
                          onClick={() => {
                            void markAllRead();
                            setOpen(false);
                          }}
                          className="text-xs font-medium text-aura-gold hover:text-amber-200"
                        >
                          {label} →
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
