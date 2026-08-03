import { directCall } from "./client";

export async function addTextAd(input: {
  adGroupId: number;
  title: string;
  title2?: string;
  text: string;
  href: string;
}) {
  const { result } = await directCall<{ AddResults?: { Id?: number }[] }>(
    "ads",
    "add",
    {
      Ads: [
        {
          AdGroupId: input.adGroupId,
          TextAd: {
            Title: input.title.slice(0, 56),
            Title2: (input.title2 || "").slice(0, 30) || undefined,
            Text: input.text.slice(0, 81),
            Href: input.href,
          },
        },
      ],
    },
    { mutate: true }
  );
  return result?.AddResults?.[0] || {};
}

export async function getAds(adGroupIds: number[]) {
  return directCall("ads", "get", {
    SelectionCriteria: { AdGroupIds: adGroupIds },
    FieldNames: ["Id", "AdGroupId", "Status", "State", "StatusClarification"],
  });
}
