import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 42%, #3D2858 0%, #1A0F2E 55%, #07050F 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 320,
            height: 320,
            borderRadius: 72,
            border: "6px solid #C9A24A",
            fontSize: 200,
            fontWeight: 700,
            fontFamily: "serif",
            color: "#E8C77E",
          }}
        >
          Z
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
