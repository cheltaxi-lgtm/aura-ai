"use client";

import { useEffect, useState } from "react";
import { AuthSalonHeader } from "@/components/auth/AuthShell";
import { hasActiveGuestResumeIntent } from "@/lib/guest-resume-ui-cache";
import { authProductCopy } from "@/lib/auth-product-context";
import { sanitizeReturnTo } from "@/lib/safe-redirect";

export default function RegistrationHeader() {
  const [guest, setGuest] = useState(false);
  const [returnTo, setReturnTo] = useState("/");
  useEffect(() => {
    setGuest(hasActiveGuestResumeIntent());
    setReturnTo(sanitizeReturnTo(new URLSearchParams(window.location.search).get("returnTo"), "/"));
  }, []);
  const copy = authProductCopy(returnTo, guest);
  return <AuthSalonHeader overline=""
    title={copy.title}
    subtitle={copy.subtitle}
  />;
}
