"use client";

import { useEffect, useState } from "react";
import { AuthSalonHeader } from "@/components/auth/AuthShell";
import { hasActiveGuestResumeIntent } from "@/lib/guest-resume-ui-cache";

export default function RegistrationHeader() {
  const [guest, setGuest] = useState(false);
  useEffect(() => setGuest(hasActiveGuestResumeIntent()), []);
  return <AuthSalonHeader overline=""
    title={guest ? "Откройте полный разбор этих карт" : "Сохраните свой разбор"}
    subtitle={guest ? "Первый полный разбор — бесплатно. Ваш вопрос и три карты уже сохранены." : "Ваши результаты и продолжение диалога — в одном аккаунте."}
  />;
}
