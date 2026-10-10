import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const secret='test-only-signing-key';
globalThis.Deno={env:{get:name=>({FORWARDEMAIL_WEBHOOK_KEY:secret,SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key'}[name])},serve(){}};
const {handler}=await import('../supabase/functions/forwardemail-inbound/index.ts');
let saved=[];let queries=[];
globalThis.fetch=async(url,options)=>{
 if(options.method==='POST'){saved.push(...JSON.parse(options.body));return new Response('',{status:201});}
 queries.push(new URL(url));return Response.json([{id:'owner-a'},{id:'owner-b'}]);
};
const body={recipients:['AbC12@inbox.kellykhoo.com','def34@inbox.kellykhoo.com'],messageId:'<test@example.org>',from:{value:[{address:'sender@example.org'}]},subject:'Verification',text:'123456',html:'<a href="https://example.org/verify">Verify</a>',session:{recipient:'different@mail.kellykhoo.com'}};
const request=(value,valid=true)=>{const raw=JSON.stringify(value);return new Request('https://receiver.test',{method:'POST',body:raw,headers:{'x-webhook-signature':valid?createHmac('sha256',secret).update(raw).digest('hex'):'0'.repeat(64)}});};
assert.equal((await handler(request(body,false))).status,401);assert.equal(queries.length,0);
assert.equal((await handler(request(body))).status,200);
assert.equal(saved.length,2);assert.equal(saved[0].inbox_id,'owner-a');assert.equal(saved[1].inbox_id,'owner-b');assert.match(saved[0].body_html,/href=/);
assert.equal(queries[0].searchParams.get('address'),'in.(abc12@inbox.kellykhoo.com,def34@inbox.kellykhoo.com)');assert.ok(queries[0].searchParams.get('expires_at').startsWith('gt.'));
const previous=saved[0].provider_message_id;
assert.equal((await handler(request({...body,session:{arrivalTime:'changed'}}))).status,200);assert.equal(saved[2].provider_message_id,previous);
assert.equal((await handler(request({...body,recipients:['abc12@mail.kellykhoo.com']}))).status,200);assert.equal(saved.length,4);
globalThis.fetch=async()=>Response.json([]);
assert.equal((await handler(request(body))).status,200);assert.equal(saved.length,4);
globalThis.fetch=async()=>new Response('',{status:503});
assert.equal((await handler(request(body))).status,503);
assert.equal((await handler(new Request('https://receiver.test'))).status,405);
console.log('PASS: signature rejection, envelope isolation, expiry filtering, retry identity, HTML links, database retry');

for (const suffix of ['box','code','receive','hahjxbnb']) {
 const domain=suffix==='hahjxbnb'?'hahjxbnb.com':suffix+'.kellykhoo.com', ownSecret='synthetic-'+suffix;
 globalThis.Deno.env.get=name=>name==='FORWARDEMAIL_WEBHOOK_KEY_'+suffix.toUpperCase()?ownSecret:({FORWARDEMAIL_WEBHOOK_KEY:secret,SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'test-only-service-key'}[name]);
 let addressFilter='';
 globalThis.fetch=async(url,options)=>{
  if(options.method==='POST')return new Response('',{status:201});
  addressFilter=new URL(url).searchParams.get('address');return Response.json([{id:'test-owner'}]);
 };
 const raw=JSON.stringify({...body,recipients:['abc12@'+domain,'def34@inbox.kellykhoo.com']});
 const req=key=>new Request('https://receiver.test?domain='+domain,{method:'POST',body:raw,headers:{'x-webhook-signature':createHmac('sha256',key).update(raw).digest('hex')}});
 assert.equal((await handler(req(secret))).status,401);
 assert.equal((await handler(req(ownSecret))).status,200);
 assert.equal(addressFilter,'in.(abc12@'+domain+')');
}
console.log('PASS: box/code/receive/hahjxbnb require their own signature and isolate recipient domains');
