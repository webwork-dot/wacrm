import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  getSubscribedApps,
  canInferCloudApiRegistration,
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

/**
 * Resolve the caller's account_id from their profile. Inlined here
 * (rather than going through `@/lib/auth/account.getCurrentAccount`)
 * because the GET handler wants to return shaped 200s for every
 * non-auth failure mode, not throw — keeping the helper minimal lets
 * the existing response branches stay as-is.
 *
 * Returns null if the user has no profile or no account; callers
 * should treat that the same as "not connected".
 */
async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

// Lazy-initialised service-role client. We need it to detect a
// phone_number_id already claimed by a *different* user — under RLS,
// the user's own session can't see other users' rows, so the conflict
// would be invisible without the service role.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

/**
 * GET /api/whatsapp/config
 *
 * Used by the "Test API Connection" button and by the page to check
 * whether the saved config is healthy. Returns 200 in all non-auth cases
 * so the UI can render an appropriate message rather than show a 500.
 *
 * Response shape:
 *   { connected: true,  phone_info: {...} }
 *   { connected: false, reason: 'no_config',        message: '...' }
 *   { connected: false, reason: 'token_corrupted',  message: '...', needs_reset: true }
 *   { connected: false, reason: 'meta_api_error',   message: '...' }
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_account',
          message: 'Your profile is not linked to an account.',
        },
        { status: 200 },
      )
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token, status, waba_id, registered_at, subscribed_apps_at')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError) {
      console.error('Error fetching whatsapp_config:', configError)
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Failed to fetch configuration' },
        { status: 200 }
      )
    }

    if (!config) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_config',
          message: 'No WhatsApp configuration saved yet. Fill in the form and click Save Configuration.',
        },
        { status: 200 }
      )
    }

    // Try to decrypt the stored token with the current ENCRYPTION_KEY.
    // If this fails, the key changed (or was never consistent across envs).
    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch (err) {
      console.error('[whatsapp/config GET] Token decryption failed:', err)
      return NextResponse.json(
        {
          connected: false,
          reason: 'token_corrupted',
          needs_reset: true,
          message:
            'The stored access token cannot be decrypted with the current ENCRYPTION_KEY. This usually means the key changed, or it differs between environments (local vs Hostinger vs Vercel). Click "Reset Configuration" below, then re-save.',
        },
        { status: 200 }
      )
    }

    // Validate credentials against Meta
    try {
      const phoneInfo = await verifyPhoneNumber({
        phoneNumberId: config.phone_number_id,
        accessToken,
      })

      let waba_subscribed: boolean | null = null
      let waba_error: string | null = null
      if (config.waba_id) {
        try {
          const apps = await getSubscribedApps({
            wabaId: config.waba_id,
            accessToken,
          })
          waba_subscribed = apps.length > 0
          if (!waba_subscribed) {
            waba_error =
              'WABA has no subscribed apps. Re-save configuration to subscribe this app.'
          }
        } catch (err) {
          waba_subscribed = false
          waba_error =
            err instanceof Error ? err.message : 'WABA subscription check failed'
        }
      } else {
        waba_error = 'No WABA ID saved — inbound webhooks cannot be wired.'
      }

      return NextResponse.json({
        connected: true,
        phone_info: phoneInfo,
        registered: config.registered_at != null,
        waba_subscribed,
        waba_error,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[whatsapp/config GET] Meta API verification failed:', message)
      return NextResponse.json(
        {
          connected: false,
          reason: 'meta_api_error',
          message: `Meta API rejected the credentials: ${message}`,
        },
        { status: 200 }
      )
    }
  } catch (error) {
    console.error('Error in WhatsApp config GET:', error)
    return NextResponse.json(
      { connected: false, reason: 'unknown', message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/whatsapp/config
 *
 * Saves or updates the WhatsApp config for the authenticated user.
 * Verifies credentials with Meta first, then encrypts and stores.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const { phone_number_id, waba_id, access_token, verify_token, pin } = body

    if (!phone_number_id) {
      return NextResponse.json(
        { error: 'phone_number_id is required' },
        { status: 400 }
      )
    }

    if (pin !== undefined && pin !== null && pin !== '') {
      if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return NextResponse.json(
          { error: 'PIN must be exactly 6 digits.' },
          { status: 400 }
        )
      }
    }

    // Reject if another account has already claimed this phone_number_id.
    // wacrm is single-tenant-per-WhatsApp-number — letting two accounts
    // bind the same number causes the webhook's `.single()` lookup to
    // throw PGRST116 ("multiple rows"), silently dropping every
    // inbound message. See issue #136. Post-multi-user we key on
    // account_id (not user_id) since teammates inside the same account
    // all share one config; the conflict is between accounts.
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', phone_number_id)
      .neq('account_id', accountId)
      .maybeSingle()

    if (claimedError) {
      console.error('Error checking phone_number_id ownership:', claimedError)
      return NextResponse.json(
        { error: 'Failed to validate configuration' },
        { status: 500 }
      )
    }

    if (claimed) {
      return NextResponse.json(
        {
          error:
            'This WhatsApp phone number is already linked to another account on this instance. Each phone number can only be connected to one wacrm user.',
        },
        { status: 409 }
      )
    }

    const { data: existing } = await supabase
      .from('whatsapp_config')
      .select('id, registered_at, phone_number_id, access_token, verify_token, subscribed_apps_at')
      .eq('account_id', accountId)
      .maybeSingle()

    let plaintextToken: string
    if (typeof access_token === 'string' && access_token.trim()) {
      plaintextToken = access_token.trim()
    } else if (existing?.access_token) {
      try {
        plaintextToken = decrypt(existing.access_token)
      } catch (err) {
        console.error('[whatsapp/config POST] Stored token decrypt failed:', err)
        return NextResponse.json(
          {
            error:
              'Stored access token cannot be decrypted. Re-enter the Permanent Access Token and save again.',
          },
          { status: 400 },
        )
      }
    } else {
      return NextResponse.json(
        { error: 'access_token is required for initial setup' },
        { status: 400 },
      )
    }

    // Verify credentials with Meta BEFORE saving
    let phoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId: phone_number_id,
        accessToken: plaintextToken,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('Meta API verification failed during save:', message)
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 400 }
      )
    }

    // Encrypt sensitive tokens before storing. Omitting verify_token
    // keeps the existing ciphertext so a re-save doesn't wipe webhook
    // verification. Sending a non-empty string updates it.
    let encryptedAccessToken: string
    let encryptedVerifyToken: string | null
    try {
      encryptedAccessToken =
        typeof access_token === 'string' && access_token.trim()
          ? encrypt(plaintextToken)
          : (existing?.access_token as string)
      if (typeof verify_token === 'string' && verify_token.trim()) {
        encryptedVerifyToken = encrypt(verify_token.trim())
      } else if (existing) {
        encryptedVerifyToken = existing.verify_token ?? null
      } else {
        encryptedVerifyToken = null
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown encryption error'
      console.error('Encryption failed:', message)
      return NextResponse.json(
        {
          error:
            'Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string in your environment variables.',
        },
        { status: 500 }
      )
    }

    const sameNumber =
      existing?.phone_number_id === phone_number_id &&
      existing?.registered_at != null
    const pinProvided = typeof pin === 'string' && /^\d{6}$/.test(pin)

    let registeredAt: string | null = existing?.registered_at ?? null
    let registrationError: string | null = null
    let registrationSkipped = false
    let registrationInferred = false

    if (pinProvided) {
      try {
        await registerPhoneNumber({
          phoneNumberId: phone_number_id,
          accessToken: plaintextToken,
          pin,
        })
        registeredAt = new Date().toISOString()
      } catch (err) {
        registrationError =
          err instanceof Error ? err.message : 'Unknown Meta API error'
        console.error('Phone number /register failed:', registrationError)
        if (!sameNumber) registeredAt = null
      }
    }

    // Subscribe the WABA to this app. Keep a previous success timestamp
    // if this call fails — wiping it made diagnostics lie after a blip.
    let subscribedAppsAt: string | null = existing?.subscribed_apps_at ?? null
    let subscriptionError: string | null = null
    if (waba_id) {
      try {
        await subscribeWabaToApp({
          wabaId: waba_id,
          accessToken: plaintextToken,
        })
        subscribedAppsAt = new Date().toISOString()
      } catch (err) {
        subscriptionError =
          err instanceof Error ? err.message : String(err)
        console.warn('WABA subscribed_apps failed:', subscriptionError)
      }
    } else {
      subscriptionError =
        'WABA ID is required to receive inbound webhooks. Add your WhatsApp Business Account ID and save again.'
    }

    // No PIN: if Meta already reports CONNECTED (typical for a
    // business-verified number with no two-step UI) and WABA subscribe
    // succeeded, persist registered_at so Settings matches reality.
    if (!pinProvided && !registrationError && !sameNumber) {
      if (
        canInferCloudApiRegistration(phoneInfo) &&
        waba_id &&
        !subscriptionError
      ) {
        registeredAt = new Date().toISOString()
        registrationInferred = true
      } else {
        registrationSkipped = true
      }
    }

    const live =
      registeredAt != null && !registrationError && !subscriptionError

    // Persist everything in one shot. If /register failed we still
    // store the credentials and the error so the UI can guide the
    // user through a retry.
    const baseRow = {
      phone_number_id,
      waba_id: waba_id || null,
      access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      status: live ? 'connected' : registrationError ? 'disconnected' : 'connected',
      connected_at: registrationError && !sameNumber ? null : new Date().toISOString(),
      registered_at: registrationError && !sameNumber ? null : registeredAt,
      subscribed_apps_at: subscribedAppsAt,
      last_registration_error: registrationError ?? subscriptionError,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('whatsapp_config')
        .update(baseRow)
        .eq('account_id', accountId)

      if (updateError) {
        console.error('Error updating whatsapp_config:', updateError)
        return NextResponse.json(
          { error: 'Failed to update configuration' },
          { status: 500 }
        )
      }
    } else {
      // Insert with both columns: `account_id` is the tenancy key
      // (NOT NULL post-017, UNIQUE so duplicates trip the constraint
      // up-front), `user_id` is the audit column identifying which
      // member of the account saved the config.
      const { error: insertError } = await supabase
        .from('whatsapp_config')
        .insert({
          account_id: accountId,
          user_id: user.id,
          ...baseRow,
        })

      if (insertError) {
        console.error('Error inserting whatsapp_config:', insertError)
        return NextResponse.json(
          { error: 'Failed to save configuration' },
          { status: 500 }
        )
      }
    }

    if (registrationError || subscriptionError || registrationSkipped) {
      return NextResponse.json({
        success: false,
        saved: true,
        registered: registeredAt != null && !registrationError,
        registration_error: registrationError,
        subscription_error: subscriptionError,
        registration_skipped: registrationSkipped,
        registration_inferred: registrationInferred,
        verify_token_present: encryptedVerifyToken != null,
        phone_info: phoneInfo,
      })
    }

    return NextResponse.json({
      success: true,
      saved: true,
      registered: true,
      registration_inferred: registrationInferred,
      verify_token_present: encryptedVerifyToken != null,
      phone_info: phoneInfo,
    })
  } catch (error) {
    console.error('Error in WhatsApp config POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/whatsapp/config
 *
 * Removes the authenticated user's WhatsApp configuration row.
 * Used by the "Reset Configuration" button to recover from a corrupted
 * encrypted token (mismatched ENCRYPTION_KEY across environments).
 */
export async function DELETE() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const { error: deleteError } = await supabase
      .from('whatsapp_config')
      .delete()
      .eq('account_id', accountId)

    if (deleteError) {
      console.error('Error deleting whatsapp_config:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete configuration' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in WhatsApp config DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
