import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getRequestUser } from "@/lib/auth/session-cookies";
import { query } from "@/lib/db/pool";

const ROOT = path.resolve(process.cwd(), "storage", "uploads");
const ALLOWED_BUCKETS = new Set(["uploads", "chat-media", "flow-media", "avatars"]);
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
  "video/mp4",
]);

export async function POST(req: Request) {
  const user = await getRequestUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const bucketRaw = String(form.get("bucket") || "uploads");
  const bucket = bucketRaw.replace(/[^a-z0-9_-]/gi, "");
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  if (!file.type || !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  const maxBytes = 15 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
  }

  const ext =
    file.name.includes(".") && file.name.split(".").pop()
      ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
      : "bin";
  const safeRel = `${user.id}/${randomUUID()}.${ext || "bin"}`;
  const abs = path.resolve(ROOT, bucket, safeRel);
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  await mkdir(path.dirname(abs), { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(abs, buf);

  const objectKey = `${bucket}/${safeRel}`;
  let accountId: string | null = null;
  try {
    const { rows } = await query<{ account_id: string | null }>(
      `SELECT account_id FROM profiles WHERE user_id = $1`,
      [user.id],
    );
    accountId = rows[0]?.account_id ?? null;
    await query(
      `INSERT INTO files (account_id, uploaded_by, bucket, object_key, original_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [accountId, user.id, bucket, objectKey, file.name, file.type || null, file.size],
    );
  } catch {
    /* files table optional on partial migrate */
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const token = randomUUID();
  // Public Meta-reachable URL uses signed query; store token in object path metadata via files table when present.
  try {
    await query(
      `UPDATE files SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE object_key = $1`,
      [objectKey, JSON.stringify({ public_token: token })],
    );
  } catch {
    /* ignore */
  }

  const publicUrl = site
    ? `${site}/api/files/public?key=${encodeURIComponent(objectKey)}&t=${token}`
    : `/api/files/raw?path=${encodeURIComponent(objectKey)}`;

  return NextResponse.json({ path: objectKey, publicUrl });
}
