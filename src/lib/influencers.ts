import crypto from "crypto";
import { query } from "./db";

export interface InfluencerRow {
  id: string;
  name: string;
  token: string;
  telegram_link: string | null;
  custom_prompt: string | null;
  balance: string;
}

function generateToken(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${slug || "blogger"}_${suffix}`;
}

export async function registerInfluencer(data: {
  name: string;
  telegramLink?: string;
  customPrompt?: string;
}): Promise<InfluencerRow & { refUrl: string }> {
  const token = generateToken(data.name);

  const { rows } = await query<InfluencerRow>(
    `INSERT INTO influencers (name, token, telegram_link, custom_prompt)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, token, telegram_link, custom_prompt, balance::text`,
    [data.name.trim(), token, data.telegramLink ?? null, data.customPrompt ?? null]
  );

  const influencer = rows[0];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://auraai.ru";
  const refUrl = `${appUrl}/?ref=${influencer.token}`;

  await query(
    `INSERT INTO bloggers (slug, display_name, split_percent, style_notes, influencer_id)
     VALUES ($1, $2, 80, $3, $4)
     ON CONFLICT (slug) DO NOTHING`,
    [token, data.name.trim(), data.customPrompt ?? null, influencer.id]
  );

  return { ...influencer, refUrl };
}

export async function getInfluencerByToken(token: string): Promise<InfluencerRow | null> {
  const { rows } = await query<InfluencerRow>(
    `SELECT id, name, token, telegram_link, custom_prompt, balance::text
     FROM influencers WHERE token = $1`,
    [token]
  );
  return rows[0] ?? null;
}

export async function recordInfluencerClick(influencerId: string, sessionId?: string) {
  await query(
    `INSERT INTO influencer_clicks (influencer_id, session_id) VALUES ($1, $2)`,
    [influencerId, sessionId ?? null]
  );
}

export async function creditInfluencerBalance(influencerId: string, amount: number, splitPercent = 80) {
  const bloggerShare = (amount * splitPercent) / 100;
  await query(
    `UPDATE influencers SET balance = balance + $2 WHERE id = $1`,
    [influencerId, bloggerShare]
  );
}
