"use client";

import ChatMessageRenderer, {
  type ReadingRenderVariant,
} from "@/components/ChatMessageRenderer";

/** Shared premium reading/report body (same look as master chat). */
export default function PremiumReadingBody({
  content,
  className = "",
  variant = "mystic",
}: {
  content: string;
  className?: string;
  variant?: ReadingRenderVariant;
}) {
  if (!content?.trim()) return null;
  return (
    <ChatMessageRenderer
      content={content}
      role="assistant"
      className={className}
      variant={variant}
    />
  );
}
