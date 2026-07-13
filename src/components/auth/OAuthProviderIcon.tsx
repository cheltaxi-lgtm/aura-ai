import type { OAuthProvider } from "@/lib/oauth/types";

type OAuthProviderIconProps = {
  provider: OAuthProvider;
  className?: string;
};

/** Official VK wordmark glyph (VK Compact Logo 2021+, Wikimedia Commons). */
function VkIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden fill="currentColor">
      <path d="M25.54 34.5801C14.6 34.5801 8.3601 27.0801 8.1001 14.6001H13.5801C13.7601 23.7601 17.8 27.6401 21 28.4401V14.6001H26.1602V22.5001C29.3202 22.1601 32.6398 18.5601 33.7598 14.6001H38.9199C38.0599 19.4801 34.4599 23.0801 31.8999 24.5601C34.4599 25.7601 38.5601 28.9001 40.1201 34.5801H34.4399C33.2199 30.7801 30.1802 27.8401 26.1602 27.4401V34.5801H25.54Z" />
    </svg>
  );
}

/** Official Yandex «Я» glyph (Yandex_icon.svg, Wikimedia Commons). */
function YandexIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M13.32 7.666h-.924c-1.694 0-2.585.858-2.585 2.123 0 1.43.616 2.1 1.881 2.959l1.045.704-3.003 4.487H7.49l2.695-4.014c-1.55-1.111-2.42-2.19-2.42-4.015 0-2.288 1.595-3.85 4.62-3.85h3.003v11.868H13.32V7.666z" />
    </svg>
  );
}

export default function OAuthProviderIcon({ provider, className = "h-7 w-7" }: OAuthProviderIconProps) {
  if (provider === "vk") {
    return <VkIcon className={className} />;
  }

  return <YandexIcon className={className} />;
}

export const OAUTH_PROVIDER_BRAND: Record<
  OAuthProvider,
  { bg: string; ring: string; label: string; hover: string }
> = {
  vk: {
    bg: "bg-[#0077FF]",
    ring: "ring-[#0077FF]/35",
    hover: "hover:bg-[#0066DD] hover:shadow-[0_8px_28px_rgba(0,119,255,0.45)]",
    label: "ВКонтакте",
  },
  yandex: {
    bg: "bg-[#FC3F1D]",
    ring: "ring-[#FC3F1D]/35",
    hover: "hover:bg-[#E83818] hover:shadow-[0_8px_28px_rgba(252,63,29,0.42)]",
    label: "Яндекс",
  },
};
