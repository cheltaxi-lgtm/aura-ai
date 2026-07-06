import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import {
  deleteCabinetPhotoSpread,
  updateCabinetPhotoSpreadNote,
  MAX_PHOTO_SPREAD_NOTE_LENGTH,
} from "@/lib/cabinet-data";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "cabinet_notes");
  if (rateLimited) return rateLimited;

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  let notes = "";
  try {
    const body = await request.json();
    notes = typeof body.notes === "string" ? body.notes : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (notes.length > MAX_PHOTO_SPREAD_NOTE_LENGTH) {
    return NextResponse.json(
      { error: `Заметка не длиннее ${MAX_PHOTO_SPREAD_NOTE_LENGTH} символов` },
      { status: 400 }
    );
  }

  const result = await updateCabinetPhotoSpreadNote(profileUserId, id, notes);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, notes: notes.trim().slice(0, MAX_PHOTO_SPREAD_NOTE_LENGTH) });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const result = await deleteCabinetPhotoSpread(profileUserId, id);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, characterName: result.characterName ?? null });
}
