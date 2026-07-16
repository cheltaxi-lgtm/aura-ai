"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle } from "@/components/admin/AdminShell";
import ModelPicker from "@/components/admin/ModelPicker";
import OpenRouterDashboard from "@/components/admin/OpenRouterDashboard";

const SCENE_TOGGLES = [
  { key: "zodiac_avatar", label: "Аватар знака зодиака (онбординг)" },
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
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "ai", values: ai }),
    });
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "prompts", values: prompts }),
    });
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "tts", values: tts }),
    });
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "visual", values: visual }),
    });
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
          className="w-full rounded-xl border border-aura-purple/40 bg-aura-purple/10 px-4 py-2.5 text-sm text-aura-neon transition-colors hover:bg-aura-purple/20"
        >
          Одна модель для всего чата (скопировать платную во все поля)
        </button>

        <ModelPicker
          label="Модель для чата и раскладов (fallback)"
          value={String(ai.model ?? "")}
          onChange={(modelId) => setAi({ ...ai, model: modelId })}
        />

        <ModelPicker
          label="Бесплатный чат (первые N вопросов — та же модель, что и платный, если не задана отдельно)"
          value={String(ai.freeModel ?? ai.paidModel ?? ai.model ?? "")}
          onChange={(modelId) => setAi({ ...ai, freeModel: modelId })}
        />

        <ModelPicker
          label="Платный чат (руны / подписка)"
          value={String(ai.paidModel ?? ai.model ?? "")}
          onChange={(modelId) => setAi({ ...ai, paidModel: modelId })}
        />

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

        <div className="rounded-xl border border-aura-purple/20 bg-aura-purple/5 p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-aura-neon">Визуализация (Image Generation)</p>
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

        <button onClick={save} className="btn-neon px-6 py-2.5 text-sm">
          {saved ? "Сохранено ✓" : "Сохранить"}
        </button>
      </div>
    </AdminShell>
  );
}
