# Cloudflare receiving

`temp.kellykhoo.com`, `mail.kellykhoo.com`, and `inbox.kellykhoo.com` use individual literal Email Routing rules pointing to `temp-mail-inbound`. `xzckfn.eu.cc` uses its existing catch-all Worker rule.

The frontend calls the `create-inbox` Supabase Edge Function. It validates the caller with Supabase Auth, creates a random unique inbox through the existing RLS-protected RPC, and provisions a Cloudflare rule before returning the address. Existing matching Worker rules are reused. All three subdomains share one token.

Set `CLOUDFLARE_API_TOKEN` in Supabase Edge Function Secrets. Permission: Zone → Email Routing Rules → Edit. Resource scope: only `kellykhoo.com`. Never store this token in frontend code or repository files. The Worker uses a separate secret `INBOUND_TOKEN`, already configured for the authenticated inbound adapter.

Mailbox lifetime is 24 hours. RLS and the inbound adapter reject expired inboxes immediately. The existing database cron deletes expired inboxes and their messages every 10 minutes. Application-created Cloudflare rules encode their expiration in the rule name and are reclaimed when provisioning recovers from a failure or checks an existing inbox (up to 40 per request). Manual rules and root-domain rules are preserved. Cloudflare's routing-rule limit still applies; this is not unlimited active addresses.

Do not change root-domain MX, website A/CNAME records, or enable root-domain Email Routing DNS. Root email stays with its existing provider.

Run provisioning contract tests with Node 24: `node tests/provision.mjs`. These mock service responses and do not replace real SMTP delivery tests.
