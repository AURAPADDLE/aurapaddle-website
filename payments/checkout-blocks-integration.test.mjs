import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";import http from "node:http";import os from "node:os";import path from "node:path";import {spawn} from "node:child_process";import {fileURLToPath} from "node:url";

test("checkout blocks are private, deduped, resolved, persistent and fail-open",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"aura-checkout-blocks-")),port=47000+Math.floor(Math.random()*5000),stripePort=52000+Math.floor(Math.random()*5000),base=`http://127.0.0.1:${port}`,token="local-checkout-blocks-token";
  const stripe=http.createServer((req,res)=>{res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({id:"cs_test_localfixture",url:"https://checkout.stripe.test/localfixture",livemode:false}))});await new Promise(resolve=>stripe.listen(stripePort,"127.0.0.1",resolve));
  const env={...process.env,PORT:String(port),HOST:"127.0.0.1",PUBLIC_SITE_URL:base,ORDER_DATA_DIR:dir,DATABASE_URL:"",ORDERS_DB_URL:"",RENDER_URL:"",STRIPE_API_BASE:`http://127.0.0.1:${stripePort}`,STRIPE_API_KEY:"sk_test_local_fixture",STRIPE_WEBHOOK_SECRET:"",ADMIN_API_TOKEN:token,ALLOW_LIVE_PAYMENTS:"false",AGENTMAIL_API_KEY:"",AGENTMAIL_AGENTMAIL_API_KEY:"",GA4_API_SECRET:"",GA4_SERVER_EVENTS_ENABLED:"false",SHIPPING_LOCATION_VALIDATION_MODE:"off"};
  const start=async()=>{const child=spawn(process.execPath,[fileURLToPath(new URL("./server.mjs",import.meta.url))],{env,stdio:"pipe"});let diagnostics="";child.stderr.on("data",chunk=>diagnostics+=chunk);for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(diagnostics);try{if((await fetch(`${base}/api/health`)).ok)return child}catch{}await new Promise(resolve=>setTimeout(resolve,50))}throw Error(`Server did not start: ${diagnostics}`)};
  const stop=async child=>{if(child.exitCode===null){const exited=new Promise(resolve=>child.once("exit",resolve));child.kill();await exited}};
  const admin=auth=>fetch(`${base}/api/admin/checkout-blocks`,{headers:auth?{Authorization:`Bearer ${token}`}:{}}),checkout=body=>fetch(`${base}/api/checkout`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  let child;
  try{
    child=await start();assert.equal((await admin(false)).status,401);const page=await (await fetch(`${base}/admin/checkout-blocks/`)).text();assert.match(page,/Private checkout blocks/);assert.doesNotMatch(page,/private@example\.test/);
    const requestId="http-block-attempt-1",blocked={requestId,customerEmail:"bad",items:[{sku:"AP734955",quantity:1}],shippingRegion:"gold-coast-brisbane",returnPath:"/cart/"};
    assert.equal((await checkout(blocked)).status,400);assert.equal((await checkout(blocked)).status,400);
    let list=await (await admin(true)).json();assert.equal(list.items.length,1);assert.equal(list.items[0].repeatCount,2);assert.equal(list.items[0].status,"blocked");assert.doesNotMatch(JSON.stringify(list),/bad|AP734955|gold-coast|private@example/);
    const paid=await checkout({...blocked,customerEmail:"offline@example.test"});assert.equal(paid.status,200);assert.match((await paid.json()).url,/checkout\.stripe\.test/);
    list=await (await admin(true)).json();assert.equal(list.items[0].status,"resolved");
    fs.chmodSync(dir,0o555);const started=Date.now();const resilient=await checkout({...blocked,requestId:"http-block-write-failure",customerEmail:"bad"});assert.equal(resilient.status,400);assert.ok(Date.now()-started<2000);fs.chmodSync(dir,0o755);list=await (await admin(true)).json();assert.equal(list.items.length,1);
    await stop(child);child=await start();list=await (await admin(true)).json();assert.equal(list.items.find(item=>item.repeatCount===2)?.status,"resolved");
  }finally{if(dir&&fs.existsSync(dir))try{fs.chmodSync(dir,0o755)}catch{}if(child)await stop(child);await new Promise(resolve=>stripe.close(resolve));fs.rmSync(dir,{recursive:true,force:true})}
});
