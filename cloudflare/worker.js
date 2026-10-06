export default {
 async email(message, env) {
  if (!env.INBOUND_TOKEN) throw new Error("Missing INBOUND_TOKEN secret");
  if (message.rawSize > 2097152) { message.setReject("Message exceeds 2 MiB"); return; }
  const response = await fetch("https://fpidzorviwktkqzntpmv.supabase.co/functions/v1/cloudflare-inbound", {
   method: "POST",
   headers: {
    "Content-Type": "message/rfc822",
    "x-inbound-token": env.INBOUND_TOKEN,
    "x-envelope-to": message.to,
    "x-envelope-from": message.from
   },
   body: message.raw
  });
  if (response.status === 410) { message.setReject("Mailbox expired or unknown"); return; }
  if (response.status === 400 || response.status === 413) { message.setReject("Recipient or message not supported"); return; }
  if (!response.ok) throw new Error("Inbound storage failed: " + response.status);
 }
};
