"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProShell from "@/modules/pro/ui/ProShell";

export default function ProBillingPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/pro/account", { credentials: "include" });
      if (res.ok) setData(await res.json());
    })();
  }, []);

  return (
    <ProShell title="Биллинг">
      <p className="text-sm text-gray-300">
        Режим: <strong>{data?.billingMode || "—"}</strong>. В shadow ledger не
        меняется; в live списания идут через общий рунный баланс.
      </p>
      <p className="mt-4 font-display text-3xl text-[#e8c77e]">
        {data?.runeBalance ?? "—"} ᚢ
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Shadow usage: {data?.usage?.shadowRunes ?? 0} · Live:{" "}
        {data?.usage?.liveRunes ?? 0}
      </p>
      <Link href="/cabinet?tab=runes" className="btn-neon mt-6 inline-block px-4 py-2 text-sm">
        Купить пакет рун
      </Link>
    </ProShell>
  );
}
