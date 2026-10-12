import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('authenticated inventory and order workflow is persistent, private and does not need Stripe calls',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aura-inventory-http-')),port=43871,base=`http://127.0.0.1:${port}`,token='local-inventory-test-only';
 const order=number=>({sessionId:`cs_live_${number}`,orderNumber:number,initialPaymentStatus:'paid',paymentStage:'paid_in_full',balancePaymentStatus:'paid',amountTotal:74900,items:[{sku:'AP734955',quantity:1}],fulfilmentStatus:'preparing_for_dispatch'});
 fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify({orders:{pickup:order('QA_PICKUP'),internal:order('QA_INTERNAL')}}));
 const server=spawn(process.execPath,[fileURLToPath(new URL('./server.mjs',import.meta.url))],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PUBLIC_SITE_URL:base,ORDER_DATA_DIR:dir,DATABASE_URL:'',ORDERS_DB_URL:'',RENDER_URL:'',STRIPE_API_KEY:'',STRIPE_WEBHOOK_SECRET:'',ADMIN_API_TOKEN:token,ALLOW_LIVE_PAYMENTS:'false',AGENTMAIL_API_KEY:'',AGENTMAIL_AGENTMAIL_API_KEY:'',GA4_API_SECRET:'',GA4_SERVER_EVENTS_ENABLED:'false'},stdio:'pipe'});
 let diagnostics='';server.stderr.on('data',chunk=>diagnostics+=chunk);
 try{
  for(let n=0;n<100;n++){if(server.exitCode!==null)throw Error(diagnostics||'Local server exited.');try{if((await fetch(`${base}/api/health`)).ok)break}catch{}await new Promise(r=>setTimeout(r,50))}
  const request=(url,body,authenticated=true)=>fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await request('/api/admin/inventory',null,false)).status,401);
  assert.equal((await request('/api/admin/inventory',{action:'initialize'},false)).status,401);
  assert.equal((await request('/payments/inventory.mjs')).status,404);
  assert.equal((await request('/admin/inventory/')).status,200);
  for(const [orderNumber,stage] of [['QA_PICKUP','collected'],['QA_INTERNAL','internal_test']]){const response=await request('/api/admin/order-progress',{orderNumber,stage,note:'Explicit local QA confirmation',notifyCustomer:false});assert.equal(response.status,200);}
  let response=await request('/api/admin/inventory',{action:'initialize',accountedOrders:['QA_PICKUP'],products:[{sku:'AP734955',name:'Yoga',tracked:true,saleLocations:['gc'],landedCostUSD:307.6,balances:{gc:26,factory:30}}]});assert.equal(response.status,200);
  response=await request('/api/admin/inventory',{action:'initialize',products:[]});assert.equal(response.status,400);
  const movement={action:'movement',requestId:'http_movement_001',type:'sample',sku:'AP734955',quantity:1,from:'gc',note:'HTTP local test'};
  await request('/api/admin/inventory',movement);await request('/api/admin/inventory',movement);
  const view=await (await request('/api/admin/inventory')).json();assert.equal(view.products[0].balances.gc,25);
  const publicData=await (await request('/api/availability',null,false)).json();assert.equal(publicData.items[0].available,25);assert.doesNotMatch(JSON.stringify(publicData),/307.6|landedCostUSD|factory/);
  const page=await (await request('/products/yoga-cruiser.html')).text();assert.match(page,/"inventoryAvailable":25/);
  const state=JSON.parse(fs.readFileSync(path.join(dir,'state.json'),'utf8'));assert.equal(state.inventory.balances.AP734955.gc,25);
  assert.equal(state.orders.pickup.fulfilmentStatus,'collected');assert.equal(state.orders.internal.fulfilmentStatus,'not_required');assert.equal(state.orders.internal.amountTotal,74900);assert.deepEqual(state.transactionalEmailOutbox,{});
 }finally{if(server.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill();await exited;}fs.rmSync(dir,{recursive:true});}
});
