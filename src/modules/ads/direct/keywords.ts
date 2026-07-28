import { directCall } from "./client";

export async function addKeywords(adGroupId: number, phrases: string[]) {
  if (!phrases.length) return { result: {}, units: null };
  return directCall(
    "keywords",
    "add",
    {
      Keywords: phrases.map((p) => ({
        AdGroupId: adGroupId,
        Keyword: p.slice(0, 4096),
      })),
    },
    { mutate: true }
  );
}

export async function addNegativeKeywords(campaignId: number, phrases: string[]) {
  // Stored via campaign negative keyword sets when available; fallback no-op log
  if (!phrases.length) return;
  try {
    await directCall(
      "negativekeywordsharedsets",
      "add",
      {
        NegativeKeywordSharedSets: [
          {
            Name: `ads-auto-${campaignId}`.slice(0, 60),
            NegativeKeywords: phrases.slice(0, 1000),
          },
        ],
      },
      { mutate: true }
    );
  } catch {
    /* sandbox / method may be unavailable — negatives also in ads.negative_keyword */
  }
}
