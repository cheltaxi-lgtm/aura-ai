"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";

type JointItem = {
  token: string;
  url: string;
  status: string;
  initiatorName: string | null;
  partnerName: string | null;
  hasInitiatorReading: boolean;
  hasPartnerReading: boolean;
  hasCombined: boolean;
  expiresAt: string;
  isInitiator: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  pending_partner: "Ждём партнёра",
  partner_done: "Ждём ваш расклад",
  completed: "Готово",
  expired: "Истекло",
};

export default function CabinetJointReadings() {
  const [items, setItems] = useState<JointItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/joint-reading/mine", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: JointItem[] };
      setItems(data.items ?? []);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded || items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-aura-gold">
        <Users className="h-4 w-4" />
        <h2 className="text-sm font-medium text-white">Совместные расклады</h2>
      </div>
      <ul className="mt-3 space-y-2">
        {items.slice(0, 5).map((item) => (
          <li key={item.token}>
            <Link
              href={`/joint-reading/${item.token}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm transition hover:border-aura-gold/25"
            >
              <span className="text-white/80">
                {item.initiatorName ?? "Вы"} · {item.partnerName ?? "Партнёр"}
              </span>
              <span className="text-xs text-white/45">
                {STATUS_LABEL[item.status] ?? item.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/joint-reading" className="mt-3 inline-block text-xs text-aura-gold hover:underline">
        Создать новый совместный расклад →
      </Link>
    </section>
  );
}
