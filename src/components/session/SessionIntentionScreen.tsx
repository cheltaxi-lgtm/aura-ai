"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import IntentionPicker, { type IntentionStartMode } from "@/components/IntentionPicker";
import SessionFlowLayout from "@/components/session/SessionFlowLayout";
import { getCharacterById } from "@/lib/characters";
import { findShowcaseMaster, type ShowcaseMaster } from "@/lib/showcase-masters";
import { PENDING_MASTER_KEY, readStoredProfile } from "@/lib/home-flow-storage";
import { navigateHomeAfterIntention } from "@/lib/session-intention-nav";
import { useAuth } from "@/lib/useAuth";
import { useRuneConfig } from "@/lib/useRuneConfig";
import type { SessionIntention } from "@/lib/intention";
import { navigateToAppHome } from "@/lib/app-shell-nav";
import type { FlowStep } from "@/components/FlowStepper";

function resolveCompletedFlowSteps(masterId: string | null): FlowStep[] {
  const profile = readStoredProfile();
  const done: FlowStep[] = [];
  if (profile?.name?.trim() && profile?.birthDate?.trim()) {
    done.push("onboarding");
  }
  if ((profile?.tarotCards?.length ?? 0) >= 3) {
    done.push("triplet");
  }
  if (masterId) {
    done.push("masters");
  }
  return done;
}

export default function SessionIntentionScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoggedIn, loading: authLoading } = useAuth();
  const { config: runeConfig, cost: runeCost } = useRuneConfig();
  const [masters, setMasters] = useState<ShowcaseMaster[]>([]);
  const [runeBalance, setRuneBalance] = useState(0);

  const masterId = useMemo(() => {
    const fromQuery = searchParams.get("master")?.trim();
    if (fromQuery) return fromQuery;
    try {
      return localStorage.getItem(PENDING_MASTER_KEY);
    } catch {
      return null;
    }
  }, [searchParams]);

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      router.replace(`/auth/user/login?returnTo=${encodeURIComponent("/session/intention")}`);
    }
  }, [authLoading, isLoggedIn, router]);

  useEffect(() => {
    void (async () => {
      try {
        const [mastersRes, balanceRes] = await Promise.all([
          fetch("/api/masters", { cache: "no-store" }),
          fetch("/api/runes/balance", { credentials: "include", cache: "no-store" }),
        ]);
        if (mastersRes.ok) {
          const data = (await mastersRes.json()) as { masters?: ShowcaseMaster[] };
          setMasters(Array.isArray(data.masters) ? data.masters : []);
        }
        if (balanceRes.ok) {
          const data = (await balanceRes.json()) as { balance?: number };
          setRuneBalance(Number(data.balance) || 0);
        }
      } catch {
        /* optional */
      }
    })();
  }, []);

  const masterName =
    (masterId ? findShowcaseMaster(masterId, masters)?.name : undefined) ??
    (masterId ? getCharacterById(masterId)?.name : undefined);

  const completedSteps = useMemo(() => resolveCompletedFlowSteps(masterId), [masterId]);

  const finish = (intention: SessionIntention | null, mode: IntentionStartMode) => {
    if (!masterId) {
      navigateToAppHome();
      return;
    }
    navigateHomeAfterIntention(masterId, intention, mode);
  };

  if (!masterId) {
    return (
      <div className="min-h-screen bg-black pb-24 pt-6 text-white">
        <SessionFlowLayout step="intention" title="Намерение сеанса" completed={completedSteps}>
          <p className="text-center text-sm text-gray-400">Мастер не выбран.</p>
          <button type="button" className="btn-primary mx-auto mt-6 block px-8 py-2.5" onClick={navigateToAppHome}>
            На главную
          </button>
        </SessionFlowLayout>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-24 pt-6 text-white">
      <SessionFlowLayout step="intention" title="Намерение сеанса" completed={completedSteps}>
        <IntentionPicker
          masterName={masterName}
          spreadCost={runeCost("INTENTION_SPREAD")}
          runeBalance={runeBalance}
          runeBillingEnabled={runeConfig.enabled}
          onSelect={(intention, mode) => finish(intention, mode)}
          onSkip={() => finish(null, "existing")}
        />
      </SessionFlowLayout>
    </div>
  );
}
