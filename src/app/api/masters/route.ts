import { NextResponse } from "next/server";
import { listShowcaseMasters } from "@/lib/masters";

export async function GET() {
  const masters = await listShowcaseMasters();
  return NextResponse.json({
    masters: masters.map((m) => ({
      id: m.id,
      slug: m.slug,
      kind: m.kind,
      name: m.name,
      title: m.title,
      specialty: m.specialty,
      style: m.style,
      emoji: m.emoji,
      gradient: m.gradient,
      glowColor: m.glowColor,
      borderColor: m.borderColor,
      priceFrom: m.priceFrom,
      rating: m.rating,
      sessions: m.sessions,
      profilePath: m.profilePath,
    })),
    counts: {
      total: masters.length,
      ai: masters.filter((m) => m.kind === "ai").length,
      human: masters.filter((m) => m.kind === "human").length,
    },
  });
}
