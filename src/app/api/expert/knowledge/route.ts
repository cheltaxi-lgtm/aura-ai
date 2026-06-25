import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { getBloggerBySlug } from "@/lib/session";
import { query } from "@/lib/db";

export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth || auth.role !== "expert") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content.trim().slice(0, 50_000) : "";
    const title =
      typeof body.title === "string" ? body.title.trim().slice(0, 200) : undefined;
    if (!content) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    const slug = auth.slug;
    if (!slug) {
      return NextResponse.json({ error: "Expert slug missing" }, { status: 400 });
    }

    const blogger = await getBloggerBySlug(slug);
    if (!blogger) {
      return NextResponse.json({ error: "Blogger profile not found" }, { status: 404 });
    }

    await query(
      "INSERT INTO blogger_knowledge (blogger_id, title, content) VALUES ($1, $2, $3)",
      [blogger.id, title ?? "Загрузка эксперта", content]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Knowledge upload error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
