# Temporary mail

Receiving domain: temp.kellykhoo.com. Frontend: GitHub Pages. Backend: Supabase fpidzorviwktkqzntpmv.

Anonymous browser identities own separate inboxes enforced by RLS. Address names use 5–10 random hexadecimal characters, unique constraints and collision retries. Existing 32-character addresses remain valid until expiry. Inboxes expire after 24 hours; cron deletes expired inboxes and messages every 10 minutes.

## Receiving

Subscribe the Resend webhook to email.received at https://fpidzorviwktkqzntpmv.supabase.co/functions/v1/resend-inbound. Backend secrets RESEND_API_KEY and RESEND_WEBHOOK_SECRET belong only in Supabase Edge Function Secrets. Public frontend uses a publishable key only.

The handler verifies signatures, retrieves text and HTML, and idempotently stores messages. HTML rendering rebuilds allowed elements and HTTP/HTTPS links, removes executable content and remote images, and opens links with noopener/noreferrer. Plain-text URLs are clickable. Attachments and original HTML styling are not supported. No forwarding is configured.

## Deployment

GitHub Actions workflow .github/workflows/pages.yml publishes the static site. Root domain website/DNS is untouched.

## Receiving domain selection

All three receiving subdomains (temp, mail, inbox) have verified MX records; mail and inbox also have verified DKIM. Select a suffix on the web page, then click Generate new address. Changing the selector alone keeps the current inbox accessible. Backend RPC validates the selected suffix against an allowlist and preserves ownership RLS. Existing addresses remain active until expiry. No root-domain DNS changes are required.

## Verification

Database identity isolation and expiry/cascade cleanup checks passed. 100 generated short addresses were distinct and ranged from 5 to 10 characters. HTML button links, plaintext URLs and unsafe-markup filtering tests passed. A real inbound message arrived with HTTP 200; its missing HTML was restored by replaying the signed webhook after the fix. Pages deployment and visible link rendering were verified. This is not a concurrent load test.
