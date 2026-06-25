import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/lib/brand";

export const alt = "Zovus — персональные эзотерические консультации";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #07050F 0%, #1A0F2E 45%, #3D2858 100%)",
          color: "#F5E6B8",
          fontFamily: "serif",
          padding: 64,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 120,
            height: 120,
            borderRadius: 28,
            border: "2px solid #C9A24A",
            marginBottom: 32,
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          Z
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: 4, marginBottom: 24 }}>
          {BRAND_NAME}
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 400,
            color: "#E8C77E",
            textAlign: "center",
            maxWidth: 900,
            lineHeight: 1.35,
          }}
        >
          Персональные эзотерические консультации и наставники онлайн
        </div>
        <div style={{ marginTop: 32, fontSize: 24, color: "rgba(245,230,184,0.75)" }}>
          Таро · Руны · Астрология · Нумерология
        </div>
      </div>
    ),
    { ...size }
  );
}
