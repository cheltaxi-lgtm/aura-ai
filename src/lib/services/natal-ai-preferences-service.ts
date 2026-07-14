import { query } from "@/lib/db";
import type { NatalAiPreferences } from "@/lib/natal/ai-context-consent";

export type { NatalAiPreferences } from "@/lib/natal/ai-context-consent";

type Row = {
  ai_context_enabled: boolean;
  tarot_context_enabled: boolean;
};

export async function getNatalAiPreferences(userId: string): Promise<NatalAiPreferences> {
  const { rows } = await query<Row>(
    `SELECT ai_context_enabled, tarot_context_enabled
     FROM natal_ai_preferences
     WHERE user_id = $1`,
    [userId]
  );
  return {
    aiContextEnabled: rows[0]?.ai_context_enabled === true,
    tarotContextEnabled: rows[0]?.tarot_context_enabled === true,
  };
}

export async function updateNatalAiPreferences(
  userId: string,
  value: unknown
): Promise<NatalAiPreferences> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_NATAL_AI_PREFERENCES");
  }
  const patch = value as Record<string, unknown>;
  const allowedKeys = new Set(["aiContextEnabled", "tarotContextEnabled"]);
  const keys = Object.keys(patch);
  if (
    keys.length === 0 ||
    keys.some((key) => !allowedKeys.has(key)) ||
    ("aiContextEnabled" in patch && typeof patch.aiContextEnabled !== "boolean") ||
    ("tarotContextEnabled" in patch && typeof patch.tarotContextEnabled !== "boolean")
  ) {
    throw new Error("INVALID_NATAL_AI_PREFERENCES");
  }
  const { rows } = await query<Row>(
    `INSERT INTO natal_ai_preferences (
       user_id, ai_context_enabled, tarot_context_enabled, updated_at
     )
     VALUES ($1, COALESCE($2::boolean, FALSE), COALESCE($3::boolean, FALSE), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       ai_context_enabled = COALESCE($2::boolean, natal_ai_preferences.ai_context_enabled),
       tarot_context_enabled = COALESCE($3::boolean, natal_ai_preferences.tarot_context_enabled),
       updated_at = NOW()
     RETURNING ai_context_enabled, tarot_context_enabled`,
    [
      userId,
      typeof patch.aiContextEnabled === "boolean" ? patch.aiContextEnabled : null,
      typeof patch.tarotContextEnabled === "boolean" ? patch.tarotContextEnabled : null,
    ]
  );
  return {
    aiContextEnabled: rows[0]?.ai_context_enabled === true,
    tarotContextEnabled: rows[0]?.tarot_context_enabled === true,
  };
}
