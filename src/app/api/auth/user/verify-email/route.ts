import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { query } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendBonusEmailVerification, verifyBonusEmail } from "@/lib/bonus-email-verification";
export async function GET() {
  const auth=await requireUserAuth();
  if (!auth) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {rows}=await query<{required:boolean}>("SELECT bonus_email_verification_required AS required FROM user_accounts WHERE id=$1",[auth.sub]);
  return NextResponse.json({required:rows[0]?.required??false},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:NextRequest) {
  const auth=await requireUserAuth();
  if (!auth) return NextResponse.json({error:"Войдите в аккаунт, в котором запрашивали подтверждение."},{status:401});
  const body=await request.json().catch(()=>({}));
  const token=typeof body.token==="string" ? body.token : null;
  const rate=await checkRateLimit(`bonus-email:${token?"verify":"send"}:${auth.sub}`,token?10:3,token?60_000:3_600_000);
  if (!rate.allowed) return NextResponse.json({error:"Слишком много попыток. Попробуйте позже."},{status:429});
  try {
    if (token) {
      const grant=await verifyBonusEmail(auth.sub,token);
      return NextResponse.json({ok:true,granted:grant?.granted??0,newBalance:grant?.balance});
    }
    const sent=await sendBonusEmailVerification(auth.sub);
    return NextResponse.json(sent?{ok:true}:{error:"Не удалось отправить письмо. Попробуйте позже."},{status:sent?200:503});
  } catch (error) {
    if (token && error instanceof Error && (error.message==="invalid_verification" || "code" in error && String(error.code).startsWith("ERR_J"))) {
      return NextResponse.json({error:"Ссылка недействительна или истекла. Запросите новую в кабинете."},{status:400});
    }
    console.error("Bonus email verification failed",error instanceof Error?error.name:"unknown");
    return NextResponse.json({error:"Не удалось завершить подтверждение. Повторите попытку."},{status:503});
  }
}
