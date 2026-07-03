"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Camera, Home, Layers, LayoutGrid, User } from "lucide-react";
import {
  navigateToAppHome,
  navigateToDecksModal,
  navigateToPhotoReading,
  navigateToSpreadCatalog,
} from "@/lib/app-shell-nav";
import { triggerAppHaptic } from "@/lib/app-haptics";

const HIDDEN_PREFIXES = ["/cabinet", "/auth"];

function useInActiveChat(): boolean {
  const [active, setActive] = useState(
    () => typeof document !== "undefined" && document.body.classList.contains("chat-session-active")
  );

  useEffect(() => {
    const sync = () => setActive(document.body.classList.contains("chat-session-active"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return active;
}

export default function AppShellBottomNav() {
  const pathname = usePathname() ?? "/";
  const inActiveChat = useInActiveChat();
  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || inActiveChat;
  const isCabinet = pathname.startsWith("/cabinet");
  const isPhoto = pathname.startsWith("/photo-rasklad");
  const isSpread = pathname.startsWith("/rasklady");
  const isHome = pathname === "/" || pathname === "/app";

  useEffect(() => {
    const root = document.documentElement;
    if (hidden) {
      root.classList.remove("app-shell-has-tabs");
    } else {
      root.classList.add("app-shell-has-tabs");
    }
    return () => root.classList.remove("app-shell-has-tabs");
  }, [hidden]);

  return (
    <nav
      className={`app-shell-tabs${hidden ? " app-shell-tabs--hidden" : ""}`}
      aria-hidden={hidden}
      aria-label="Навигация приложения"
    >
      <div className="app-shell-tabs__rail">
        <button
          type="button"
          className={`app-shell-tabs__item${isPhoto ? " app-shell-tabs__item--active" : ""}`}
          onClick={() => {
            void triggerAppHaptic("light");
            navigateToPhotoReading();
          }}
        >
          <span className="app-shell-tabs__icon-wrap">
            <Camera className="app-shell-tabs__icon" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="app-shell-tabs__label">Фото</span>
        </button>

        <button
          type="button"
          className="app-shell-tabs__item"
          onClick={() => {
            void triggerAppHaptic("light");
            navigateToDecksModal();
          }}
        >
          <span className="app-shell-tabs__icon-wrap">
            <Layers className="app-shell-tabs__icon" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="app-shell-tabs__label">Колоды</span>
        </button>

        <div className="app-shell-tabs__center-slot" aria-hidden />

        <button
          type="button"
          className={`app-shell-tabs__item${isSpread ? " app-shell-tabs__item--active" : ""}`}
          onClick={() => {
            void triggerAppHaptic("light");
            navigateToSpreadCatalog();
          }}
        >
          <span className="app-shell-tabs__icon-wrap">
            <LayoutGrid className="app-shell-tabs__icon" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="app-shell-tabs__label">Расклад</span>
        </button>

        <a
          href="/cabinet?app=1"
          className={`app-shell-tabs__item app-shell-tabs__item--link app-shell-tabs__item--right${isCabinet ? " app-shell-tabs__item--active" : ""}`}
          onClick={() => {
            void triggerAppHaptic("light");
            try {
              sessionStorage.setItem("zovus_app_shell", "1");
              document.documentElement.dataset.appShell = "android";
            } catch {
              /* private mode */
            }
          }}
        >
          <span className="app-shell-tabs__icon-wrap">
            <User className="app-shell-tabs__icon" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="app-shell-tabs__label">Кабинет</span>
        </a>
      </div>

      {!hidden ? (
        <button
          type="button"
          className={`app-shell-tabs__fab${isHome ? " app-shell-tabs__fab--active" : ""}`}
          aria-label="Главная"
          onClick={() => {
            void triggerAppHaptic("medium");
            navigateToAppHome();
          }}
        >
          <span className="app-shell-tabs__fab-core">
            <Home className="app-shell-tabs__fab-icon" strokeWidth={2} aria-hidden />
          </span>
        </button>
      ) : null}
    </nav>
  );
}
