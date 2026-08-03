import { directCall } from "./client";

export async function addAdGroup(input: {
  campaignId: number;
  name: string;
  regionIds?: number[];
}) {
  const { result } = await directCall<{ AddResults?: { Id?: number }[] }>(
    "adgroups",
    "add",
    {
      AdGroups: [
        {
          Name: input.name.slice(0, 255),
          CampaignId: input.campaignId,
          RegionIds: input.regionIds || [225],
        },
      ],
    },
    { mutate: true }
  );
  return result?.AddResults?.[0] || {};
}

export async function getAdGroups(campaignIds: number[]) {
  return directCall("adgroups", "get", {
    SelectionCriteria: { CampaignIds: campaignIds },
    FieldNames: ["Id", "Name", "CampaignId", "Status", "ServingStatus"],
  });
}
