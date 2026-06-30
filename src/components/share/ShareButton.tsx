"use client";

import { Share2, Check } from "lucide-react";
import { useState } from "react";
import { useShareOptional } from "@/contexts/ShareContext";
import type { SharePayload } from "@/lib/share/types";

type Variant = "icon" | "pill" | "luxe";

interface Props {
  payload: SharePayload;
  variant?: Variant;
  className?: string;
  label?: string;
}

const VARIANT_CLASS: Record<Variant, string> = {
  icon: "share-btn share-btn--icon",
  pill: "share-btn share-btn--pill",
  luxe: "btn-luxe btn-luxe--sm btn-luxe--gold share-btn share-btn--luxe",
};

export default function ShareButton({
  payload,
  variant = "pill",
  className = "",
  label = "Поделиться",
}: Props) {
  const share = useShareOptional();
  const [pressed, setPressed] = useState(false);

  if (!share) return null;

  const handleClick = () => {
    share.openShare(payload);
    setPressed(true);
    window.setTimeout(() => setPressed(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${VARIANT_CLASS[variant]} ${className}`.trim()}
    >
      {pressed ? <Check className="h-3.5 w-3.5 text-aura-emerald" /> : <Share2 className="h-3.5 w-3.5" />}
      {variant !== "icon" && <span>{label}</span>}
    </button>
  );
}
