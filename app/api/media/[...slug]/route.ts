import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getProjectsRoot } from "@/lib/server/hospital-store";

export const runtime = "nodejs";

const mimeByExtension: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await context.params;
  const decoded = slug.map((segment) => decodeURIComponent(segment));
  const projectsRoot = getProjectsRoot();
  const targetPath = path.resolve(projectsRoot, ...decoded);

  if (!targetPath.startsWith(projectsRoot)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const bytes = await fs.readFile(targetPath);
    const extension = path.extname(targetPath).toLowerCase();
    const contentType = mimeByExtension[extension] ?? "application/octet-stream";

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
