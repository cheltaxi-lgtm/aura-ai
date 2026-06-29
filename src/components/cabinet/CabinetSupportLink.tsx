"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Headphones, ChevronRight } from "lucide-react";

export default function CabinetSupportLink() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    fetch("/api/support/unread-count", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUnread(typeof d?.unread === "number" ? d.unread : 0))
      .catch(() => {});
  }, []);

  return (
    <Link
      href="/cabinet/support"
      className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-amber-500/30 hover:bg-white/[0.05]"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
          <Headphones className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium text-white">Техподдержка</p>
          <p className="text-xs text-gray-500">Вопросы по оплате, аккаунту и работе сервиса</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {unread > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-black">
            {unread}
          </span>
        ) : null}
        <ChevronRight className="h-5 w-5 text-gray-600 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-400/70" />
      </div>
    </Link>
  );
}
