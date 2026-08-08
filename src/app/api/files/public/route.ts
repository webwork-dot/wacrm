import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { query } from "@/lib/db/pool";

const ROOT = path.resolve(process.cwd(), "storage", "uploads");

/**
 * Tokenized public file fetch for Meta media downloads (no session cookie).
 * Requires files.meta.public_token match.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  const token = url.searchParams.get("t") || "";
  if (!key || !token || key.includes("..")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { rows } = await query<{ object_key: string; mime_type: string | null }>(
      `SELECT object_key, mime_type FROM files
       WHERE object_key = $1
         AND deleted_at IS NULL
         AND metadata->>'public_token' = $2
       LIMIT 1`,
      [key, token],
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const abs = path.resolve(ROOT, key);
    if (!abs.startsWith(ROOT + path.sep)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    const data = await readFile(abs);
    return new NextResponse(data, {
      headers: {
        "Content-Type": rows[0].mime_type || "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
