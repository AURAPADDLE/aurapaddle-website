import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {createCombinedCheckoutCoordinator} from "./combined-checkout-integration.mjs";
import {createCombinedCheckoutHttpHandler} from "./combined-checkout-http.mjs";
import {loadCatalog,loadShippingRates} from "./lib.mjs";
import {createStateStore} from "./state-store.mjs";

const catalog=loadCatalog(),rates=loadShippingRates(),coverage=JSON.parse(fs.readFileSync(new URL("shipping-coverage.review.json",import.meta.url),"utf8"));
const dependencies={catalog,rates,coverage,availability:new Map([["AP734955",1]])};
const request={requestId:"persistent-combined-1",parentOrderNumber:"APO12345",items:[{sku:"AP734955",quantity:1},{sku:"AP505002",quantity:1}],deliveryLocation:{suburb:"Adelaide",state:"SA",postcode:"5000"},deliveryService:"standard",now:Date.parse("2026-11-15T12:00:00+10:00")};

class PersistentStripeStub{
  calls=[];byKey=new Map();sessions=new Map();
  async createCheckoutSession(input){this.calls.push(structuredClone(input));if(this.byKey.has(input.idempotencyKey))return this.byKey.get(input.idempotencyKey);const session={id:`cs_persist_${this.byKey.size+1}`,url:"https://stripe.invalid/persistent"};this.byKey.set(input.idempotencyKey,session);this.sessions.set(session.id,{...session,status:"open",payment_status:"unpaid"});return session}
  async retrieveCheckoutSession(id){return structuredClone(this.sessions.get(id))}
}
const listen=handler=>new Promise(resolve=>{const server=http.createServer((req,res)=>handler(req,res));server.listen(0,"127.0.0.1",()=>resolve(server))});
const close=server=>new Promise(resolve=>server.close(resolve));
const post=(base,url,value,headers={})=>fetch(`${base}${url}`,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(value)});
const timestamp=1794787200,secret="whsec_local_combined_fixture",signature=(value,{at=timestamp,raw=JSON.stringify(value),key=secret}={})=>{const v1=crypto.createHmac("sha256",key).update(`${at}.${raw}`).digest("hex");return {"Stripe-Signature":`t=${at},v1=${v1}`}};

test("default-off HTTP adapter persists one parent payment and groups across restart",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"aura-combined-persist-")),statePath=path.join(dir,"state.json"),stripe=new PersistentStripeStub();
  let store=createStateStore({statePath}),coordinator,server;
  try{
    await store.init();await store.mutate(state=>{state.inventoryAvailable={AP734955:1}});coordinator=createCombinedCheckoutCoordinator({store,stripe,previewDependencies:dependencies});
    server=await listen(createCombinedCheckoutHttpHandler({coordinator}));let base=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await post(base,"/api/combined-checkout",request)).status,404);await close(server);
    server=await listen(createCombinedCheckoutHttpHandler({coordinator,enabled:true}));base=`http://127.0.0.1:${server.address().port}`;
    const created=await (await post(base,"/api/combined-checkout",request)).json();assert.equal(created.status,"session_created");assert.equal(created.amountTotal,125250);assert.equal(stripe.byKey.size,1);await close(server);await store.close();

    store=createStateStore({statePath});await store.init();coordinator=createCombinedCheckoutCoordinator({store,stripe,previewDependencies:dependencies});server=await listen(createCombinedCheckoutHttpHandler({coordinator,enabled:true,webhookSecret:secret,now:()=>timestamp}));base=`http://127.0.0.1:${server.address().port}`;
    const retry=await (await post(base,"/api/combined-checkout",request)).json();assert.equal(retry.sessionId,created.sessionId);assert.equal(stripe.byKey.size,1);
    const paid={id:"evt_persist_paid",type:"checkout.session.completed",created:100,data:{object:{id:created.sessionId,payment_status:"paid",amount_total:created.amountTotal,currency:"aud",metadata:{aura_combined_request:request.requestId}}}};
    assert.equal((await post(base,"/api/combined-checkout/mock-webhook",paid)).status,400);
    assert.equal((await post(base,"/api/combined-checkout/mock-webhook",paid,signature(paid,{key:"wrong_local_secret"}))).status,400);
    assert.equal((await post(base,"/api/combined-checkout/mock-webhook",paid,signature(paid,{at:timestamp-301}))).status,400);
    const differentlyEncoded=JSON.stringify(paid,null,2);assert.equal((await fetch(`${base}/api/combined-checkout/mock-webhook`,{method:"POST",headers:{"Content-Type":"application/json",...signature(paid)},body:differentlyEncoded})).status,400);
    assert.equal((await (await post(base,"/api/combined-checkout/mock-webhook",paid,signature(paid))).json()).applied,true);
    assert.equal((await (await post(base,"/api/combined-checkout/mock-webhook",paid,signature(paid))).json()).applied,false);
    const refund={id:"evt_partial_refund",type:"charge.refunded",created:101,data:{object:{amount_refunded:1000,metadata:{aura_combined_request:request.requestId}}}};
    assert.equal((await (await post(base,"/api/combined-checkout/mock-webhook",refund,signature(refund))).json()).reason,"refund_review_required");
    assert.equal((await (await post(base,"/api/combined-checkout/mock-webhook",refund,signature(refund))).json()).reason,"duplicate_refund");
    const state=await store.read(),order=state.combinedOrders[request.requestId];assert.equal(order.paymentStatus,"paid");assert.equal(order.groups.find(group=>group.kind==="stock").fulfilmentStatus,"preparing_for_dispatch");assert.equal(order.groups.find(group=>group.kind==="delayed").paymentStatus,"deposit_paid");assert.equal(order.refundReviewRequired,true);assert.equal(order.unallocatedRefundAmount,1000);
  }finally{if(server?.listening)await close(server);await store?.close();fs.rmSync(dir,{recursive:true,force:true})}
});
