import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";

import { getProfileUserIdForAccount } from "@/lib/accounts";

import { requireUserAuth } from "@/lib/require-auth";

import {

  getSessionMemoryById,

  updateSessionOutcomeRating,

  deleteCabinetSessionEntry,

} from "@/lib/cabinet-data";



async function resolveProfileUserId() {

  const auth = await requireUserAuth();

  if (!auth) return null;

  if (!(await ensureDb())) return null;

  const profileUserId = await getProfileUserIdForAccount(auth.sub);

  if (!profileUserId) return null;

  return profileUserId;

}



export async function GET(

  _request: NextRequest,

  context: { params: Promise<{ id: string }> }

) {

  const profileUserId = await resolveProfileUserId();

  if (!profileUserId) {

    return NextResponse.json({ error: "Not found" }, { status: 404 });

  }



  const { id } = await context.params;

  const session = await getSessionMemoryById(profileUserId, id);

  if (!session) {

    return NextResponse.json({ error: "Not found" }, { status: 404 });

  }



  return NextResponse.json({ session });

}



export async function PATCH(

  request: NextRequest,

  context: { params: Promise<{ id: string }> }

) {

  const profileUserId = await resolveProfileUserId();

  if (!profileUserId) {

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  const { id } = await context.params;

  const body = await request.json().catch(() => ({}));

  const rating = Number(body.outcomeRating ?? body.rating);



  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {

    return NextResponse.json({ error: "invalid_rating" }, { status: 400 });

  }



  const ok = await updateSessionOutcomeRating(profileUserId, id, Math.round(rating));

  if (!ok) {

    return NextResponse.json({ error: "Not found" }, { status: 404 });

  }



  return NextResponse.json({ ok: true });

}



export async function DELETE(

  _request: NextRequest,

  context: { params: Promise<{ id: string }> }

) {

  const profileUserId = await resolveProfileUserId();

  if (!profileUserId) {

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  }



  const { id } = await context.params;

  if (!id) {

    return NextResponse.json({ error: "id required" }, { status: 400 });

  }



  const result = await deleteCabinetSessionEntry(profileUserId, id);

  if (!result.ok) {

    return NextResponse.json({ error: "Not found" }, { status: 404 });

  }



  return NextResponse.json({ ok: true, characterKey: result.characterKey ?? null });

}


