"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ProShell from "@/modules/pro/ui/ProShell";

export default function ProClientDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{
    client: { id: string; alias: string; notes: string | null; consent_state: string };
    cases: { id: string; type: string; status: string; question: string | null }[];
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/pro/clients/${params.id}`, { credentials: "include" });
      if (res.ok) setData(await res.json());
    })();
  }, [params.id]);

  if (!data) {
    return (
      <ProShell title="Клиент">
        <p className="text-sm text-gray-400">Загрузка…</p>
      </ProShell>
    );
  }

  return (
    <ProShell title={data.client.alias}>
      <p className="text-sm text-gray-400">Согласие: {data.client.consent_state}</p>
      {data.client.notes && (
        <p className="mt-2 text-sm text-gray-300">Заметки: {data.client.notes}</p>
      )}
      <h2 className="font-display mt-8 mb-3 text-lg text-[#e8c77e]">Кейсы</h2>
      <ul className="space-y-2">
        {data.cases.map((c) => (
          <li key={c.id}>
            <Link href={`/pro/case/${c.id}`} className="text-[#ede6da] underline">
              {c.type} · {c.status} · {c.question || "без вопроса"}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={`/pro/case/new?clientId=${data.client.id}`}
        className="btn-neon mt-6 inline-block px-4 py-2 text-sm"
      >
        Новый кейс
      </Link>
    </ProShell>
  );
}
