"use client";

import { useEffect } from "react";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import AuthShell, { AuthSalonHeader } from "@/components/auth/AuthShell";
import { ACCOUNT_DELETED_HOME_KEY } from "@/components/cabinet/CabinetDeleteAccount";

export default function UserLoginPage() {
  // If we landed here after account deletion (cabinet race), bounce to guest home.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(ACCOUNT_DELETED_HOME_KEY) !== "1") return;
      const home =
        sessionStorage.getItem("zovus_app_shell") === "1" ? "/?app=1" : "/";
      sessionStorage.removeItem(ACCOUNT_DELETED_HOME_KEY);
      window.location.replace(home);
    } catch {
      /* private mode */
    }
  }, []);

  return (
    <AuthShell
      backSlot={
        <Link href="/auth">← Выбор аккаунта</Link>
      }
    >
      <AuthSalonHeader
        overline="Приватный цифровой салон"
        title="С возвращением"
        subtitle="Ваши расклады, диалоги и личная история — здесь"
      />
      <AuthForm mode="login" role="user" />
    </AuthShell>
  );
}
