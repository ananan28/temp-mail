const hash='61511372e391a702491600ec185d241ca8661bfda3a42ed1e89a2ed4fcbb539c';
const zone='60db672b5bccd002efc6644c994d7481';
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply(405,{error:'POST required'});
 const auth=req.headers.get('x-inbound-token')||'';
 if(auth.length!==64||hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(auth)))!==hash)return reply(401,{error:'Unauthorized'});
 const input=await req.json().catch(()=>null),address=input?.address?.toLowerCase();
 if(typeof address!=='string'||! /^[a-f0-9]{5,10}@(?:temp|mail|inbox)\.kellykhoo\.com$/.test(address))return reply(400,{error:'Invalid recipient'});
 const token=Deno.env.get('CLOUDFLARE_API_TOKEN');
 if(!token)return reply(503,{error:'Cloudflare token missing'});
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 try{
  const rules:any[]=[];
  for(let page=1;page<=10;page++){
   const r=await fetch('https://api.cloudflare.com/client/v4/zones/'+zone+'/email/routing/rules?page='+page+'&per_page=100',{headers,signal:AbortSignal.timeout(15000)});
   const data=await r.json();if(!r.ok||!data.success)return reply(503,{error:'Cannot read routing rules'});
   rules.push(...data.result);if(page>=(data.result_info?.total_pages||1))break;
  }
  const matching=rules.filter(r=>r.matchers?.some((m:any)=>m.field==='to'&&m.type==='literal'&&m.value===address));
  const end=new Date().toISOString(),start=new Date(Date.now()-3600000).toISOString();
  const query='query($zoneTag:string,$filter:EmailRoutingAdaptiveFilter_InputObject){viewer{zones(filter:{zoneTag:$zoneTag}){emailRoutingAdaptive(filter:$filter,limit:100,orderBy:[datetime_DESC]){datetime to status action spf dkim dmarc errorDetail}}}}';
  const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers,body:JSON.stringify({query,variables:{zoneTag:zone,filter:{datetime_geq:start,datetime_leq:end,to:address}}}),signal:AbortSignal.timeout(15000)});
  const events=await r.json();
  return reply(200,{address,matching_rules:matching.map(r=>({enabled:r.enabled,actions:r.actions})),analytics_errors:events.errors?.map((e:any)=>e.message)||null,events:events.data?.viewer?.zones?.[0]?.emailRoutingAdaptive?.filter((e:any)=>e.to===address)||[]});
 }catch{return reply(503,{error:'Diagnostic request failed'});}
});
