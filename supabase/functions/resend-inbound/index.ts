import { Resend } from "npm:resend@6.32.0";
const reply=(s:number,t:string)=>new Response(t,{status:s});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply(405,"POST required");
 const api=Deno.env.get("RESEND_API_KEY"),secret=Deno.env.get("RESEND_WEBHOOK_SECRET");
 if(!api||!secret)return reply(503,"Receiving configuration incomplete");
 const payload=await req.text();
 if(payload.length>262144)return reply(413,"Payload too large");
 const resend=new Resend(api);
 let event:any;
 try{event=resend.webhooks.verify({payload,headers:{
 id:req.headers.get("svix-id")??"",
 timestamp:req.headers.get("svix-timestamp")??"",
 signature:req.headers.get("svix-signature")??""
 },webhookSecret:secret});}catch{return reply(401,"Invalid signature");}
 if(event.type!=="email.received")return reply(200,"Ignored");
 if(!/^[a-f0-9-]{36}$/i.test(event.data?.email_id??""))return reply(400,"Invalid email ID");
 try{
 const {data:email,error}=await resend.emails.receiving.get(event.data.email_id);
 if(error||!email)return reply(502,"Email retrieval failed");
 const recipients=[...new Set((event.data.to??[]).filter((x:unknown)=>typeof x==="string").map((x:string)=>x.toLowerCase()))]
 .filter((x:string)=>/^(?:[a-f0-9]{5,10}|[a-f0-9]{32})@temp\.kellykhoo\.com$/.test(x));
 const base=Deno.env.get("SUPABASE_URL")!;
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
 for(const address of recipients){
 const query=new URLSearchParams({select:"id",address:"eq."+address,expires_at:"gt."+new Date().toISOString()});
 const found=await fetch(base+"/rest/v1/temp_mail_inboxes?"+query,{headers,signal:AbortSignal.timeout(10000)});
 if(!found.ok)return reply(503,"Database unavailable");
 const inboxes=await found.json();
 if(!inboxes.length)continue;
 const put=await fetch(base+"/rest/v1/temp_mail_messages?on_conflict=inbox_id,provider_message_id",{
 method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates"},
 body:JSON.stringify({inbox_id:inboxes[0].id,provider_message_id:event.data.email_id,
 sender:email.from,subject:(email.subject??"").slice(0,1000),body_text:(email.text??"").slice(0,200000),body_html:(email.html??"").slice(0,500000)}),
 signal:AbortSignal.timeout(10000)});
 if(!put.ok)return reply(503,"Storage failed");
 }
 return reply(200,"Received");
 }catch{return reply(503,"Temporary receiving failure");}
});