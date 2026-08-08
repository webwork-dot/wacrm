import { NextResponse } from "next/server";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { query } from "@/lib/db/pool";
import { normalizeConversation } from "@/lib/inbox/conversations";

/**
 * GET /api/inbox/conversations
 * Account-scoped conversation list with contact + tags joined in SQL
 * (replaces PostgREST embed selects that the pg shim cannot express).
 */
export async function GET() {
  try {
    const { accountId } = await getCurrentAccount();

    const { rows } = await query(`
      SELECT
        c.*,
        row_to_json(ct.*) AS contact,
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', t.id,
              'name', t.name,
              'color', t.color
            ))
            FROM contact_tags ctag
            INNER JOIN tags t ON t.id = ctag.tag_id
            WHERE ctag.contact_id = c.contact_id
          ),
          '[]'::json
        ) AS contact_tags
      FROM conversations c
      LEFT JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.account_id = $1
      ORDER BY c.is_pinned DESC NULLS LAST,
               c.last_message_at DESC NULLS LAST
      LIMIT 500
    `, [accountId]);

    const conversations = rows.map((row) => {
      const contact = row.contact
        ? {
            ...(row.contact as Record<string, unknown>),
            tags: row.contact_tags ?? [],
          }
        : null;
      const { contact: _c, contact_tags: _t, ...rest } = row as Record<
        string,
        unknown
      >;
      return normalizeConversation({
        ...rest,
        contact,
      } as Parameters<typeof normalizeConversation>[0]);
    });

    return NextResponse.json({ conversations });
  } catch (err) {
    return toErrorResponse(err);
  }
}
