import { copyCampaignParams } from "@/lib/utm/marketing-url";

/** One daily artifact, including the aliases used by previously sent emails. */
export function dailyAuthReturn(search: string): { returnTo: string; returning: boolean } {
  const source = new URLSearchParams(search);
  const extended = source.get("daily") === "extended" || source.get("spread") === "daily-extended";
  const target = new URLSearchParams({ daily: extended ? "extended" : "1" });
  copyCampaignParams(target, search);
  return {
    returnTo: `/?${target}`,
    returning: source.get("utm_medium") === "email" || source.get("dailyCards") === "1" || source.get("dailyCards") === "true",
  };
}
