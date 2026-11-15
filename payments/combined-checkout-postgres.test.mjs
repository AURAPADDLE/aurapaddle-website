import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import pg from "pg";
import {createCombinedCheckoutCoordinator} from "./combined-checkout-integration.mjs";
import {loadCatalog,loadShippingRates} from "./lib.mjs";
import {createStateStore} from "./state-store.mjs";

const testUrl=process.env.AURA_TEST_POSTGRES_URL;
test("combined checkout is atomic across independent PostgreSQL instances",{skip:!testUrl},async()=>{
  const url=new URL(testUrl);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.match(url.pathname,/^\/aura_(?:combined_)?test/);
  const schema=`aura_combined_${crypto.randomBytes(8).toString("hex")}`,control=new pg.Pool({connectionString:testUrl,ssl:false});await control.query(`CREATE SCHEMA ${schema}`);url.searchParams.set("options",`-c search_path=${schema}`);
  const databaseUrl=url.toString(),stores=[],make=async bootstrap=>{const store=createStateStore({databaseUrl,bootstrapPostgres:bootstrap});stores.push(store);await store.init();return store};
  const catalog=loadCatalog(),rates=loadShippingRates(),coverage=JSON.parse(fs.readFileSync(new URL("shipping-coverage.review.json",import.meta.url),"utf8")),previewDependencies={catalog,rates,coverage};
  class StripeStub{calls=[];byKey=new Map();async createCheckoutSession(value){this.calls.push(value);if(!this.byKey.has(value.idempotencyKey))this.byKey.set(value.idempotencyKey,{id:`cs_pg_${this.byKey.size+1}`,url:"https://stripe.invalid/postgres"});return this.byKey.get(value.idempotencyKey)}}
  const stripe=new StripeStub(),input=(requestId,parentOrderNumber)=>({requestId,parentOrderNumber,items:[{sku:"AP734955",quantity:1},{sku:"AP505002",quantity:1}],deliveryLocation:{suburb:"Adelaide",state:"SA",postcode:"5000"},deliveryService:"standard",now:Date.parse("2026-11-15T12:00:00+10:00")});
  try{
    const first=await make(true);await first.mutate(state=>{state.inventoryAvailable={AP734955:1};state.orders.legacy={id:"legacy",paymentStatus:"paid"}});const second=await make(false),a=createCombinedCheckoutCoordinator({store:first,stripe,previewDependencies}),b=createCombinedCheckoutCoordinator({store:second,stripe,previewDependencies});
    const results=await Promise.allSettled([a.createSession(input("pg-last-unit-a","APO12345")),b.createSession(input("pg-last-unit-b","APO12346"))]);assert.equal(results.filter(x=>x.status==="fulfilled").length,1);assert.equal(results.filter(x=>x.status==="rejected"&&/unavailable/.test(x.reason.message)).length,1);
    const winnerIndex=results.findIndex(x=>x.status==="fulfilled"),winner=results[winnerIndex].value,requestId=winnerIndex===0?"pg-last-unit-a":"pg-last-unit-b",event={id:"evt_pg_paid",type:"checkout.session.completed",created:100,data:{object:{id:winner.sessionId,payment_status:"paid",amount_total:winner.amountTotal,currency:"aud",metadata:{aura_combined_request:requestId}}}};
    assert.equal((await a.applyWebhook(event)).applied,true);assert.equal((await b.applyWebhook(event)).applied,false);
    const before=await first.read();await assert.rejects(first.mutate(state=>{state.combinedOrders[requestId].paymentStatus="corrupt";throw Error("synthetic transaction failure")}),/synthetic/);assert.deepEqual((await first.read()).combinedOrders[requestId],before.combinedOrders[requestId]);
    await Promise.all(stores.map(store=>store.close()));stores.length=0;const restarted=await make(false),state=await restarted.read();assert.equal(state.combinedOrders[requestId].paymentStatus,"paid");assert.equal(state.orders.legacy.paymentStatus,"paid");assert.equal(Object.keys(state.combinedPaymentEvents).length,1);
  }finally{await Promise.all(stores.map(store=>store.close()));await control.query(`DROP SCHEMA ${schema} CASCADE`);await control.end()}
});
