"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function ProReportPublicPage() {
  const params = useParams<{ token: string }>();
  const [report, setReport] = useState<any>(null);
  const [question, setQuestion] = useState("");
  const [askMsg, setAskMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/pro/public/report/${params.token}`);
      if (!res.ok) {
        setErr("Отчёт недоступен");
        return;
      }
      const json = await res.json();
      setReport(json.report);
    })();
  }, [params.token]);

  async function ask() {
    setAskMsg(null);
    const res = await fetch(`/api/pro/public/report/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const json = await res.json();
    if (!res.ok) {
      setAskMsg(json.error || "Ошибка");
      return;
    }
    setAskMsg(
      json.status === "draft_pending"
        ? "Вопрос отправлен — практик утвердит ответ"
        : json.message || json.status
    );
    setQuestion("");
  }

  if (err) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-display text-2xl text-[#ede6da]">Не найдено</h1>
        <p className="mt-2 text-sm text-gray-400">{err}</p>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-gray-400">
        Загрузка…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-xs tracking-[0.2em] text-[#c9a24a]/80">ОТЧЁТ</p>
      <h1 className="font-display mt-1 text-3xl text-[#ede6da]">{report.brandName}</h1>
      {report.question && (
        <p className="mt-4 text-sm text-gray-300">Вопрос: {report.question}</p>
      )}
      <div className="mt-8 space-y-6">
        {(report.blocks || []).map((b: any) => (
          <section key={b.id}>
            <h2 className="font-display text-xl text-[#e8c77e]">{b.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
              {b.body}
            </p>
          </section>
        ))}
      </div>
      <p className="mt-10 text-xs text-gray-500">{report.disclaimer}</p>

      {report.dialogMode !== "a" && (
        <div className="mt-10 border-t border-[#c9a24a]/20 pt-6">
          <h3 className="font-display text-lg text-[#ede6da]">Спросить по отчёту</h3>
          <textarea
            className="mt-3 w-full rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2 text-sm"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button
            type="button"
            className="btn-neon mt-2 px-4 py-2 text-sm"
            disabled={!question.trim()}
            onClick={() => void ask()}
          >
            Отправить
          </button>
          {askMsg && <p className="mt-2 text-sm text-[#e8c77e]">{askMsg}</p>}
        </div>
      )}
    </main>
  );
}
