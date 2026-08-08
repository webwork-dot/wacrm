import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getRequestUser } from "@/lib/auth/session-cookies";
import { query } from "@/lib/db/pool";

const ROOT = path.resolve(process.cwd(), "storage", "uploads");

function contentTypeFor(abs: string): string {
  const ext = path.extname(abs).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

async function serve(abs: string, asAttachment = false) {
  const data = await readFile(abs);
  const type = contentTypeFor(abs);
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
  if (asAttachment || type === "application/octet-stream" || type === "application/pdf") {
    headers["Content-Disposition"] = "attachment";
  }
  return new NextResponse(data, { headers });
}

export async function GET(req: Request) {
  const user = await getRequestUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rel = (url.searchParams.get("path") || "").replace(/\0/g, "");
  if (!rel || rel.includes("..")) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Ownership: prefer files table; fall back to path prefix userId/
  try {
    const { rows } = await query<{ uploaded_by: string; account_id: string | null }>(
      `SELECT uploaded_by, account_id FROM files WHERE object_key = $1 AND deleted_at IS NULL LIMIT 1`,
      [rel],
    );
    const row = rows[0];
    if (row) {
      if (row.uploaded_by === user.id) {
        return serve(abs);
      }
      if (row.account_id) {
        const { rows: mem } = await query<{ ok: number }>(
          `SELECT 1 AS ok FROM profiles WHERE user_id = $1 AND account_id = $2 LIMIT 1`,
          [user.id, row.account_id],
        );
        if (!mem[0]) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      // Legacy path: bucket/userId/...
      const parts = rel.split("/");
      if (parts.length < 2 || parts[1] !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } catch {
    const parts = rel.split("/");
    if (parts.length < 2 || parts[1] !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    return await serve(abs);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
