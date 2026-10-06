import assert from 'node:assert/strict';
let token='test-token', calls=[], rules=[], denyOwner=false, failCF=false;
const box={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',user_id:'owner',address:'abc12@temp.kellykhoo.com',expires_at:new Date(Date.now()+86400000).toISOString()};
globalThis.Deno={env:{get:k=>({SUPABASE_URL:'https://sup.example',SUPABASE_ANON_KEY:'public',CLOUDFLARE_API_TOKEN:token})[k]},serve:()=>{}};
globalThis.fetch=async(url,options={})=>{
 calls.push({url,options});
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
 if(url.endsWith('/auth/v1/user'))return options.headers.Authorization==='Bearer bad'?json({},401):json({id:'owner'});
 if(url.includes('/rpc/'))return json(box);
 if(url.includes('/temp_mail_inboxes?'))return json(denyOwner?[]:[box]);
 if(url.includes('api.cloudflare.com')){
  if(failCF)return json({success:false},403);
  if(options.method==='POST')return json({success:true,result:{id:'new',...JSON.parse(options.body)}});
  return json({success:true,result:rules,result_info:{total_pages:1}});
 }
 throw Error('Unexpected request '+url);
};
const {handler}=await import('../supabase/functions/create-inbox/index.ts');
const run=(input,auth='Bearer good')=>handler(new Request('https://backend/create-inbox',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify(input)}));
assert.equal((await run({domain:'temp.kellykhoo.com'},'Bearer bad')).status,401);
assert.equal(calls.length,1,'unauthorized request must not mutate');calls=[];
assert.equal((await run({domain:'kellykhoo.com'})).status,400);
assert.equal(calls.length,1,'root domain must be rejected');calls=[];
for(const domain of ['temp.kellykhoo.com','mail.kellykhoo.com','inbox.kellykhoo.com']){
 box.address='abc12@'+domain;
 const response=await run({domain});assert.equal(response.status,200);
 const created=calls.find(c=>c.options.method==='POST'&&c.url.includes('api.cloudflare.com'));
 const payload=JSON.parse(created.options.body);
 assert.equal(payload.matchers[0].value,box.address);
 assert.deepEqual(payload.actions,[{type:'worker',value:['temp-mail-inbound']}]);
 calls=[];
}
denyOwner=true;
assert.equal((await run({domain:'inbox.kellykhoo.com',inbox_id:box.id})).status,404);
assert.ok(!calls.some(c=>c.options.method==='POST'),'cannot create rule for another owner');denyOwner=false;calls=[];
rules=[{id:'existing',enabled:true,matchers:[{type:'literal',field:'to',value:box.address}],actions:[{type:'worker',value:['temp-mail-inbound']}]}];
assert.equal((await run({domain:'inbox.kellykhoo.com',inbox_id:box.id})).status,200);
assert.ok(!calls.some(c=>c.options.method==='POST'),'existing worker rule must be reused');calls=[];
rules[0].actions=[{type:'forward',value:['main@example.com']}];
assert.equal((await run({domain:'inbox.kellykhoo.com',inbox_id:box.id})).status,409);
assert.ok(!calls.some(c=>c.options.method==='POST'),'never overwrite unrelated route');rules=[];calls=[];
rules=[{id:'expired',name:'temp-mail-auto:'+box.id+':'+(Date.now()-1000),matchers:[{type:'literal',field:'to',value:box.address}],actions:[{type:'worker',value:['temp-mail-inbound']}]}];
rules.push({...rules[0],id:'manual',name:'manual rule'});
await run({domain:'inbox.kellykhoo.com'});
assert.equal(calls.filter(c=>c.options.method==='DELETE').length,1);
assert.ok(calls.find(c=>c.options.method==='DELETE').url.endsWith('/expired'));calls=[];rules=[];
failCF=true;
assert.equal((await run({domain:'temp.kellykhoo.com'})).status,503);
assert.ok(!calls.some(c=>c.url.includes('/rpc/')),'CF permission failure must happen before address creation');failCF=false;calls=[];
token=undefined;
assert.equal((await run({domain:'mail.kellykhoo.com'})).status,503);
assert.ok(!calls.some(c=>c.url.includes('/rpc/')));calls=[];
box.address='abc12@xzckfn.eu.cc';
assert.equal((await run({domain:'xzckfn.eu.cc'})).status,200);
assert.ok(!calls.some(c=>c.url.includes('api.cloudflare.com')));
console.log('PASS: three domains, auth, ownership, root rejection, route reuse, cleanup scope, configuration failures, catch-all fallback');
