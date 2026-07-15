"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { performClientLogout } from "@/lib/client-logout";
import BrandLogo from "@/components/BrandLogo";
import { BRAND_LOGO_HEADER } from "@/lib/brand";
import { motion } from "framer-motion";
import { Sparkles, Upload, Link2, BarChart3, LogOut } from "lucide-react";

interface ExpertData {
  profile: {
    name: string;
    email: string;
    slug: string;
    title: string | null;
    split_percent: number;
  };
  stats: { visits: number; payments: number; revenue: number };
  knowledge: { id: string; title: string | null; created_at: string }[];
}

export default function ExpertCabinetPage() {
  const router = useRouter();
  const [data, setData] = useState<ExpertData | null>(null);
  const [knowledge, setKnowledge] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const load = () =>
    fetch("/api/expert/dashboard")
      .then(async (r) => {
        if (r.status === 401) {
          router.push("/auth/expert/login");
          return null;
        }
        return r.json();
      })
      .then((d) => d && setData(d));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [router]);

  const whiteLabelUrl =
    typeof window !== "undefined" && data
      ? `${window.location.origin}/master/${data.profile.slug}`
      : "";

  const handleSave = async () => {
    if (!knowledge.trim()) return;
    await fetch("/api/expert/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: knowledge, title: "Загрузка" }),
    });
    setKnowledge("");
    setSaved(true);
    load();
    setTimeout(() => setSaved(false), 2000);
  };

  const logout = async () => {
    await performClientLogout({ redirectTo: "/" });
  };

  if (loading) {
    const loadingOverlay = (
      <div className="app-modal-overlay fixed inset-0 z-[4990] flex items-center justify-center bg-[#05010d] text-gray-500 pointer-events-auto">
        Загрузка кабинета...
      </div>
    );
    if (portalReady) {
      return createPortal(loadingOverlay, document.body);
    }
    return loadingOverlay;
  }

  if (!data) return null;

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <BrandLogo {...BRAND_LOGO_HEADER} />
          <button onClick={logout} className="flex items-center gap-1 text-sm text-gray-500 hover:text-white">
            <LogOut className="h-4 w-4" /> Выйти
          </button>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display mb-1 text-3xl font-bold text-white">
            {data.profile.name}
          </h1>
          <p className="mb-1 text-sm text-gray-500">{data.profile.email}</p>
          <p className="mb-10 text-sm text-aura-purple">{data.profile.title ?? "Эзотерик"}</p>

          <div className="space-y-6">
            <div className="glass-panel p-6">
              <div className="mb-3 flex items-center gap-2 text-aura-neon">
                <Link2 className="h-5 w-5" />
                <h2 className="font-medium">White-Label страница</h2>
              </div>
              <p className="break-all rounded-xl bg-black/40 px-4 py-3 text-sm text-aura-emerald">
                {whiteLabelUrl}
              </p>
              <p className="mt-2 text-xs text-gray-600">
                Сплит {data.profile.split_percent}% вам · {100 - data.profile.split_percent}% платформе
              </p>
            </div>

            <div className="glass-panel p-6">
              <div className="mb-3 flex items-center gap-2 text-aura-neon">
                <Upload className="h-5 w-5" />
                <h2 className="font-medium">База знаний мастера</h2>
              </div>
              <textarea
                value={knowledge}
                onChange={(e) => setKnowledge(e.target.value)}
                rows={6}
                placeholder="Трактовки, стиль речи, примеры раскладов..."
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder-gray-600"
              />
              <button onClick={handleSave} className="btn-neon mt-4 text-sm">
                {saved ? "Сохранено ✓" : "Загрузить материалы"}
              </button>
              {data.knowledge.length > 0 && (
                <ul className="mt-4 space-y-1 text-xs text-gray-600">
                  {data.knowledge.map((k) => (
                    <li key={k.id}>
                      {k.title ?? "Материал"} — {new Date(k.created_at).toLocaleDateString("ru")}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="glass-panel p-6">
              <div className="mb-3 flex items-center gap-2 text-aura-gold">
                <BarChart3 className="h-5 w-5" />
                <h2 className="font-medium">Статистика</h2>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="font-display text-2xl text-white">{data.stats.visits}</p>
                  <p className="text-xs text-gray-600">Переходов</p>
                </div>
                <div>
                  <p className="font-display text-2xl text-white">{data.stats.payments}</p>
                  <p className="text-xs text-gray-600">Оплат</p>
                </div>
                <div>
                  <p className="font-display text-2xl text-aura-gold">
                    {Math.round(data.stats.revenue)} ₽
                  </p>
                  <p className="text-xs text-gray-600">Ваш доход</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
