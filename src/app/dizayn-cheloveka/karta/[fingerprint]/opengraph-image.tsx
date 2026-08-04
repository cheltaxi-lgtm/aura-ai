import { ImageResponse } from "next/og";
import { getHdChartByFingerprint } from "@/lib/services/human-design-service";
import {
  AUTHORITY_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
} from "@/lib/human-design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Карта Дизайна Человека";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}) {
  const { fingerprint } = await params;
  console.error("[hd-og] start", fingerprint.slice(0, 8));
  const chart = await getHdChartByFingerprint(fingerprint).catch((e) => {
    console.error("[hd-og] db error", e?.message);
    return null;
  });
  console.error("[hd-og] chart loaded", Boolean(chart));

  const typeName = chart ? TYPE_META[chart.chart.type].nameRu : "Дизайн Человека";
  const profile = chart ? chart.chart.profile : "";
  const authority = chart ? AUTHORITY_NAMES_RU[chart.chart.authority] : "";
  const profileName = chart ? (PROFILE_NAMES_RU[chart.chart.profile] ?? "") : "";

  console.error("[hd-og] rendering");
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
    { ...size }
  );
}
