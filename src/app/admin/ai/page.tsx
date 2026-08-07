"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle } from "@/components/admin/AdminShell";
import ModelPicker from "@/components/admin/ModelPicker";
import OpenRouterDashboard from "@/components/admin/OpenRouterDashboard";

const SCENE_TOGGLES = [
  { key: "zodiac_avatar", label: "Аватар знака (статика /decks/astrology, без AI)" },
  { key: "tarot_atmosphere", label: "Фон расклада Таро" },
  { key: "destiny_card", label: "Карта судьбы (первый ответ)" },
  { key: "scene_illustration", label: "Иллюстрация к вопросу и ответу в чате" },
  { key: "final_report", label: "Итоговый коллаж (только paid)" },
] as const;

export default function AdminAiPage() {
  const [ai, setAi] = useState<Record<string, unknown>>({});
  const [prompts, setPrompts] = useState<Record<string, unknown>>({});
  const [tts, setTts] = useState<Record<string, unknown>>({});
  const [visual, setVisual] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        setAi(d.ai ?? {});
        setPrompts(d.prompts ?? {});
        setTts(d.tts ?? {});
        setVisual(d.visual ?? {});
      });
  }, []);

  const save = async () => {
    const { adminFetch } = await import("@/lib/admin-fetch");
    const patches = [
      { section: "ai", values: ai },
      { section: "prompts", values: prompts },
      { section: "tts", values: tts },
      { section: "visual", values: visual },
    ];
    for (const patch of patches) {
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        alert(data.error ?? `Не удалось сохранить ${patch.section}`);
        return;
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const numField = (
    label: string,
    key: string,
    state: Record<string, unknown>,
    setState: (v: Record<string, unknown>) => void
  ) => (
    <div key={key}>
      <label className="mb-1 block text-xs text-gray-500">{label}</label>
      <input
        type="number"
        step={key === "temperature" ? "0.01" : "1"}
        value={String(state[key] ?? "")}
        onChange={(e) => setState({ ...state, [key]: parseFloat(e.target.value) })}
        min={key === "chunkChars" ? 800 : undefined}
        max={key === "chunkChars" ? 4500 : undefined}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
      />
    </div>
  );

  const scenes = (visual.scenes as Record<string, boolean> | undefined) ?? {};

  const toggleScene = (key: string, enabled: boolean) => {
    setVisual({
      ...visual,
      scenes: { ...scenes, [key]: enabled },
    });
  };

  return (
    <AdminShell>
      <AdminTitle title="Модели и промпты" subtitle="OpenRouter: баланс, расходы, чат, озвучка, визуализация" />

      <OpenRouterDashboard />

      <div className="glass-panel max-w-2xl space-y-4 p-6">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Провайдер (запасной канал)</label>
          <select
            value={String(ai.provider ?? "openrouter")}
            onChange={(e) => setAi({ ...ai, provider: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
          >
            <option value="openrouter">OpenRouter (основной)</option>
            <option value="openai">OpenAI direct</option>
            <option value="deepseek">DeepSeek direct</option>
          </select>
          <p className="mt-1 text-[10px] text-gray-500">
            Модели из списка ниже всегда идут через OpenRouter. Поле «Провайдер» — только если OpenRouter недоступен.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            const m = String(ai.paidModel ?? ai.model ?? ai.freeModel ?? "");
            if (!m) return;
            setAi({ ...ai, model: m, freeModel: m, paidModel: m, provider: "openrouter" });
          }}
          className="w-full rounded-xl border border-aura-gold/40 bg-aura-gold/10 px-4 py-2.5 text-sm text-aura-champagne transition-colors hover:bg-aura-gold/20"
        >
          Одна модель для всего чата (скопировать платную во все поля)
        </button>

        <ModelPicker
          label="Общая модель (fallback, если платная/бесплатная не заданы)"
          value={String(ai.model ?? "")}
          onChange={(modelId) => setAi({ ...ai, model: modelId })}
        />

        <ModelPicker
          label="Бесплатный чат (первые N вопросов)"
          value={String(ai.freeModel ?? ai.paidModel ?? ai.model ?? "")}
          onChange={(modelId) => setAi({ ...ai, freeModel: modelId })}
        />

        <ModelPicker
          label="Платный чат и расклады (руны / подписка)"
          value={String(ai.paidModel ?? ai.model ?? "")}
          onChange={(modelId) => setAi({ ...ai, paidModel: modelId })}
        />
        <p className="text-[10px] text-gray-500 -mt-2">
          Расклады идут через эту модель. Reasoning-модели (deepseek-v4-pro, r1) дают 30–90+ сек на один
          вызов — для скорости лучше flash / gpt-4o-mini / kimi без thinking.
        </p>

        <ModelPicker
          label="Модель для расклада по фото"
          value={String(ai.visionModel ?? "")}
          onChange={(modelId) => setAi({ ...ai, visionModel: modelId })}
          visionOnly
        />

        <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-amber-100">Натальные отчёты и прогнозы</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Отдельная быстрая модель для JSON-отчётов (натал, прогноз, совместимость).
              Не используйте reasoning-модели (deepseek-v4, kimi thinking) — они медленные и ломают structured output.
              Рекомендуется: openai/gpt-4o-mini или google/gemini-2.5-flash.
            </p>
          </div>
          <ModelPicker
            label="Модель для натала"
            value={String(ai.natalModel ?? ai.model ?? "openai/gpt-4o-mini")}
            onChange={(modelId) => setAi({ ...ai, natalModel: modelId })}
          />
        </div>

        <div className="rounded-xl border border-aura-gold/20 bg-aura-gold/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-aura-champagne">Матрица судьбы</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Отдельная модель для позонного разбора матрицы (~19 коротких вызовов).
              Gemini 3.x жжёт токены на reasoning — лучше flash без thinking или deepseek-chat.
              Пусто = deepseek-chat-v3 (не платная модель чата).
            </p>
          </div>
          <ModelPicker
            label="Модель для матрицы"
            value={String(ai.matrixModel || "deepseek/deepseek-chat-v3-0324")}
            onChange={(modelId) => setAi({ ...ai, matrixModel: modelId })}
          />
          <button
            type="button"
            onClick={() => setAi({ ...ai, matrixModel: "" })}
            className="text-xs text-gray-400 underline-offset-2 hover:text-white hover:underline"
          >
            Сбросить → deepseek-chat-v3 (дефолт матрицы)
          </button>
        </div>

        <div className="rounded-xl border border-violet-300/20 bg-violet-300/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-violet-100">Дизайн Человека</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Отдельная модель для HD-отчётов, ответов по отчёту и инсайтов центров
              (посекционная генерация, ~13 вызовов). Гейт качества V1–V12 бракует тонкий
              текст: deepseek-chat-v3 пишет 3–7k символов и не проходит — рекомендуется
              moonshotai/kimi-k2.5. Пусто = платная модель чата.
            </p>
          </div>
          <ModelPicker
            label="Модель для Дизайна Человека"
            value={String(ai.hdModel || ai.paidModel || ai.model || "")}
            onChange={(modelId) => setAi({ ...ai, hdModel: modelId })}
          />
          <button
            type="button"
            onClick={() => setAi({ ...ai, hdModel: "" })}
            className="text-xs text-gray-400 underline-offset-2 hover:text-white hover:underline"
          >
            Сбросить → платная модель чата
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-white">Цепочки fallback-моделей</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Список через запятую. При сбое основной модели генератор пробует следующие
              (validated AI path). Пусто = без доп. моделей.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">fallbackModels (чат / расклады)</label>
            <input
              type="text"
              value={Array.isArray(ai.fallbackModels) ? (ai.fallbackModels as string[]).join(", ") : ""}
              onChange={(e) =>
                setAi({
                  ...ai,
                  fallbackModels: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="openai/gpt-4o-mini, google/gemini-2.5-flash"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">natalFallbackModels</label>
            <input
              type="text"
              value={
                Array.isArray(ai.natalFallbackModels)
                  ? (ai.natalFallbackModels as string[]).join(", ")
                  : ""
              }
              onChange={(e) =>
                setAi({
                  ...ai,
                  natalFallbackModels: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="openai/gpt-4o-mini"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              matrixFallbackModels (пусто = как fallbackModels чата)
            </label>
            <input
              type="text"
              value={
                Array.isArray(ai.matrixFallbackModels)
                  ? (ai.matrixFallbackModels as string[]).join(", ")
                  : ""
              }
              onChange={(e) =>
                setAi({
                  ...ai,
                  matrixFallbackModels: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="deepseek/deepseek-chat-v3-0324, openai/gpt-4o-mini"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
          </div>
        </div>

        {numField("Temperature", "temperature", ai, setAi)}
        {numField("Max tokens (чат)", "maxTokens", ai, setAi)}
        {numField("Max tokens (расклад)", "maxReadingTokens", ai, setAi)}

        <div>
          <label className="mb-1 block text-xs text-gray-500">Глобальный префикс промпта</label>
          <textarea
            rows={4}
            value={String(prompts.globalPrefix ?? "")}
            onChange={(e) => setPrompts({ ...prompts, globalPrefix: e.target.value })}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
          />
        </div>

        <p className="text-xs text-gray-600">
          Каталог моделей подгружается напрямую из OpenRouter в браузере (полный список). Если не загрузился — короткий запасной список или введите ID вручную: provider/model
        </p>

        <div className="rounded-xl border border-aura-emerald/20 bg-aura-emerald/5 p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-aura-emerald">Озвучка мастеров (OpenRouter TTS)</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Эндпоинт /api/v1/audio/speech. Gemini → WAV, остальные → MP3.
              Для русского текста используйте Gemini TTS — Kokoro и Orpheus русский не поддерживают
              (кириллица будет озвучена с английским акцентом).
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={tts.enabled === true}
              onChange={(e) => setTts({ ...tts, enabled: e.target.checked })}
              className="rounded border-white/20 bg-black/30"
            />
            Включить озвучку ответов мастеров
          </label>

          <div className={tts.enabled === true ? "space-y-4" : "pointer-events-none space-y-4 opacity-40"}>
          <ModelPicker
            label="Основная модель озвучки"
            value={String(tts.model ?? "google/gemini-3.1-flash-tts-preview")}
            onChange={(modelId) => setTts({ ...tts, model: modelId })}
            speechOnly
          />

          <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={tts.fallbackEnabled !== false}
              onChange={(e) => setTts({ ...tts, fallbackEnabled: e.target.checked })}
              className="rounded border-white/20 bg-black/30"
              disabled={tts.enabled !== true}
            />
            Запасная модель, если основная недоступна
          </label>

          {tts.fallbackEnabled !== false && (
            <ModelPicker
              label="Запасная модель озвучки"
              value={String(tts.fallbackModel ?? "hexgrad/kokoro-82m")}
              onChange={(modelId) => setTts({ ...tts, fallbackModel: modelId })}
              speechOnly
            />
          )}

          {numField("Размер чанка (символов)", "chunkChars", tts, setTts)}
          </div>
        </div>

        <div className="rounded-xl border border-aura-gold/20 bg-aura-gold/5 p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-aura-champagne">Визуализация (Image Generation)</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Генерация арта через OpenRouter Chat Completions с modalities: image.
              Роут: POST /api/image/generate
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={visual.enabled !== false}
              onChange={(e) => setVisual({ ...visual, enabled: e.target.checked })}
              className="rounded border-white/20 bg-black/30"
            />
            Включить генерацию изображений
          </label>

          <ModelPicker
            label="Основная модель генерации"
            value={String(visual.model ?? "bytedance-seed/seedream-4.5")}
            onChange={(modelId) => setVisual({ ...visual, model: modelId })}
            imageOnly
          />

          <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={visual.fallbackEnabled !== false}
              onChange={(e) => setVisual({ ...visual, fallbackEnabled: e.target.checked })}
              className="rounded border-white/20 bg-black/30"
            />
            Запасная модель изображений
          </label>

          {visual.fallbackEnabled !== false && (
            <ModelPicker
              label="Запасная модель"
              value={String(visual.fallbackModel ?? "google/gemini-3.1-flash-image-preview")}
              onChange={(modelId) => setVisual({ ...visual, fallbackModel: modelId })}
              imageOnly
            />
          )}

          <div>
            <label className="mb-1 block text-xs text-gray-500">Качество по умолчанию</label>
            <select
              value={String(visual.defaultQuality ?? "standard")}
              onChange={(e) => setVisual({ ...visual, defaultQuality: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            >
              <option value="standard">Standard (1K)</option>
              <option value="high">High (2K)</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Глобальный стиль (префикс промпта)</label>
            <textarea
              rows={3}
              value={String(visual.stylePrefix ?? "")}
              onChange={(e) => setVisual({ ...visual, stylePrefix: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-500">Активные сцены</p>
            {SCENE_TOGGLES.map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={scenes[key] !== false}
                  onChange={(e) => toggleScene(key, e.target.checked)}
                  className="rounded border-white/20 bg-black/30"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <button onClick={save} className="btn-primary px-6 py-2.5 text-sm">
          {saved ? "Сохранено ✓" : "Сохранить"}
        </button>
      </div>
    </AdminShell>
  );
}
