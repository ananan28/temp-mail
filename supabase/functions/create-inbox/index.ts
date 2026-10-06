const domains = new Set(['temp.kellykhoo.com','mail.kellykhoo.com','inbox.kellykhoo.com','xzckfn.eu.cc']);
const zone = '60db672b5bccd002efc6644c994d7481';
const worker = 'temp-mail-inbound';
const cors = {'Access-Control-Allow-Origin':'https://ananan28.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
const reply = (status:number, body:unknown) => new Response(JSON.stringify(body), {status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
class Failure extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
export async function handler(req:Request):Promise<Response> {
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply(405,{message:'POST required'});
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer [\w.-]+$/.test(authorization))return reply(401,{message:'请重新建立浏览器身份'});
 const base=Deno.env.get('SUPABASE_URL')!;
 const publicKey=Deno.env.get('SUPABASE_ANON_KEY')!;
 const userHeaders={apikey:publicKey,Authorization:authorization,'Content-Type':'application/json'};
 const call=async(url:string,options:RequestInit={})=>fetch(url,{...options,signal:AbortSignal.timeout(15000)});
 try {
  const identity=await call(base+'/auth/v1/user',{headers:userHeaders});
  if(!identity.ok)throw new Failure(401,'浏览器身份已失效，请重新连接');
  const user=await identity.json();
  if(!user.id)throw new Failure(401,'无法验证浏览器身份');
  const input=await req.json().catch(()=>null);
  if(!input||!domains.has(input.domain))throw new Failure(400,'不支持这个邮箱后缀');
  const isSubdomain=false; // All supported domains now use preconfigured catch-all receiving.
  const token=Deno.env.get('CLOUDFLARE_API_TOKEN');
  if(isSubdomain&&!token)throw new Failure(503,'这些后缀尚未配置自动收信令牌，请先使用 xzckfn.eu.cc');
  const cf=async(path:string,method='GET',body?:unknown)=>{
   const response=await call('https://api.cloudflare.com/client/v4/zones/'+zone+'/email/routing/rules'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   const result=await response.json().catch(()=>null);
   if(!response.ok||!result?.success)throw new Failure(503,'Cloudflare 收信规则配置失败，请检查令牌权限或规则额度');
   return result;
  };
  // Only delete rules created by this application, after their own encoded expiry.
  // Expired inboxes are already disabled by RLS and inbound validation immediately.
  let rules:any[]=[];
  const loadRules=async()=>{
   const first=await cf('?page=1&per_page=100');rules=first.result||[];
   const pages=first.result_info?.total_pages||1;
   if(pages>10)throw new Failure(503,'收信规则数量过多，请联系管理员');
   for(let page=2;page<=pages;page++)rules.push(...(await cf('?page='+page+'&per_page=100')).result);
   const expired=rules.filter(r=>{
    const match=/^temp-mail-auto:([a-f0-9-]{36}):(\d{13})$/.exec(r.name||'');
    const recipient=r.matchers?.[0]?.value||'';
    return match&&Number(match[2])<=Date.now()&&r.matchers?.length===1&&r.matchers[0].type==='literal'&&r.matchers[0].field==='to'&&/^[a-f0-9]{5,10}@(?:temp|mail|inbox)\.kellykhoo\.com$/.test(recipient)&&r.actions?.length===1&&r.actions[0].type==='worker'&&r.actions[0].value?.[0]===worker;
   });
   for(const rule of expired.slice(0,40)){
    await cf('/'+encodeURIComponent(rule.id||rule.tag),'DELETE');
    rules=rules.filter(r=>r!==rule);
   }
  };
  let box:any;
  if(input.inbox_id){
   if(!/^[a-f0-9-]{36}$/.test(input.inbox_id))throw new Failure(400,'无效收件箱');
   const query=new URLSearchParams({select:'*',id:'eq.'+input.inbox_id});
   const found=await call(base+'/rest/v1/temp_mail_inboxes?'+query,{headers:userHeaders});
   if(!found.ok)throw new Failure(503,'收件箱读取失败');
   box=(await found.json())[0];
   if(!box||box.user_id!==user.id||box.address.split('@')[1]!==input.domain)throw new Failure(404,'收件箱不存在、已到期或不属于你');
  }else{
   // Database RPC keeps its existing ownership policy and uniqueness retry.
   const created=await call(base+'/rest/v1/rpc/create_temp_mail_inbox',{method:'POST',headers:userHeaders,body:JSON.stringify({p_domain:input.domain})});
   if(!created.ok)throw new Failure(503,'地址生成失败，请重试');
   const value=await created.json();box=Array.isArray(value)?value[0]:value;
  }
  if(isSubdomain){
   // Fresh random addresses have no prior route. Skip listing in the common path.
   if(input.inbox_id)await loadRules();
   const existing=rules.find(r=>r.matchers?.some((m:any)=>m.type==='literal'&&m.field==='to'&&m.value===box.address));
   if(existing){
    if(!existing.enabled||existing.actions?.length!==1||existing.actions[0].type!=='worker'||existing.actions[0].value?.[0]!==worker)throw new Failure(409,'此地址已有不同收信规则，请生成新地址');
   }else{
    const name='temp-mail-auto:'+box.id+':'+new Date(box.expires_at).getTime();
    const payload={name,enabled:true,matchers:[{type:'literal',field:'to',value:box.address}],actions:[{type:'worker',value:[worker]}]};
    try{await cf('','POST',payload);}catch(error){
     // Reclaim expired application rules only when provisioning needs recovery.
     await loadRules();
     const recovered=rules.find(r=>r.enabled&&r.matchers?.some((m:any)=>m.type==='literal'&&m.field==='to'&&m.value===box.address)&&r.actions?.length===1&&r.actions[0].type==='worker'&&r.actions[0].value?.[0]===worker);
     if(!recovered)await cf('','POST',payload);
    }
   }
  }
  return reply(200,box);
 }catch(error){
  if(error instanceof Failure)return reply(error.status,{message:error.message});
  console.error('Mailbox provisioning failed');
  return reply(503,{message:'收信配置暂时失败，请稍后重试'});
 }
}
Deno.serve(handler);
