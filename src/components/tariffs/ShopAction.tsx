"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { buildLoginHref, buildRegisterHref } from "@/lib/post-auth-return";
import { usePaywall } from "@/contexts/PaywallContext";

export default function ShopAction({ className = "", label, packageId }: { className?: string; label?: string; packageId?: string }) {
  const { isLoggedIn, loading } = useAuth();
  const { openPaywall } = usePaywall();
  const [busy, setBusy] = useState(false);
  const title = label ?? (isLoggedIn ? "Пополнить баланс" : "Зарегистрироваться и пополнить");
  if (loading) {
    return <button type="button" disabled aria-busy="true" className={className}>{title}</button>;
  }
  if (!isLoggedIn) {
    const href = buildRegisterHref("/cabinet?shop=1");
    return <Link href={href} className={className}>{title}</Link>;
  }
  const openShop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/runes/balance", { credentials: "include" });
      if (response.status === 401) {
        window.location.assign(buildLoginHref("/cabinet?shop=1"));
        return;
      }
      const data = response.ok ? await response.json() : null;
      if (typeof data?.balance !== "number") {
        window.location.assign("/cabinet?shop=1");
        return;
      }
      openPaywall({ currentBalance: data.balance, highlightPackageId: packageId });
    } catch {
      window.location.assign("/cabinet?shop=1");
    } finally {
      setBusy(false);
    }
  };
  return <button type="button" onClick={() => void openShop()} disabled={busy} className={className}>{title}</button>;
}
