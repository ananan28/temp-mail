# Temporary mail
收信域名：temp.kellykhoo.com。前端部署于 GitHub Pages，后端为 Supabase fpidzorviwktkqzntpmv。
## Usage
打开网页后通过 Supabase anonymous sign-in 建立浏览器身份；自动生成随机地址。刷新页面保留身份，清除浏览器数据后不能恢复。
邮箱有效期为24小时，到期停止查询和接收写入。pg_cron 每10分钟删除过期邮箱并级联清理其邮件。
## Backend setup
Supabase Authentication > Sign In / Providers: enable anonymous sign-ins.
Supabase Edge Functions > Secrets:
- RESEND_API_KEY: Resend API key with permission to retrieve received emails.
- RESEND_WEBHOOK_SECRET: signing secret for this webhook.
Do not put either secret in GitHub or frontend files. The frontend publishable key is intentionally public; row-level security controls access.
Resend Webhooks: subscribe only to email.received:
https://fpidzorviwktkqzntpmv.supabase.co/functions/v1/resend-inbound
The function uses raw-body signature verification and returns retryable errors on provider/database failures. Unique (inbox_id,provider_message_id) prevents duplicate webhook deliveries.
## GitHub Pages
Settings > Pages: Deploy from a branch, main, / (root). No custom domain is needed. Do not change root domain DNS.
## Limitations
Only plain-text message bodies are currently displayed. Attachments and HTML-only bodies are not displayed.
Expiry cleanup covers application data in Supabase; Resend retention is managed separately by Resend.
No forwarding or sending is implemented. No inbound content executes commands.
## Verification
Database checks passed for 50 distinct random addresses and cross-user inbox isolation. This is not a simultaneous load test.
Live browser and real-email verification must be completed after deployment and webhook configuration.
