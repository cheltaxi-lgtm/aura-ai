"use client";

import { motion } from "framer-motion";
import RuneIcon from "@/components/RuneIcon";
import { formatCabinetDisplayName, resolveZodiacSign } from "@/lib/cabinet-utils";
import type { CabinetProfile } from "@/lib/cabinet-data";

interface Props {
  profile: CabinetProfile;
  onTopUp?: () => void;
  balancePulse?: boolean;
  showRuneTopUp?: boolean;
}

export default function CabinetProfileHeader({ profile, onTopUp, balancePulse, showRuneTopUp = true }: Props) {
  const sign = resolveZodiacSign(profile.zodiac, profile.birthDate);
  const displayName = formatCabinetDisplayName(profile.name);
  const birthLabel = profile.birthDate
    ? new Date(profile.birthDate).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <section id="cabinet-profile" className="cabinet-profile-header">
      <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-aura-gold/20 blur-3xl" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <div className="cabinet-profile-header__avatar" aria-hidden>
            {sign.emoji}
          </div>
          <div>
            <h1 className="cabinet-profile-header__name">{displayName}</h1>
            <p className="cabinet-profile-header__zodiac">
              {sign.name} {sign.emoji}
            </p>
            {birthLabel ? (
              <p className="cabinet-profile-header__birth">Родился: {birthLabel}</p>
            ) : null}
          </div>
        </div>

        {showRuneTopUp ? (
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <motion.div
              key={profile.runeBalance}
              initial={balancePulse ? { scale: 1.15 } : false}
              animate={{ scale: 1 }}
              className="cabinet-profile-header__balance"
            >
              <RuneIcon className="h-5 w-5 text-amber-400" />
              {profile.runeBalance}
            </motion.div>
            {onTopUp ? (
              <button type="button" onClick={onTopUp} className="cabinet-btn cabinet-btn--primary">
                Пополнить руны
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function CabinetProfileHeaderSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl border border-white/10 bg-white/5 p-8">
      <div className="flex gap-5">
        <div className="h-20 w-20 rounded-2xl bg-white/10" />
        <div className="flex-1 space-y-3">
          <div className="h-7 w-40 rounded bg-white/10" />
          <div className="h-4 w-28 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}
