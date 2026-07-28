import { directCall } from "./client";

export async function getCampaigns() {
  return directCall<{ Campaigns?: { Id: number; Name: string; State: string; Status: string }[] }>(
    "campaigns",
    "get",
    {
      SelectionCriteria: {},
      FieldNames: ["Id", "Name", "State", "Status", "DailyBudget", "Currency"],
    }
  );
}

export async function pauseCampaigns(ids: number[]) {
  if (!ids.length) return { result: {}, units: null };
  return directCall("campaigns", "suspend", { SelectionCriteria: { Ids: ids } }, { mutate: true });
}

export async function resumeCampaigns(ids: number[]) {
  if (!ids.length) return { result: {}, units: null };
  return directCall("campaigns", "resume", { SelectionCriteria: { Ids: ids } }, { mutate: true });
}

export async function addTextCampaign(input: {
  name: string;
  dailyBudgetRub: number;
}): Promise<{ Id?: number }> {
  const micros = Math.round(input.dailyBudgetRub * 1_000_000);
  const { result } = await directCall<{ AddResults?: { Id?: number }[] }>(
    "campaigns",
    "add",
    {
      Campaigns: [
        {
          Name: input.name.slice(0, 255),
          StartDate: new Date().toISOString().slice(0, 10),
          TextCampaign: {
            BiddingStrategy: {
              Search: {
                BiddingStrategyType: "AVERAGE_CPA",
                AverageCpa: {
                  AverageCpa: Math.round(150 * 1_000_000),
                  GoalId: Number(process.env.ADS_GOAL_REGISTRATION || 0) || undefined,
                },
              },
              Network: { BiddingStrategyType: "SERVING_OFF" },
            },
            Settings: [],
          },
          DailyBudget: { Amount: micros, Mode: "STANDARD" },
        },
      ],
    },
    { mutate: true }
  );
  return result?.AddResults?.[0] || {};
}
