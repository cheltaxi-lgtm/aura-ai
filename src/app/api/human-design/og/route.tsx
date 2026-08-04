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
  const profile = chart ? chart.chart.profile : "";
  const authority = chart ? AUTHORITY_NAMES_RU[chart.chart.authority] : "";
  const profileName = chart ? (PROFILE_NAMES_RU[chart.chart.profile] ?? "") : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background:
            "radial-gradient(ellipse 70% 50% at 30% 20%, rgba(155,127,212,0.25), transparent 70%), linear-gradient(150deg, #14101f 0%, #07060d 100%)",
          color: "#F5E6B8",
          padding: 48,
        }}
      >
        {chart && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              width: 300,
              gap: 18,
              alignContent: "center",
              justifyContent: "center",
            }}
          >
            {(chart.chart.definedCenters ?? []).slice(0, 9).map((c) => (
              <div
                key={c}
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 20,
                  background: "linear-gradient(145deg, #e8c77e, #9b7fd4)",
                }}
              />
            ))}
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: chart ? 56 : 0,
            flex: 1,
          }}
        >
          <div style={{ fontSize: 20, letterSpacing: 6, color: "rgba(232,199,126,0.6)" }}>
            ZOVUS · ДИЗАЙН ЧЕЛОВЕКА
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, marginTop: 18, lineHeight: 1.1 }}>
            {typeName}
          </div>
          {chart && (
            <div style={{ fontSize: 30, color: "rgba(245,230,184,0.85)", marginTop: 14 }}>
              Профиль {profile} · {profileName}
            </div>
          )}
          {chart && (
            <div style={{ fontSize: 26, color: "rgba(245,230,184,0.65)", marginTop: 8 }}>
              Авторитет: {authority}
            </div>
          )}
          <div
            style={{
              marginTop: 36,
              fontSize: 24,
              color: "#0c0a14",
              background: "linear-gradient(90deg, #e8c77e, #c9a24a)",
              padding: "14px 28px",
              borderRadius: 999,
              alignSelf: "flex-start",
              fontWeight: 600,
            }}
          >
            Рассчитать свою карту бесплатно
          </div>
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
