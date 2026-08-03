import { isAdsEnabled } from "@/modules/ads/config";
import AdsBeacon from "./AdsBeacon";

/** Server wrapper: omit beacon entirely when ads.enabled=false. */
export default async function AdsBeaconServer() {
  let enabled = false;
  try {
    enabled = await isAdsEnabled();
  } catch {
    enabled = false;
  }
  if (!enabled) return null;
  return <AdsBeacon enabled />;
}
