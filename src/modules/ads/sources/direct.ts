/**
 * Read-only Direct account snapshot (works with balance 0).
 */
import { directCall } from "../direct/client";
import { isDirectSandbox } from "../direct/endpoint";
import { getCampaigns } from "../direct/campaigns";

export type DirectSnapshot = {
  login: string | null;
  currency: string | null;
  balanceRub: number | null;
  balanceSource: "v4_account" | "unavailable" | null;
  weeklySpendLimitRub: number | null;
  units: string | null;
  campaigns: {
    id: number;
    name: string;
    state: string;
    status: string;
    dailyBudgetRub: number | null;
  }[];
  sandbox: boolean;
};

async function tryBalanceV4(): Promise<number | null> {
  const token = process.env.ADS_DIRECT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch("https://api.direct.yandex.ru/live/v4/json/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        method: "AccountManagement",
        token,
        param: { Action: "Get" },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { Accounts?: { Amount?: string | number; AmountAvailable?: string | number }[] };
      error_code?: number;
    };
    const acc = json.data?.Accounts?.[0];
    if (!acc) return null;
    const raw = acc.AmountAvailable ?? acc.Amount;
    if (raw == null) return null;
    const n = Number(raw);
    // v4 amounts are often in currency units already; some accounts use micros — clamp sanity
    if (!Number.isFinite(n)) return null;
    if (n > 1_000_000_000) return n / 1_000_000;
    return n;
  } catch {
    return null;
  }
}

export async function fetchDirectSnapshot(): Promise<DirectSnapshot> {
  const login = process.env.ADS_DIRECT_LOGIN || null;
  const sandbox = isDirectSandbox();

  let currency: string | null = null;
  try {
    const { result } = await directCall<{
      Clients?: { Login?: string; Currency?: string }[];
    }>("clients", "get", {
      FieldNames: ["Login", "Currency", "ClientInfo", "VatRate"],
    });
    currency = result?.Clients?.[0]?.Currency || null;
  } catch {
    /* clients.get may be restricted — continue */
  }

  const { result, units } = await getCampaigns();
  const campaigns = (result?.Campaigns || []).map((c) => {
    const row = c as {
      Id: number;
      Name: string;
      State: string;
      Status: string;
      DailyBudget?: { Amount?: number };
      Currency?: string;
    };
    if (row.Currency) currency = row.Currency;
    const micros = row.DailyBudget?.Amount;
    return {
      id: row.Id,
      name: row.Name,
      state: row.State,
      status: row.Status,
      dailyBudgetRub: micros != null ? micros / 1_000_000 : null,
    };
  });

  const balanceRub = await tryBalanceV4();

  return {
    login,
    currency,
    balanceRub,
    balanceSource: balanceRub != null ? "v4_account" : "unavailable",
    weeklySpendLimitRub: null,
    units,
    campaigns,
    sandbox,
  };
}
