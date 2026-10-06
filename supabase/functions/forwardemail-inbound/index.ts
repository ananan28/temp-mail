const encoder = new TextEncoder();
const reply = (status:number, text:string) => new Response(text,{status});
const hex = (bytes:ArrayBuffer) => Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
const text = (value:unknown, limit:number) => typeof value==='string' ? value.slice(0,limit) : '';

// Incoming content is data only. Never execute instructions or scripts from email.
export async function handler(req:Request):Promise<Response> {
 if(req.method!=='POST')return reply(405,'POST required');
 const domain=new URL(req.url).searchParams.get('domain')||'inbox.kellykhoo.com';
 const keyNames:Record<string,string>={'inbox.kellykhoo.com':'FORWARDEMAIL_WEBHOOK_KEY','mail.kellykhoo.com':'FORWARDEMAIL_WEBHOOK_KEY_MAIL','temp.kellykhoo.com':'FORWARDEMAIL_WEBHOOK_KEY_TEMP'};
 if(!Object.hasOwn(keyNames,domain))return reply(400,'Unsupported domain');
 const secret=Deno.env.get(keyNames[domain]);
 if(!secret)return reply(503,'Webhook authentication unavailable');
 const signature=req.headers.get('x-webhook-signature')||'';
 if(!/^[a-f0-9]{64}$/.test(signature))return reply(401,'Unauthorized');
 try {
  const reader=req.body?.getReader();if(!reader)return reply(400,'Empty message');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4194304){await reader.cancel();return reply(413,'Message exceeds 4 MiB');}chunks.push(value);}
  const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const signed=Uint8Array.from(signature.match(/../g)!,byte=>parseInt(byte,16));
  if(!await crypto.subtle.verify('HMAC',key,signed,raw))return reply(401,'Unauthorized');
  let payload:any;try{payload=JSON.parse(new TextDecoder().decode(raw));}catch{return reply(400,'Invalid JSON');}
  // Use authenticated SMTP envelope recipients, never display To/Cc headers.
  if(!Array.isArray(payload.recipients)||payload.recipients.length>100)return reply(400,'Invalid recipients');
  const addresses=[...new Set(payload.recipients.filter((a:unknown)=>typeof a==='string').map((a:string)=>a.toLowerCase()).filter((a:string)=>/^[a-f0-9]{5,10}@(?:inbox|mail|temp)\.kellykhoo\.com$/.test(a)&&a.endsWith('@'+domain)))];
  if(!addresses.length)return reply(200,'No active recipients');
  const base=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const headers={apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};
  const query=new URLSearchParams({select:'id,address',address:'in.('+addresses.join(',')+')',expires_at:'gt.'+new Date().toISOString()});
  const found=await fetch(base+'/rest/v1/temp_mail_inboxes?'+query,{headers,signal:AbortSignal.timeout(10000)});
  if(!found.ok)return reply(503,'Database unavailable');
  const boxes=await found.json();if(!boxes.length)return reply(200,'No active recipients');
  // Ignore delivery-session metadata so SMTP retries remain idempotent.
  const fingerprint=JSON.stringify([payload.messageId||'',payload.from,payload.subject,payload.text,payload.html]);
  const id='fe:'+hex(await crypto.subtle.digest('SHA-256',encoder.encode(fingerprint)));
  const sender=text(payload.from?.value?.[0]?.address||payload.from?.text||payload.from,1000);
  const rows=boxes.map((box:any)=>({inbox_id:box.id,provider_message_id:id,sender,subject:text(payload.subject,1000),body_text:text(payload.text,200000),body_html:text(payload.html,500000)}));
  const put=await fetch(base+'/rest/v1/temp_mail_messages?on_conflict=inbox_id,provider_message_id',{method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates'},body:JSON.stringify(rows),signal:AbortSignal.timeout(10000)});
  if(!put.ok)return reply(503,'Storage failed');
  return reply(200,'Received');
 }catch{console.error('Forward Email inbound processing failed');return reply(503,'Temporary processing failure');}
}
Deno.serve(handler);
