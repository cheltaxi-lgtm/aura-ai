"use client";

import { useEffect, useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { memoryDisplayDate, memorySourceLabel } from "@/lib/memory/presentation";

type Receipt = { id: string; product: string; preparedAt: string; facts: Array<{
  id: string; fact: string; sourceType: string | null; sourceCapturedAt: string | null;
}> };

/** A receipt of supplied context, not a claim about the model's private reasoning. */
export default function MemoryContextReceipt({ sessionId, refreshKey, active = true }: {
  sessionId?: string; refreshKey?: string | number | boolean; active?: boolean;
}) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  useEffect(() => {
    setReceipts([]);
    if (!active) return;
    const controller = new AbortController();
    void fetch(`/api/memory/context${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`, {
      credentials: "include", cache: "no-store", signal: controller.signal,
    }).then(async res => res.ok ? res.json() : null).then(data => {
      if (!controller.signal.aborted && Array.isArray(data?.receipts)) setReceipts(data.receipts);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [sessionId, refreshKey, active]);
  if (!active || !receipts.length) return null;
  return <details className="group mb-3 rounded-2xl border border-amber-200/15 bg-gradient-to-br from-amber-200/[0.07] to-transparent p-3">
    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-amber-100">
      <Brain className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">Что передано из вашей памяти</span>
      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
    </summary>
    <p className="mt-2 text-xs leading-relaxed text-white/50">Эти сведения были переданы мастеру при подготовке последнего обращения. Исправленные и удалённые записи здесь не показываются.</p>
    <div className="mt-3 space-y-4">
      {receipts.map(receipt => <section key={receipt.id}>
        <p className="mb-2 text-xs text-amber-100/65">{memorySourceLabel(receipt.product)} · {memoryDisplayDate(receipt.preparedAt)}</p>
        <ul className="space-y-2">
          {receipt.facts.map(fact => <li key={fact.id} className="rounded-xl bg-black/15 px-3 py-2">
            <p className="text-sm leading-relaxed text-white/80">{fact.fact}</p>
            <p className="mt-1 text-[11px] text-white/65">{memorySourceLabel(fact.sourceType)}{fact.sourceCapturedAt ? ` · ${memoryDisplayDate(fact.sourceCapturedAt)}` : ""}</p>
          </li>)}
        </ul>
      </section>)}
    </div>
    <a href="/cabinet?tab=memory" className="mt-3 inline-block rounded-lg py-1 text-xs text-amber-100 underline underline-offset-4">Управлять памятью</a>
  </details>;
}
