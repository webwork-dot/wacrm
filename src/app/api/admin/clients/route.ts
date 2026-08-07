import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { toErrorResponse } from "@/lib/auth/account";
import { requirePlatformPermission } from "@/lib/auth/platform-admin";

function generateTempPassword(): string {
  // Readable temp password — client should change after first login.
  return randomBytes(9).toString("base64url").slice(0, 12);
}

/** GET /api/admin/clients — list client workspaces (not platform operators). */
export async function GET(request: Request) {
  try {
    const { admin } = await requirePlatformPermission("platform.clients.read");
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const status = url.searchParams.get("status");

    const { data: platformRows } = await admin
      .from("platform_users")
      .select("user_id")
      .eq("status", "active");
    const platformOwnerIds = new Set(
      (platformRows ?? []).map((r) => r.user_id as string),
    );

    let query = admin
      .from("accounts")
      .select(
        "id, name, display_name, status, created_at, owner_user_id, onboarding_completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (status === "active" || status === "suspended") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let clients = (data ?? []).filter(
      (c) => !platformOwnerIds.has(c.owner_user_id as string),
    );

    if (q) {
      clients = clients.filter((c) => {
        const name = String(
          (c as { display_name?: string }).display_name ||
            (c as { name?: string }).name ||
            "",
        ).toLowerCase();
        return name.includes(q);
      });
    }

    // Attach owner email for support
    const ownerIds = [
      ...new Set(clients.map((c) => c.owner_user_id as string).filter(Boolean)),
    ];
    const ownerEmailById: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, email")
        .in("user_id", ownerIds);
      for (const p of profiles ?? []) {
        ownerEmailById[p.user_id as string] = String(p.email ?? "");
      }
    }

    const ids = clients.map((c) => c.id as string);
    const metaById: Record<
      string,
      { whatsapp: boolean; ai: boolean; knowledge: boolean; automation: boolean }
    > = {};
    for (const id of ids) {
      metaById[id] = {
        whatsapp: false,
        ai: false,
        knowledge: false,
        automation: false,
      };
    }

    if (ids.length > 0) {
      const [wa, ai, kb, flows] = await Promise.all([
        admin
          .from("whatsapp_config")
          .select("account_id")
          .in("account_id", ids),
        admin.from("ai_configs").select("account_id").in("account_id", ids),
        admin
          .from("ai_knowledge_documents")
          .select("account_id")
          .in("account_id", ids),
        admin
          .from("flows")
          .select("account_id")
          .in("account_id", ids)
          .eq("status", "active"),
      ]);

      for (const row of wa.data ?? []) {
        const id = (row as { account_id: string }).account_id;
        if (metaById[id]) metaById[id].whatsapp = true;
      }
      for (const row of ai.data ?? []) {
        const id = (row as { account_id: string }).account_id;
        if (metaById[id]) metaById[id].ai = true;
      }
      for (const row of kb.data ?? []) {
        const id = (row as { account_id: string }).account_id;
        if (metaById[id]) metaById[id].knowledge = true;
      }
      for (const row of flows.data ?? []) {
        const id = (row as { account_id: string }).account_id;
        if (metaById[id]) metaById[id].automation = true;
      }
    }

    const enriched = clients.map((c) => ({
      ...c,
      name:
        (c as { display_name?: string }).display_name ||
        (c as { name: string }).name,
      owner_email: ownerEmailById[c.owner_user_id as string] ?? null,
      _meta: metaById[c.id as string] ?? {
        whatsapp: false,
        ai: false,
        knowledge: false,
        automation: false,
      },
    }));

    return NextResponse.json({ clients: enriched });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/admin/clients
 * Provision a client workspace + owner login.
 * Body: { companyName, ownerEmail, ownerName?, password? }
 */
export async function POST(request: Request) {
  try {
    const { admin, userId } = await requirePlatformPermission(
      "platform.clients.write",
    );
    const body = await request.json().catch(() => null);
    const companyName =
      typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const ownerEmail =
      typeof body?.ownerEmail === "string"
        ? body.ownerEmail.trim().toLowerCase()
        : "";
    const ownerName =
      typeof body?.ownerName === "string" ? body.ownerName.trim() : "";
    let password =
      typeof body?.password === "string" ? body.password.trim() : "";

    if (!companyName) {
      return NextResponse.json(
        { error: "Company name is required" },
        { status: 400 },
      );
    }
    if (!ownerEmail || !ownerEmail.includes("@")) {
      return NextResponse.json(
        { error: "A valid owner email is required" },
        { status: 400 },
      );
    }

    // Don't provision platform allowlist emails as clients
    const allow = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (allow.includes(ownerEmail)) {
      return NextResponse.json(
        { error: "That email is a platform operator — use a client email" },
        { status: 400 },
      );
    }

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("user_id, email")
      .ilike("email", ownerEmail)
      .maybeSingle();
    if (existingProfile) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 },
      );
    }

    const passwordGenerated = !password;
    if (!password) password = generateTempPassword();
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email: ownerEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: ownerName || companyName,
        },
      });

    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Could not create owner login" },
        { status: 500 },
      );
    }

    const ownerUserId = created.user.id;

    // Signup trigger creates a personal account — rename it to the company.
    const { data: profile } = await admin
      .from("profiles")
      .select("account_id")
      .eq("user_id", ownerUserId)
      .maybeSingle();

    let accountId = profile?.account_id as string | undefined;

    if (!accountId) {
      const { data: acct, error: acctErr } = await admin
        .from("accounts")
        .insert({
          name: companyName,
          display_name: companyName,
          owner_user_id: ownerUserId,
          status: "active",
        })
        .select("id")
        .single();
      if (acctErr || !acct) {
        await admin.auth.admin.deleteUser(ownerUserId);
        return NextResponse.json(
          { error: acctErr?.message ?? "Could not create workspace" },
          { status: 500 },
        );
      }
      accountId = acct.id;
      await admin.from("profiles").upsert({
        user_id: ownerUserId,
        email: ownerEmail,
        full_name: ownerName || companyName,
        account_id: accountId,
        account_role: "owner",
      });
    } else {
      const { error: updErr } = await admin
        .from("accounts")
        .update({
          name: companyName,
          display_name: companyName,
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId);
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      await admin
        .from("profiles")
        .update({
          full_name: ownerName || companyName,
          email: ownerEmail,
          account_role: "owner",
        })
        .eq("user_id", ownerUserId);
    }

    void admin.from("platform_events").insert({
      account_id: accountId,
      event_type: "admin.client.created",
      payload: {
        by: userId,
        companyName,
        ownerEmail,
      },
    });

    return NextResponse.json({
      success: true,
      client: {
        id: accountId,
        name: companyName,
        ownerEmail,
        status: "active",
      },
      credentials: {
        email: ownerEmail,
        password,
        passwordGenerated,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
