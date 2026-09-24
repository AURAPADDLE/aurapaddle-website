import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {orderAttributionAudit,markAnalyticsDelivery} from "./attribution-audit.mjs";
import {adminOrderList,normaliseAttribution} from "./lib.mjs";

const order=()=>({orderNumber:"APO12345",initialPaymentStatus:"paid",attribution:{consent:{analytics:true,marketing:true},analyticsClientId:"123.456",analyticsSessionId:"789",first:{source:"newsletter",medium:"email",evidence:"utm"},last:{source:"google",medium:"cpc",clickId:"private_click_value",evidence:"google_click_id"}}});
test("necessary-only order has explicit reason, never an invented source",()=>{
  const o=order();o.attribution.consent={analytics:false,marketing:false};
  const result=orderAttributionAudit(o,{});
  assert.equal(result.purchase.status,"not_sent_consent");assert.equal(result.purchase.attention,false);
  assert.equal(result.sourceStatus,"unknown_no_consent");assert.equal(result.last,null);
  assert.equal(result.googleClickIdPresent,false);assert.equal(result.clientIdPresent,false);
});
test("missing identifiers, queue records and configuration failures are distinguishable",()=>{
  const o=order();assert.equal(orderAttributionAudit(o,{}).purchase.status,"not_queued");
  assert.equal(orderAttributionAudit(o,{}, {configured:false}).purchase.status,"configuration_blocked");
  delete o.attribution.analyticsClientId;
  assert.equal(orderAttributionAudit(o,{}).purchase.status,"not_sent_missing_client");
});
test("delivery diagnostics do not disclose IDs or claim GA4/Ads attribution",()=>{
  const o=order(),state={orders:{cs_test:o},analyticsOutbox:{"purchase:APO12345":{status:"sent",sentAt:123,attempts:1}}};
  const audit=adminOrderList(state)[0].attributionAudit;
  assert.equal(audit.last.source,"google");assert.equal(audit.purchase.status,"sent_unverified");assert.equal(audit.adsAttribution,"unverified");
  assert.ok(!JSON.stringify(audit).includes("private_click_value"));assert.ok(!JSON.stringify(audit).includes("123.456"));
});
test("validation success cannot be counted as a sent production event",()=>{
  const entry={status:"sending",claimedAt:1,lastError:"prior"};markAnalyticsDelivery(entry,{validationMode:true,now:100});
  assert.equal(entry.status,"validated");assert.equal(entry.sentAt,undefined);assert.equal(entry.validatedAt,100);
  assert.equal(orderAttributionAudit(order(),{analyticsOutbox:{"purchase:APO12345":entry}}).purchase.status,"validation_only");
  markAnalyticsDelivery(entry,{now:200});assert.equal(entry.status,"sent");assert.equal(entry.validatedAt,undefined);assert.equal(entry.sentAt,200);
});
test("pending, retries and failed delivery stay visible",()=>{
  for(const status of ["pending","retry","sending","failed"]){
    const result=orderAttributionAudit(order(),{analyticsOutbox:{"purchase:APO12345":{status,attempts:3}}});
    assert.equal(result.purchase.status,status);assert.equal(result.purchase.attempts,3);
  }
});
test("source evidence is allowed only with analytics consent",()=>{
  const value={consent:{analytics:true,marketing:false},last:{source:"newsletter",medium:"email",evidence:"utm"}};
  assert.equal(normaliseAttribution(value).last.evidence,"utm");
  assert.equal(normaliseAttribution({...value,consent:{analytics:false,marketing:true}}).last,undefined);
  assert.equal(normaliseAttribution({...value,last:{source:"email",evidence:"untrusted"}}).last.evidence,undefined);
});
test("admin source panel renders statuses and escapes user-controlled campaign text",()=>{
  const html=fs.readFileSync(new URL('../admin/orders/index.html',import.meta.url),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const context={document:{getElementById:()=>({addEventListener(){}})},sessionStorage:{getItem:()=>null}};
  vm.createContext(context);vm.runInContext(script,context);
  const o=order();o.attribution.last.campaign='<img src=x onerror=alert(1)>';
  const card=vm.runInContext(`attributionCard(${JSON.stringify({attributionAudit:orderAttributionAudit(o,{})})})`,context);
  assert.ok(card.includes('not queued'));assert.ok(card.includes('&lt;img'));assert.ok(!card.includes('<img'));
  assert.ok(card.includes('does not confirm inclusion in GA4'));
});
