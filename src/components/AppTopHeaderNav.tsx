"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Menu } from "lucide-react";
import {
  buildHeaderNavSections,
  type HeaderNavItem,
  type HeaderNavSection,
} from "@/lib/header-nav-items";

export type AppTopHeaderNavProps = {
  photoNavLabel: string;
  isLoggedIn?: boolean;
  onNavMasters: () => void;
  onNavDecks: () => void;
  onNavPhoto: () => void;
  onNavTariffs: () => void;
  onNavRitual: () => void;
  onStartReading: () => void;
};

type Anchor = { top: number; left: number; minWidth: number };

export default function AppTopHeaderNav({ isLoggedIn = false, ...callbacks }: AppTopHeaderNavProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const sections = buildHeaderNavSections(callbacks, { isLoggedIn });

  const close = useCallback(() => setOpen(false), []);

  const run = useCallback(
    (action: () => void) => {
      close();
      action();
    },
    [close]
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open, close]);

  const syncAnchor = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 8,
      left: rect.left,
      minWidth: Math.max(rect.width, 15.5 * 16),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncAnchor();
    window.addEventListener("resize", syncAnchor);
    window.addEventListener("scroll", syncAnchor, true);
    return () => {
      window.removeEventListener("resize", syncAnchor);
      window.removeEventListener("scroll", syncAnchor, true);
    };
  }, [open, syncAnchor]);

  const panel =
    open && anchor && mounted
      ? createPortal(
          <div
            ref={panelRef}
            id={titleId}
            className="app-top-header-nav-panel"
            role="menu"
            aria-label="Навигация"
            style={{
              top: anchor.top,
              left: anchor.left,
              minWidth: anchor.minWidth,
            }}
          >
            {sections.map((section) => (
              <NavSectionBlock
                key={section.id}
                section={section}
                onNavigate={close}
                onAction={run}
              />
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`app-top-header__pill relative z-[5010] btn-luxe btn-luxe--sm btn-luxe--pill btn-luxe--gold${
          open ? " app-top-header-nav-trigger--open" : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
      >
        <Menu aria-hidden />
        Меню
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {panel}
    </>
  );
}

function NavSectionBlock({
  section,
  onNavigate,
  onAction,
}: {
  section: HeaderNavSection;
  onNavigate: () => void;
  onAction: (fn: () => void) => void;
}) {
  return (
    <div className="app-top-header-nav-panel__section">
      <p className="app-top-header-nav-panel__kicker">{section.title}</p>
      {section.items.map((item) => (
        <NavRow key={item.id} item={item} onNavigate={onNavigate} onAction={onAction} />
      ))}
    </div>
  );
}

function NavRow({
  item,
  onNavigate,
  onAction,
}: {
  item: HeaderNavItem;
  onNavigate: () => void;
  onAction: (fn: () => void) => void;
}) {
  const Icon = item.icon;
  const content = (
    <>
      <span className="app-top-header-nav-panel__icon">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span>{item.label}</span>
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        download={item.download || undefined}
        className="app-top-header-nav-panel__item"
        role="menuitem"
        onClick={onNavigate}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="app-top-header-nav-panel__item"
      role="menuitem"
      onClick={() => item.onClick && onAction(item.onClick)}
    >
      {content}
    </button>
  );
}
