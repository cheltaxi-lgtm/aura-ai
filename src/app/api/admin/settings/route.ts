import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAllSettings, setSetting } from "@/lib/settings";
import { invalidateMaintenanceModeCache } from "@/lib/maintenance-mode";
import { logAdminAction } from "@/lib/admin";

const NATAL_EPHEMERIS_BACKENDS = new Set(["celestine", "natalengine"]);

function isValidNatalChartSettings(
  values: unknown
): values is { enabled: boolean; ephemeris: "celestine" | "natalengine" } {
  if (!values || typeof values !== "object" || Array.isArray(values)) return false;

  const settings = values as Record<string, unknown>;
  return (
    Object.keys(settings).every((key) => key === "enabled" || key === "ephemeris") &&
    typeof settings.enabled === "boolean" &&
    typeof settings.ephemeris === "string" &&
    NATAL_EPHEMERIS_BACKENDS.has(settings.ephemeris)
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getAllSettings());
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { section, values } = await request.json();
  if (!section || !values || !["ai", "pricing", "features", "prompts", "tts", "visual", "runes", "share", "natalChart"].includes(section)) {
    return NextResponse.json({ error: "Invalid section" }, { status: 400 });
  }
  if (section === "natalChart" && !isValidNatalChartSettings(values)) {
    return NextResponse.json(
      {
        error:
          "Invalid natalChart settings: enabled must be boolean and ephemeris must be celestine or natalengine",
      },
      { status: 400 }
    );
  }

  const updated = await setSetting(section, values, auth.sub);
  if (section === "features") {
    invalidateMaintenanceModeCache();
  }
  await logAdminAction(auth.sub, "update_settings", section, section, values);
  return NextResponse.json({ ok: true, [section]: updated });
}
