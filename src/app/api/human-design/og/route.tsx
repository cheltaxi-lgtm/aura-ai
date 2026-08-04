import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { getHdChartByFingerprint } from "@/lib/services/human-design-service";
import {
  AUTHORITY_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
} from "@/lib/human-design";

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

export async function GET(request: NextRequest) {
  const fingerprint = request.nextUrl.searchParams.get("f") ?? "";
  const chart = /^[0-9a-f]{64}$/.test(fingerprint)
    ? await getHdChartByFingerprint(fingerprint).catch(() => null)
    : null;

  const typeName = chart ? TYPE_META[chart.chart.type].nameRu : "Дизайн Человека";
  const profile = chart?.chart.profile ?? "";
  const authority = chart ? AUTHORITY_NAMES_RU[chart.chart.authority] : "";
  const profileName = chart ? (PROFILE_NAMES_RU[chart.chart.profile] ?? "") : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background:
            "radial-gradient(ellipse 70% 50% at 30% 20%, rgba(155,127,212,0.25), transparent 70%), linear-gradient(150deg, #14101f 0%, #07060d 100%)",
          color: "#F5E6B8",
          padding: 64,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 20,
            letterSpacing: 6,
            color: "rgba(232,199,126,0.6)",
            whiteSpace: "nowrap",
          }}
        >
          ZOVUS · ДИЗАЙН ЧЕЛОВЕКА
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 52,
            fontWeight: 700,
            marginTop: 20,
            whiteSpace: "nowrap",
          }}
        >
          {typeName}
        </div>
        {chart && (
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "rgba(245,230,184,0.85)",
              marginTop: 16,
              whiteSpace: "nowrap",
            }}
          >
            {`Профиль ${profile}${profileName ? ` · ${profileName}` : ""}`}
          </div>
        )}
        {chart && authority && (
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: "rgba(245,230,184,0.65)",
              marginTop: 8,
              whiteSpace: "nowrap",
            }}
          >
            {`Авторитет: ${authority}`}
          </div>
        )}
        <div
          style={{
            marginTop: 36,
            display: "flex",
            fontSize: 24,
            color: "#0c0a14",
            background: "linear-gradient(90deg, #e8c77e, #c9a24a)",
            padding: "14px 28px",
            borderRadius: 999,
            fontWeight: 600,
            alignSelf: "flex-start",
            whiteSpace: "nowrap",
          }}
        >
          Рассчитать свою карту бесплатно
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    }
  );
}
