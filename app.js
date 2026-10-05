const URL_BASE="https://fpidzorviwktkqzntpmv.supabase.co";
const KEY="sb_publishable_dixJle7kBjtfX2L55W7p0g_lYGVz7kR";
const $=id=>document.getElementById(id);
let session=null,inbox=null,loading=false;
function status(t){$("status").textContent=t}
function enabled(v){for(const id of ["copy","create","refresh","domain"])$(id).disabled=!v;}
async function request(path,options={},auth=true){
 const response=await fetch(URL_BASE+path,{...options,headers:{apikey:KEY,"Content-Type":"application/json",...(auth?{Authorization:"Bearer "+session.access_token}:{}),...options.headers}});
 const body=await response.json().catch(()=>null);
 if(!response.ok)throw new Error(body?.msg||body?.message||body?.error_description||"请求失败 ("+response.status+")");
 return body;
}
async function identity(){
 if(session&&session.expires_at*1000>Date.now()+60000)return;
 if(!session){try{session=JSON.parse(localStorage.getItem("temp-mail-session"));}catch{}}
 if(session?.refresh_token){
 session=await request("/auth/v1/token?grant_type=refresh_token",{method:"POST",body:JSON.stringify({refresh_token:session.refresh_token})},false);
 }else{
 session=await request("/auth/v1/signup",{method:"POST",body:"{}"},false);
 }
 if(!session?.access_token)throw new Error("无法建立独立身份，请确认匿名登录已开启");
 session.expires_at=Math.floor(Date.now()/1000)+session.expires_in;
 localStorage.setItem("temp-mail-session",JSON.stringify(session));
}
function showInbox(){
 $("address").value=inbox?.address||"";
 if(inbox)$("domain").value=inbox.address.split("@")[1];
 $("expiry").textContent=inbox?"到期时间："+new Date(inbox.expires_at).toLocaleString():"邮箱已到期，请生成新地址";
 $("copy").disabled=!inbox;
}
async function create(){
 const result=await request("/rest/v1/rpc/create_temp_mail_inbox",{method:"POST",body:JSON.stringify({p_domain:$("domain").value})});
 inbox=Array.isArray(result)?result[0]:result;
 $("detail").hidden=true;showInbox();await messages();
}

function renderBody(mail){
 const body=$("body");body.replaceChildren();
 const safeURL=value=>{try{const u=new URL(value);return ["https:","http:"].includes(u.protocol)?u.href:null;}catch{return null;}};
 const link=(href,label)=>{const a=document.createElement("a");a.href=href;a.textContent=label;a.target="_blank";a.rel="noopener noreferrer";a.referrerPolicy="no-referrer";return a;};
 if(mail.body_html){
 const parsed=new DOMParser().parseFromString(mail.body_html,"text/html");
 const allowed=new Set(["P","DIV","SPAN","BR","STRONG","B","EM","I","U","S","H1","H2","H3","H4","UL","OL","LI","BLOCKQUOTE","PRE","CODE","TABLE","TBODY","THEAD","TR","TD","TH","HR","A"]);
 const blocked=new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","FORM","INPUT","BUTTON","SVG","MATH","LINK","META","BASE","TEMPLATE","NOSCRIPT"]);
 const clean=(node,parent)=>{
 if(node.nodeType===3){parent.append(document.createTextNode(node.textContent));return;}
 if(node.nodeType!==1||blocked.has(node.tagName))return;
 if(node.tagName==="IMG"){if(node.getAttribute("alt"))parent.append(document.createTextNode(node.getAttribute("alt")));return;}
 let target=parent;
 if(allowed.has(node.tagName)){
 target=document.createElement(node.tagName.toLowerCase());
 if(node.tagName==="A"){
 const url=safeURL(node.getAttribute("href"));if(url){target=link(url,"");}else target=document.createElement("span");
 }
 parent.append(target);
 }
 for(const child of node.childNodes)clean(child,target);
 };
 for(const child of parsed.body.childNodes)clean(child,body);
 }else{
 const text=mail.body_text||"此邮件没有正文。";let cursor=0;
 for(const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)){
 body.append(document.createTextNode(text.slice(cursor,match.index)));
 const href=safeURL(match[0]);body.append(href?link(href,match[0]):document.createTextNode(match[0]));
 cursor=match.index+match[0].length;
 }
 body.append(document.createTextNode(text.slice(cursor)));
 body.classList.add("plain-text");
 }
 if(mail.body_html)body.classList.remove("plain-text");
}

async function messages(){
 if(!inbox)return;
 if(new Date(inbox.expires_at)<=new Date()){inbox=null;showInbox();$("list").textContent="邮箱已停用";$("detail").hidden=true;return;}
 const rows=await request("/rest/v1/temp_mail_messages?select=id,sender,subject,received_at&inbox_id=eq."+encodeURIComponent(inbox.id)+"&order=received_at.desc&limit=100");
 const list=$("list");list.replaceChildren();
 if(!rows.length)list.textContent="暂无邮件。收到邮件后会自动显示。";
 for(const row of rows){
 const button=document.createElement("button");button.className="mail";
 const title=document.createElement("strong");title.textContent=row.subject||"（无主题）";
 const meta=document.createElement("small");meta.textContent=row.sender+" · "+new Date(row.received_at).toLocaleString();
 button.append(title,meta);button.onclick=()=>run(async()=>{
 const details=await request("/rest/v1/temp_mail_messages?select=subject,sender,body_text,body_html&id=eq."+encodeURIComponent(row.id));
 if(!details.length)throw new Error("邮件已到期或不可访问");
 $("subject").textContent=details[0].subject||"（无主题）";$("sender").textContent=details[0].sender;
 renderBody(details[0]);$("detail").hidden=false;
 });list.append(button);
 }
 status("已更新 · "+new Date().toLocaleTimeString());
}
async function run(fn){
 if(loading)return;loading=true;enabled(false);
 try{await identity();await fn();}catch(e){status(e.message);}finally{loading=false;enabled(!!session);$("copy").disabled=!inbox;}
}
$("copy").onclick=()=>navigator.clipboard.writeText(inbox.address).then(()=>status("地址已复制")).catch(()=>status("请选中上方地址手动复制"));
$("domain").onchange=()=>{status("已选择 "+$("domain").value+"，点击生成新地址后生效");};
$("create").onclick=()=>run(create);$("refresh").onclick=()=>run(messages);
await run(async()=>{
 const boxes=await request("/rest/v1/temp_mail_inboxes?select=*&order=created_at.desc&limit=1");
 if(boxes.length){inbox=boxes[0];showInbox();await messages();}else await create();
});
setInterval(()=>{if(!document.hidden)run(messages);},10000);
