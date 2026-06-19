import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const SCENE_ART_DIR = path.join(process.cwd(), "public", "scene-art");

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  if (!/^[\w-]+\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const buffer = await readFile(path.join(SCENE_ART_DIR, filename));
    const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": MIME[ext] ?? "image/jpeg",
        "Cache-Control": "public, max-age=86400",
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
