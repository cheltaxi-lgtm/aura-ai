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
  if (!phrases.length) return { result: {}, units: null };
  return directCall(
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
}
