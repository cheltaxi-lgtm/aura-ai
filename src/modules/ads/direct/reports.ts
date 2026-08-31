import { directApiUrl } from "./endpoint";

function reportsUrl(): string {
  return `${directApiUrl()}/reports`;
}

export async function fetchCustomReport(params: {
  dateFrom: string;
  dateTo: string;
  fieldNames: string[];
}): Promise<{ csv: string; units: string | null }> {
  const token = process.env.ADS_DIRECT_TOKEN;
  const login = process.env.ADS_DIRECT_LOGIN;
  if (!token) throw new Error("ADS_DIRECT_TOKEN missing");

  const body = {
    params: {
      SelectionCriteria: {
        DateFrom: params.dateFrom,
        DateTo: params.dateTo,
      },
      FieldNames: params.fieldNames,
      ReportName: `ads-autopilot-${params.dateFrom}-${Date.now()}`,
      ReportType: "CUSTOM_REPORT",
      DateRangeType: "CUSTOM_DATE",
      Format: "TSV",
      IncludeVAT: "YES",
      IncludeDiscount: "NO",
    },
  };

  for (let i = 0; i < 12; i++) {
    const res = await fetch(reportsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Login": login || "",
        "Accept-Language": "ru",
        "Content-Type": "application/json; charset=utf-8",
        processingMode: "auto",
        returnMoneyInMicros: "false",
        skipReportHeader: "true",
        skipReportSummary: "true",
      },
      body: JSON.stringify(body),
    });
    const units = res.headers.get("Units");
    if (res.status === 200) {
      return { csv: await res.text(), units };
    }
    if (res.status === 201 || res.status === 202) {
      await new Promise((r) => setTimeout(r, 2000 + i * 500));
      continue;
    }
    const errText = await res.text();
    throw new Error(`Reports failed ${res.status}: ${errText.slice(0, 200)}`);
  }
  throw new Error("Reports polling timeout");
}

export async function fetchSearchQueryReport(dateFrom: string, dateTo: string) {
  return fetchCustomReport({
    dateFrom,
    dateTo,
    fieldNames: [
      "Date",
      "CampaignId",
      "AdGroupId",
      "Criterion",
      "Query",
      "Impressions",
      "Clicks",
      "Cost",
    ],
  });
}
