import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { requireAdminStepUp } from "@/lib/admin-stepup";
import { getAllSettings, setSetting } from "@/lib/settings";
import { invalidateMaintenanceModeCache } from "@/lib/maintenance-mode";
import { logAdminAction } from "@/lib/admin";
import { validateAdminSettingsPatch } from "@/lib/admin-settings-validate";

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

function isValidEnabledOnlySettings(
  values: unknown
): values is { enabled: boolean } {
  if (!values || typeof values !== "object" || Array.isArray(values)) return false;
  const settings = values as Record<string, unknown>;
  return (
    Object.keys(settings).every((key) => key === "enabled") &&
    typeof settings.enabled === "boolean"
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getAllSettings());
}

export async function PATCH(request: NextRequest) {
  const stepped = await requireAdminStepUp(request);
  if (!stepped.ok) return stepped.response;
  const auth = stepped.auth;

  const { section, values } = await request.json();
  if (
    !section ||
    !values ||
    ![
      "ai",
      "aiDelivery",
      "pricing",
      "features",
      "prompts",
      "tts",
      "visual",
      "runes",
      "share",
      "natalChart",
      "humanDesign",
      "photoReading",
      "auraReading",
    ].includes(section)
  ) {
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
  if (section === "humanDesign" && !isValidEnabledOnlySettings(values)) {
    return NextResponse.json(
      { error: "Invalid humanDesign settings: enabled must be boolean" },
      { status: 400 }
    );
  }
  if (section === "photoReading" && !isValidEnabledOnlySettings(values)) {
    return NextResponse.json(
      { error: "Invalid photoReading settings: enabled must be boolean" },
      { status: 400 }
    );
  }
  if (section === "auraReading" && !isValidEnabledOnlySettings(values)) {
    return NextResponse.json(
      { error: "Invalid auraReading settings: enabled must be boolean" },
      { status: 400 }
    );
  }

  const validated = validateAdminSettingsPatch(section, values);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const updated = await setSetting(section, validated.values, auth.sub);
  if (section === "features") {
    invalidateMaintenanceModeCache();
  }
  await logAdminAction(auth.sub, "update_settings", section, section, validated.values);
  return NextResponse.json({ ok: true, [section]: updated });
}
