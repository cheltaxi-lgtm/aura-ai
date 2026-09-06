"use client";

import { useState, useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";

export default function PdfDownloadButton({ path, endpoint, className = "", filename = "zovus-report.pdf" }: {
  path?: string; endpoint?: string; className?: string; filename?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState("");
  const generation = useRef(0);
  useEffect(() => { generation.current++; setFile(null); setError(""); setSaved(""); setBusy(false); }, [path, endpoint, filename]);
  const download = async () => {
    if (busy) return;
    const requestGeneration = generation.current;
    setBusy(true); setError(""); setSaved("");
    try {
      const route = endpoint ?? `/api/reports/pdf?path=${encodeURIComponent(path ?? window.location.pathname)}`;
      const response = await fetch(route, { credentials: "same-origin", signal: AbortSignal.timeout(95_000) });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
        throw new Error(response.status === 401 ? "Войдите в аккаунт, чтобы скачать отчёт." : response.status === 403 ? "Откройте кабинет и подтвердите возраст перед скачиванием." : response.status === 429
          ? "Слишком много выгрузок. Попробуйте позже." : "PDF пока не удалось подготовить. Повторите попытку или откройте печатную версию.");
      }
      const blob = await response.blob();
      if (await blob.slice(0, 5).text() !== "%PDF-") throw new Error("Файл получен не полностью. Повторите скачивание.");
      if (requestGeneration !== generation.current) return;
      const result = new File([blob], filename, { type: "application/pdf" });
      if (Capacitor.getPlatform() === "android") {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = reject;
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.readAsDataURL(result);
        });
        const name = `zovus-report-${Date.now()}.pdf`;
        await Filesystem.writeFile({ path: `Zovus/${name}`, data, directory: Directory.Documents, recursive: true });
        setSaved(`PDF сохранён: Документы → Zovus → ${name}`);
        return;
      }
      // Sharing a downloaded file needs a new user gesture on mobile browsers.
      if (window.matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [result] })) { setFile(result); return; }
      const url = URL.createObjectURL(result);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) {
      setError(Capacitor.getPlatform() === "android" ? "Не удалось сохранить PDF. Проверьте разрешение приложения на файлы и свободное место." : reason instanceof Error && reason.name !== "TimeoutError" && reason.name !== "TypeError" ? reason.message : "Не удалось получить PDF. Проверьте соединение и повторите попытку.");
    } finally { if (requestGeneration === generation.current) setBusy(false); }
  };
  return <span className={`pdf-download print:hidden ${className}`}>
    <button type="button" disabled={busy} onClick={() => {
      if (file) { void navigator.share({ files: [file], title: "Отчёт Zovus" }).catch(e => {
        if (!(e instanceof Error && e.name === "AbortError")) setError("Не удалось открыть сохранение. Попробуйте снова.");
      }); } else { void download(); }
    }} aria-busy={busy}>{busy ? "Готовим PDF…" : file ? "Сохранить PDF" : "Скачать PDF"}</button>
    {error ? <span role="alert" className="pdf-download__error">{error}</span> : null}
    {saved ? <span role="status" className="text-xs">{saved}</span> : null}
  </span>;
}
