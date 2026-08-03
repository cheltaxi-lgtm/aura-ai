/**
 * Switch the model used for paid readings without touching the rest of ai settings.
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/set-paid-model.ts moonshotai/kimi-k2.5
 * Without an argument it only prints the current settings.
 */
import { getSetting, setSetting } from "../src/lib/settings";

async function main() {
  const next = process.argv[2];
  const current = await getSetting("ai");
  console.log("было:", JSON.stringify({ model: current.model, paidModel: current.paidModel, fallbackModels: current.fallbackModels }));

  if (!next) return;

  await setSetting("ai", { ...current, paidModel: next });
  const after = await getSetting("ai");
  console.log("стало:", JSON.stringify({ model: after.model, paidModel: after.paidModel, fallbackModels: after.fallbackModels }));
}

void main();
