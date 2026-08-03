/**
 * Flag gating tests. Run via: npm test
 */
import { migrate } from "../../db/client.js";
import { ensureCriticalColumns, migrateUp } from "../../db/migrate-runner.js";
import { setFlag } from "../../db/repos.js";
import {
  isBotEnabled,
  isDayCardEnabled,
  isLlmEnabled,
  isRemindersEnabled,
  isRitualRevealEnabled,
  isShareCardEnabled,
  isTtsEnabled,
  isWeeklyDigestEnabled,
} from "../../flags.js";
import { ctaKeyboard } from "../../keyboards/index.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function keyboardHasShare(kb: ReturnType<typeof ctaKeyboard>): boolean {
  const json = JSON.stringify(kb.inline_keyboard);
  return json.includes("share:spread") || json.includes("Поделиться");
}

function main(): void {
  migrate();
  migrateUp();
  ensureCriticalColumns();

  setFlag("share_card_enabled", true);
  assert(isShareCardEnabled(), "share on");
  assert(keyboardHasShare(ctaKeyboard("https://zovus.ru")), "share button when enabled");

  setFlag("share_card_enabled", false);
  assert(!isShareCardEnabled(), "share off");
  assert(!keyboardHasShare(ctaKeyboard("https://zovus.ru")), "no share button when disabled");

  // Restore share for other tests / running bot
  setFlag("share_card_enabled", true);

  setFlag("bot_enabled", false);
  assert(!isBotEnabled(), "bot_enabled read");
  setFlag("bot_enabled", true);

  setFlag("day_card_enabled", false);
  assert(!isDayCardEnabled(), "day_card_enabled read");
  setFlag("day_card_enabled", true);

  setFlag("reminders_enabled", false);
  assert(!isRemindersEnabled(), "reminders_enabled read");
  setFlag("reminders_enabled", true);

  setFlag("ritual_reveal_enabled", false);
  assert(!isRitualRevealEnabled(), "ritual_reveal_enabled read");
  setFlag("ritual_reveal_enabled", true);

  setFlag("tts_enabled", false);
  assert(!isTtsEnabled(), "tts_enabled read");
  setFlag("tts_enabled", true);

  setFlag("llm_enabled", false);
  assert(!isLlmEnabled(), "llm_enabled read");
  setFlag("llm_enabled", true);

  // Declared flag — readable, no product consumer yet
  setFlag("weekly_digest_enabled", true);
  assert(isWeeklyDigestEnabled(), "weekly_digest_enabled readable");
  setFlag("weekly_digest_enabled", false);

  console.log("ok: flags share on/off + all declared flags readable");
}

main();
