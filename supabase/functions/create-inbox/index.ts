const domains = new Set(['lake.bcvbcvsdfs.icu','mist.bcvbcvsdfs.icu']);
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
  const newKeyNames:Record<string,string>={'lake.bcvbcvsdfs.icu':'FORWARDEMAIL_WEBHOOK_KEY_BCVBCVSDFS_LAKE','mist.bcvbcvsdfs.icu':'FORWARDEMAIL_WEBHOOK_KEY_BCVBCVSDFS_MIST'};
  if(Object.hasOwn(newKeyNames,input.domain)&&!Deno.env.get(newKeyNames[input.domain]))throw new Failure(503,'这个后缀正在配置，请稍后重试');
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
  return reply(200,box);
 }catch(error){
  if(error instanceof Failure)return reply(error.status,{message:error.message});
  console.error('Mailbox provisioning failed');
  return reply(503,{message:'收信配置暂时失败，请稍后重试'});
 }
}
Deno.serve(handler);
