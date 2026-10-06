import PostalMime from "npm:postal-mime@2.4.3";
const tokenHash="61511372e391a702491600ec185d241ca8661bfda3a42ed1e89a2ed4fcbb539c";
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
const reply=(status:number,text:string)=>new Response(text,{status});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply(405,"POST required");
 const token=req.headers.get("x-inbound-token")??"";
 if(token.length!==64||hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))!==tokenHash)return reply(401,"Unauthorized");
 const address=(req.headers.get("x-envelope-to")??"").toLowerCase();
 if(!/^[a-f0-9]{5,10}@(?:xzckfn\.eu\.cc|(?:temp|mail|inbox)\.kellykhoo\.com)$/.test(address))return reply(400,"Unsupported recipient");
 const base=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
 try{
  const query=new URLSearchParams({select:"id",address:"eq."+address,expires_at:"gt."+new Date().toISOString()});
  const found=await fetch(base+"/rest/v1/temp_mail_inboxes?"+query,{headers,signal:AbortSignal.timeout(10000)});
  if(!found.ok)return reply(503,"Database unavailable");
  const boxes=await found.json();
  if(!boxes.length)return reply(410,"Mailbox expired or unknown");
  const reader=req.body?.getReader();if(!reader)return reply(400,"Empty message");
  const chunks:Uint8Array[]=[];let length=0;
  for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>2097152){await reader.cancel();return reply(413,"Message exceeds 2 MiB");}chunks.push(value);}
  const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
  const email=await PostalMime.parse(raw);
  const id="cf:"+hex(await crypto.subtle.digest("SHA-256",raw));
  const put=await fetch(base+"/rest/v1/temp_mail_messages?on_conflict=inbox_id,provider_message_id",{
   method:"POST",headers:{...headers,Prefer:"resolution=ignore-duplicates"},
   body:JSON.stringify({inbox_id:boxes[0].id,provider_message_id:id,sender:(req.headers.get("x-envelope-from")??email.from?.address??"").slice(0,1000),subject:(email.subject??"").slice(0,1000),body_text:(email.text??"").slice(0,200000),body_html:(email.html??"").slice(0,500000)}),
   signal:AbortSignal.timeout(10000)});
  if(!put.ok)return reply(503,"Storage failed");
  return reply(200,"Received");
 }catch{console.error("Cloudflare inbound processing failed");return reply(503,"Temporary processing failure");}
});
