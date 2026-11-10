import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import {issueMetaPurchaseReceipt,redeemMetaPurchaseReceipt,verifiedMetaPurchase} from "./meta-purchase.mjs";

const source=fs.readFileSync(new URL("../meta-pixel.js",import.meta.url),"utf8");
function fixture({saved,region,path="/products/yoga-cruiser.html",search=""}={}){
  const storage=new Map(),session=new Map(),scripts=[],listeners=new Map(),cookies=[];
  if(saved!==undefined)storage.set("aura-cookie-consent-v1",JSON.stringify({necessary:true,analytics:false,marketing:saved}));
  const window={AURA_TRUSTED_REGION:region,AURAMeasurementQueue:[],addEventListener:(name,fn)=>{const values=listeners.get(name)||[];values.push(fn);listeners.set(name,values)},dispatchEvent:event=>(listeners.get(event.type)||[]).forEach(fn=>fn(event))};
  const location={pathname:path,href:`https://www.aurapaddle.com${path}${search}`};
  const document={createElement:()=>({async:false,src:""}),head:{append:script=>scripts.push(script)},set cookie(value){cookies.push(value)},get cookie(){return ""}};
  const context={window,document,location,URL,JSON,Map,Number,String,Math,Promise,CustomEvent:function(type,options){return {type,detail:options?.detail}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))},sessionStorage:{getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,String(value)),removeItem:key=>session.delete(key)},fetch:async()=>({ok:false}),console};
  vm.runInNewContext(source,context);
  return {window,storage,session,scripts,cookies,emit:(name,detail)=>window.dispatchEvent({type:name,detail})};
}

test("unknown, non-Australian and absent region sources fail closed",()=>{
  for(const region of [undefined,{country:"AU",source:"client"},{country:"NZ",source:"trusted-server"}])assert.equal(fixture({region}).scripts.length,0);
});
test("trusted Australian default applies only without a saved choice",()=>{
  assert.equal(fixture({region:{country:"AU",source:"trusted-server"}}).scripts[0].src,"https://connect.facebook.net/en_US/fbevents.js");
  assert.equal(fixture({saved:false,region:{country:"AU",source:"trusted-server"}}).scripts.length,0);
  assert.equal(fixture({saved:true}).scripts[0].src,"https://connect.facebook.net/en_US/fbevents.js");
});
test("sensitive and tokenised routes never initialise",()=>{
  for(const value of [{path:"/checkout-success.html"},{path:"/admin/orders/"},{path:"/order/",search:"?token=secret"},{path:"/products/yoga-cruiser.html",search:"?session_id=secret"}])assert.equal(fixture({saved:true,...value}).scripts.length,0);
});
test("approved commerce events are minimised and unapproved events ignored",()=>{
  const f=fixture({saved:true}),before=f.window.fbq.queue.length;
  assert.equal(f.window.AURAMeta.event("add_to_cart",{value:749,currency:"USD",email:"private@example.com",items:[{item_id:"AP734955",item_name:"Yoga Cruiser",price:749,quantity:1,email:"private@example.com"}]}),true);
  assert.equal(f.window.AURAMeta.event("sign_up",{email:"private@example.com"}),false);
  const call=f.window.fbq.queue[before];assert.equal(call[1],"AddToCart");assert.equal(call[2].currency,"AUD");assert.equal(JSON.stringify(call).includes("private@example.com"),false);
});
test("withdrawal stops events and expires Meta cookies",()=>{
  const f=fixture({saved:true});f.storage.set("aura-cookie-consent-v1",JSON.stringify({marketing:false}));f.emit("aura:consent",{marketing:false});
  assert.equal(f.window.AURAMeta.event("view_item",{items:[{item_id:"AP734955"}]}),false);assert.ok(f.cookies.some(value=>value.startsWith("_fbp=")));
});
test("verified purchase requires persisted paid order and marketing consent",()=>{
  const order={orderNumber:"APO12345",initialPaymentStatus:"paid",amountTotal:37450,currency:"aud",items:[{sku:"AP734955",quantity:1}],attribution:{consent:{marketing:true}}};
  const purchase=verifiedMetaPurchase({orders:{cs_test_abc:order}},"cs_test_abc");assert.deepEqual({...purchase},{...purchase,verified:true,value:374.5,currency:"AUD"});assert.equal(purchase.items[0].sku,"AP734955");
  assert.equal(verifiedMetaPurchase({orders:{cs_test_abc:{...order,initialPaymentStatus:"pending"}}},"cs_test_abc"),null);
  assert.equal(verifiedMetaPurchase({orders:{cs_test_abc:{...order,attribution:{consent:{marketing:false}}}}},"cs_test_abc"),null);
});
test("stable event ID and browser marker prevent refresh duplicates",()=>{
  const f=fixture({saved:true}),payload={verified:true,eventId:"1234567890abcdef1234567890abcdef",value:374.5,items:[{sku:"AP734955",quantity:1}]};
  assert.equal(f.window.AURAMeta.purchase(payload),true);assert.equal(f.window.AURAMeta.purchase(payload),false);
});

test("browser-bound receipt is short lived and can be redeemed only once",()=>{
  const binding="browser-secret",state={orders:{cs_test_abc:{orderNumber:"APO12345",initialPaymentStatus:"paid",amountTotal:37450,currency:"aud",items:[{sku:"AP734955",quantity:1}],attribution:{consent:{marketing:true},metaChoice:"explicit_allow"},metaCheckoutBindingHash:crypto.createHash("sha256").update(binding).digest("hex")}}};
  assert.equal(issueMetaPurchaseReceipt(state,{sessionId:"cs_test_abc",bindingToken:"wrong",now:100}),null);
  const issued=issueMetaPurchaseReceipt(state,{sessionId:"cs_test_abc",bindingToken:binding,now:100,randomBytes:()=>Buffer.alloc(32,7)});assert.ok(issued.receipt);assert.equal(issued.expiresIn,600);
  const purchase=redeemMetaPurchaseReceipt(state,{receipt:issued.receipt,now:101});assert.equal(purchase.verified,true);assert.equal(purchase.metaChoice,"explicit_allow");
  assert.equal(redeemMetaPurchaseReceipt(state,{receipt:issued.receipt,now:102}),null);
});

test("expired receipts and orders not persisted as paid fail closed",()=>{
  const binding="browser-secret",hash=crypto.createHash("sha256").update(binding).digest("hex"),order={orderNumber:"APO12345",initialPaymentStatus:"paid",amountTotal:37450,currency:"aud",items:[{sku:"AP734955",quantity:1}],attribution:{consent:{marketing:true}},metaCheckoutBindingHash:hash},state={orders:{cs_test_abc:order}};
  const issued=issueMetaPurchaseReceipt(state,{sessionId:"cs_test_abc",bindingToken:binding,now:100,randomBytes:()=>Buffer.alloc(32,8)});assert.equal(redeemMetaPurchaseReceipt(state,{receipt:issued.receipt,now:701}),null);
  order.initialPaymentStatus="pending";assert.equal(issueMetaPurchaseReceipt(state,{sessionId:"cs_test_abc",bindingToken:binding,now:800}),null);
});

test("clean confirmation page verifies before loading local Pixel code and forbids referrers",()=>{
  const html=fs.readFileSync(new URL("../purchase-confirmed.html",import.meta.url),"utf8");
  assert.match(html,/<meta name="referrer" content="no-referrer">/);assert.match(html,/location\.search\|\|location\.hash\|\|document\.referrer/);
  assert.ok(html.indexOf('fetch("/api/meta-purchase/redeem"')<html.indexOf('script.src="/meta-pixel.js"'));
  assert.doesNotMatch(html,/session_id|trackingToken|customerEmail/);
});
