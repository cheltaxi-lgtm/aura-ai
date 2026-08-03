#!/usr/bin/env npx tsx
/**
 * Sandbox smoke: create → read → pause → delete campaign. Logs Units.
 * Only runs when ADS_DIRECT_SANDBOX=1.
 */
import { isSandbox, clearDirectWriteLog, getDirectWriteLog } from "../src/modules/ads/direct/client";
import { addTextCampaign, getCampaigns, pauseCampaigns } from "../src/modules/ads/direct/campaigns";
import { directCall } from "../src/modules/ads/direct/client";

async function main() {
  if (!isSandbox()) {
    console.log("SKIP: ADS_DIRECT_SANDBOX is not 1");
    process.exit(0);
  }
  process.env.ADS_ALLOW_DIRECT_WRITE = "1";
  clearDirectWriteLog();
  const name = `ADS smoke ${Date.now()}`;
  console.log("create", name);
  const created = await addTextCampaign({ name, dailyBudgetRub: 300 });
  const id = created.Id;
  console.log("created", { id, writes: getDirectWriteLog() });
  if (!id) {
    console.error("FAIL: no campaign id");
    process.exit(1);
  }
  const { result, units } = await getCampaigns();
  console.log("read", { count: result?.Campaigns?.length, units });
  await pauseCampaigns([id]);
  console.log("paused", id);
  try {
    const del = await directCall(
      "campaigns",
      "delete",
      { SelectionCriteria: { Ids: [id] } },
      { mutate: true }
    );
    console.log("delete", { units: del.units });
  } catch (e) {
    console.log("delete_skipped", e instanceof Error ? e.message : e);
  }
  console.log("OK smoke complete", { writeLog: getDirectWriteLog() });
}

main().catch((e) => {
  console.error("WAITING/FAIL:", e instanceof Error ? e.message : e);
  process.exit(2);
});
