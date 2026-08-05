import crypto from 'node:crypto'

/**
 * Verify the HMAC-SHA256 signature Meta attaches to webhook POSTs.
 *
 * Meta signs the raw request body with your App Secret and sends the
 * result in the `x-hub-signature-256: sha256=<hex>` header. Without
 * verification, anyone who knows our webhook URL can POST fabricated
 * status updates and drift broadcast counts arbitrarily.
 *
 * Reference:
 *   https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verify-payloads
 *
 * Contract:
 *   `META_APP_SECRET` is **required**. If it's missing we fail closed —
 *   every request is rejected until the operator configures the
 *   secret. A previous version fell open with a warning log, which is
 *   unsafe for a public template: anyone who forgets the env var would
 *   be running a fully spoofable webhook.
 */
export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  return debugMetaWebhookSignature(rawBody, signatureHeader).ok
}

/** Phase-2 inbound debug — explains signature pass/fail without logging the secret. */
export function debugMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): {
  ok: boolean
  reason: string | null
  secretLoaded: boolean
  secretLength: number
  signatureHeader: string | null
  calculatedSignature: string | null
  match: boolean
} {
  const secret = process.env.META_APP_SECRET
  if (!secret) {
    console.error(
      '[webhook] META_APP_SECRET is not set — rejecting request. ' +
        'Configure the env var (Meta → App Settings → Basic → App Secret) ' +
        'to enable signature verification.',
    )
    return {
      ok: false,
      reason: 'META_APP_SECRET is not set',
      secretLoaded: false,
      secretLength: 0,
      signatureHeader,
      calculatedSignature: null,
      match: false,
    }
  }

  if (!signatureHeader) {
    return {
      ok: false,
      reason: 'Missing X-Hub-Signature-256 header',
      secretLoaded: true,
      secretLength: secret.length,
      signatureHeader: null,
      calculatedSignature: null,
      match: false,
    }
  }

  if (!signatureHeader.startsWith('sha256=')) {
    return {
      ok: false,
      reason: 'Header does not start with sha256=',
      secretLoaded: true,
      secretLength: secret.length,
      signatureHeader,
      calculatedSignature: null,
      match: false,
    }
  }

  const calculatedSignature =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

  if (signatureHeader.length !== calculatedSignature.length) {
    return {
      ok: false,
      reason: `Signature length mismatch (header=${signatureHeader.length} calculated=${calculatedSignature.length})`,
      secretLoaded: true,
      secretLength: secret.length,
      signatureHeader,
      calculatedSignature,
      match: false,
    }
  }

  const match = crypto.timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(calculatedSignature),
  )
  return {
    ok: match,
    reason: match ? null : 'HMAC mismatch — wrong META_APP_SECRET or body altered',
    secretLoaded: true,
    secretLength: secret.length,
    signatureHeader,
    calculatedSignature,
    match,
  }
}
