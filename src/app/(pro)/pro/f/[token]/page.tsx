"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

export default function ProIntakePublicPage() {
  const params = useParams<{ token: string }>();
  const [alias, setAlias] = useState("");
  const [question, setQuestion] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    const res = await fetch(`/api/pro/public/intake/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alias,
        question,
        birthDate: birthDate || undefined,
        consentPdn: consent,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Ошибка");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl text-[#ede6da]">Спасибо</h1>
        <p className="mt-3 text-sm text-gray-400">
          Анкета отправлена практику. Он свяжется с вами через отчёт.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="font-display text-2xl text-[#ede6da]">Анкета-бриф</h1>
      <p className="mt-2 text-sm text-gray-400">Zovus Pro · конфиденциально</p>
      <div className="mt-6 flex flex-col gap-3">
        <input
          placeholder="Как к вам обращаться"
          className="rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2 text-sm"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
        />
        <textarea
          placeholder="Ваш вопрос"
          className="rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2 text-sm"
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <input
          type="date"
          className="rounded border border-[#c9a24a]/30 bg-black/30 px-3 py-2 text-sm"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        <label className="flex items-start gap-2 text-xs text-gray-400">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Согласен(на) на обработку персональных данных для разбора
        </label>
        {err && <p className="text-sm text-red-300">{err}</p>}
        <button
          type="button"
          className="btn-neon px-4 py-2 text-sm"
          disabled={!alias || !consent}
          onClick={() => void submit()}
        >
          Отправить
        </button>
      </div>
    </main>
  );
}
