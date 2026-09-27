import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { getUserActivationContext } from "@/lib/activation-store";
import { recordActivationEvent, type ActivationProduct } from "@/lib/activation-telemetry";
import { resolveOAuthOrigin } from "@/lib/oauth/config";

export async function GET() {
  const ctx=await requireProfileUserId();
  if (!ctx) return NextResponse.json({error:"auth_required"},{status:401});
  const limited=await enforcePaidRouteRateLimit(ctx.auth.sub,"spread_metrics");
  if (limited) return limited;
  const context=await getUserActivationContext(ctx.profileUserId);
  if (!context) return NextResponse.json({error:"account_unavailable"},{status:403});
  return NextResponse.json(context,{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request: NextRequest) {
  const ctx=await requireProfileUserId();
  if (!ctx) return NextResponse.json({error:"auth_required"},{status:401});
  if (request.headers.get("origin") !== resolveOAuthOrigin(request)) return NextResponse.json({error:"origin_required"},{status:403});
  const limited=await enforcePaidRouteRateLimit(ctx.auth.sub,"spread_metrics");
  if (limited) return limited;
  const body=await request.json().catch(()=>null);
  if (!body || !["tarot","daily","aura","palm"].includes(body.product)
    || !["offer_shown","offer_clicked","network_failed"].includes(body.event)
    || typeof body.key!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.key))
    return NextResponse.json({error:"invalid_event"},{status:400});
  await recordActivationEvent(ctx.profileUserId,body.product as ActivationProduct,body.event,body.key);
  return NextResponse.json({ok:true});
}
