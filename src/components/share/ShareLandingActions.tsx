"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { copyToClipboard } from "@/lib/share/channels-client";
import { trackShareLandingCta, trackShareLandingCopy } from "@/lib/share/metrika";
import { storeShareRegistrationAttribution } from "@/lib/share/registration-attribution";

interface Props {
  token: string;
  kind: string;
  shareUrl: string;
  ctaHref: string;
}

export default function ShareLandingActions({ token, kind, shareUrl, ctaHref }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareUrl);
    if (!ok) return;
    setCopied(true);
    trackShareLandingCopy(token, kind);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="share-landing__actions">
      <button type="button" onClick={() => void handleCopy()} className="share-landing__copy-btn">
        {copied ? <Check className="h-4 w-4 text-aura-emerald" /> : <Copy className="h-4 w-4" />}
        {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
      </button>
      <Link
        href={ctaHref}
        className="btn-luxe btn-luxe--gold share-landing__cta"
        onClick={() => {
          storeShareRegistrationAttribution(token, kind);
          trackShareLandingCta(token, kind);
        }}
      >
        Получить свой расклад
      </Link>
    </div>
  );
}
