"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type PopoverAnchor = { top: number; right: number; maxWidth: number };

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => setMounted(true), []);

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

  const syncAnchor = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
      maxWidth: Math.min(320, window.innerWidth - 24),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    syncAnchor();
    window.addEventListener("resize", syncAnchor);
    window.addEventListener("scroll", syncAnchor, true);
    return () => {
      window.removeEventListener("resize", syncAnchor);
      window.removeEventListener("scroll", syncAnchor, true);
    };
  }, [open, syncAnchor]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
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

  const popover =
    open && anchor && mounted
      ? createPortal(
          <div
            ref={popoverRef}
            className="notification-bell-popover fixed z-[6000] overflow-hidden rounded-2xl border border-aura-gold/20 bg-[rgba(15,10,30,0.97)] shadow-[0_12px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
            style={{
              top: anchor.top,
              right: anchor.right,
              width: anchor.maxWidth,
            }}
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
              <ul className="max-h-[min(60dvh,24rem)] divide-y divide-white/6 overflow-y-auto">
                {items.map((n) => {
                  const href = typeof n.data?.ctaPath === "string" ? n.data.ctaPath : null;
                  const label =
                    typeof n.data?.ctaLabel === "string" ? n.data.ctaLabel : "Открыть";
                  return (
                    <li key={n.id} className="px-4 py-3.5">
                      <p className="font-display text-[14px] font-semibold leading-snug text-mystic-gold">
                        {n.title}
                      </p>
                      <p className="mt-1.5 text-[13px] leading-[1.6] text-gray-300/90">{n.body}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-[11px] text-gray-500">{timeAgo(n.created_at)}</span>
                        {href && (
                          <a
                            href={href}
                            onClick={() => {
                              void markAllRead();
                              setOpen(false);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-aura-gold/40 bg-aura-gold/10 px-3 py-1.5 text-xs font-medium text-aura-gold transition hover:border-aura-gold/70 hover:bg-aura-gold/20 hover:text-amber-100"
                          >
                            {label}
                            <span aria-hidden>→</span>
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative z-10 shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl text-gray-300 transition hover:bg-white/5 hover:text-white"
        title="Уведомления"
        aria-label={count > 0 ? `Уведомления: ${count} новых` : "Уведомления"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" aria-hidden />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-aura-gold px-1 text-[10px] font-bold leading-none text-black shadow">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {popover}
    </div>
  );
}
