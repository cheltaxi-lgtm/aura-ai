"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ReportBlock = { id: string; title: string; body: string };

type ReportPayload = {
  brandName?: string;
  question?: string;
  blocks?: ReportBlock[];
  disclaimer?: string;
  dialogMode?: string;
};

export default function ProReportPublicPage() {
  const params = useParams<{ token: string }>();
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [question, setQuestion] = useState("");
  const [askMsg, setAskMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/pro/public/report/${params.token}`);
      if (!res.ok) {
        setErr("Отчёт недоступен");
        return;
      }
      const json = await res.json();
      setReport(json.report as ReportPayload);
    })();
  }, [params.token]);

  async function ask() {
    setAskMsg(null);
    setSending(true);
    const res = await fetch(`/api/pro/public/report/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const json = await res.json();
    setSending(false);
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
      <main className="pro-public mx-auto max-w-lg px-4 py-16 text-center">
        <p className="pro-public__eyebrow">Zovus Pro</p>
        <h1 className="pro-public__title mt-2 text-2xl">Не найдено</h1>
        <p className="mt-2 text-sm text-gray-400">{err}</p>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="pro-public mx-auto max-w-lg px-4 py-16 text-center text-sm text-gray-400">
        Загрузка…
      </main>
    );
  }

  return (
    <main className="pro-public mx-auto max-w-2xl px-4 py-12">
      <p className="pro-public__eyebrow">Отчёт</p>
      <h1 className="pro-public__title mt-1 text-3xl">
        {report.brandName || "Zovus Pro"}
      </h1>
      {report.question ? (
        <p className="mt-4 text-sm text-gray-300">Вопрос: {report.question}</p>
      ) : null}
      <div className="mt-8 space-y-6">
        {(report.blocks || []).map((b) => (
          <section key={b.id} className="pro-panel">
            <h2 className="pro-public__block-title text-xl">{b.title}</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
              {b.body}
            </p>
          </section>
        ))}
      </div>
      {report.disclaimer ? (
        <p className="mt-10 text-xs text-gray-500">{report.disclaimer}</p>
      ) : null}

      {report.dialogMode !== "a" ? (
        <div className="mt-10 border-t border-[color:var(--pro-border)] pt-6">
          <h3 className="pro-public__title text-lg">Спросить по отчёту</h3>
          <textarea
            className="pro-field mt-3"
            rows={3}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ваш уточняющий вопрос"
          />
          <button
            type="button"
            className="btn-neon mt-2 px-4 py-2 text-sm"
            disabled={!question.trim() || sending}
            onClick={() => void ask()}
          >
            {sending ? "Отправка…" : "Отправить"}
          </button>
          {askMsg ? <p className="mt-2 text-sm text-[#e8c77e]">{askMsg}</p> : null}
        </div>
      ) : null}
    </main>
  );
}
