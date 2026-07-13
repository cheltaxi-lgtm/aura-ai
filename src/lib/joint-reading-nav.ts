import type { SpreadId } from "@/lib/spreads";

/** Home deep-link that opens the personal spread flow for a joint-reading invite. */
export function buildJointSpreadStartPath(params: {
  token: string;
  role: "initiator" | "partner";
  intentSlug: string;
  spreadId: SpreadId | string;
  initiatorName?: string | null;
  partnerName?: string | null;
}): string {
  const qs = new URLSearchParams();
  qs.set("step", "masters");
  qs.set("intent", params.intentSlug);
  qs.set("spread", String(params.spreadId));
  qs.set("joint", params.token);
  qs.set("jointRole", params.role);
  if (params.role === "partner" && params.initiatorName?.trim()) {
    qs.set("jointInvite", params.initiatorName.trim());
  }
  if (params.role === "initiator" && params.partnerName?.trim()) {
    qs.set("jointPartnerName", params.partnerName.trim());
  }
  return `/?${qs.toString()}`;
}

export function isJointSpreadStartUrl(search: string): boolean {
  const params = new URLSearchParams(search);
  const token = params.get("joint")?.trim();
  const role = params.get("jointRole")?.trim();
  return Boolean(token && (role === "initiator" || role === "partner"));
}
