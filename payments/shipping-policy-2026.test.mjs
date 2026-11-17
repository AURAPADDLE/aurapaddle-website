import test from "node:test";
import assert from "node:assert/strict";
import coastGoOffer from "../coastgo-offer.js";
import {buildCheckoutParams,calculateShipping,loadCatalog,loadShippingRates,normaliseCheckoutItems} from "./lib.mjs";
import {applyCatalogueCombinedPayment,buildCatalogueCombinedPlan,confirmDelayedGroup,reserveCatalogueCombinedOrder} from "./catalog-combined-ledger.mjs";

const catalog=loadCatalog(),rates=loadShippingRates();
const items=(sku,quantity=1)=>normaliseCheckoutItems([{sku,quantity}],catalog,Date.parse("2026-11-16T00:00:00+10:00"));

test("new per-board standard freight is stable across every verified published region",()=>{
  const regions=["gold-coast-brisbane","qld-nsw-main","canberra-melbourne","adelaide","perth","tasmania"];
  for(const [sku,amount] of [["AP734955",5000],["AP550986",5000],["AP881762",5000],["AP579723",15000],["AP200288",20000],["AP665269",25000]])for(const region of regions)assert.equal(calculateShipping(items(sku,2),region,rates).amount,amount*2,`${sku} ${region}`);
});

test("quote-only, remote and island paths never invent a fixed charge",()=>{
  for(const sku of ["AP500687","AP428330","AP246531"])assert.equal(calculateShipping(items(sku),"qld-nsw-main",rates).quoteRequired,true,sku);
  for(const sku of ["AP734955","AP550986","AP579723"])assert.equal(calculateShipping(items(sku),"remote",rates).quoteRequired,true,sku);
});

test("CoastGo retains its own tariffs, express and promotion without reducing other lines",()=>{
  const now=Date.parse("2026-11-16T00:00:00+10:00"),coast=items("AP081165"),yoga=items("AP734955"),mixed=[...coast,...yoga];
  assert.equal(calculateShipping(coast,"qld-nsw-main",rates,now,"",true).amount,0);
  assert.equal(calculateShipping(coast,"coastgo-express",rates,now).amount,12000);
  const quote=calculateShipping(mixed,"qld-nsw-main",rates,now,"",true);
  assert.equal(quote.amount,0);assert.deepEqual(quote.promotionIds,[coastGoOffer.shippingPromotionId]);
  assert.equal(calculateShipping(coast,"qld-nsw-main",rates,Date.parse(coastGoOffer.shippingEndsAt)).amount,4500);
});

test("preorder checkout freezes known freight but still collects it before dispatch",()=>{
  const preorder=items("AP505002",2),shipping=calculateShipping(preorder,"adelaide",rates),params=buildCheckoutParams({items:preorder,shipping,siteUrl:"https://example.invalid"});
  assert.equal(shipping.amount,10000);assert.equal(params.get("metadata[aura_shipping_amount]"),"10000");assert.equal(params.get("metadata[aura_shipping_stage]"),"pay_before_dispatch");assert.equal(params.get("line_items[1][price_data][unit_amount]"),null);
});

test("combined preorder groups freeze freight and reject a later silent price change",()=>{
  const stock={variant:catalog.bySku.get("AP734955"),quantity:1},preorder={variant:catalog.bySku.get("AP505002"),quantity:2};
  const plan=buildCatalogueCombinedPlan({requestId:"shipping-snapshot-1",parentOrderNumber:"APO11111",lines:[stock,preorder],stockShipping:{amount:5000},delayedShippingByTerm:{"yoga-cruiser-no-minimum-v1":{amount:10000,quoteRequired:false}}});
  const group=plan.groups.find(entry=>entry.kind==="delayed"),state={};reserveCatalogueCombinedOrder(state,plan);applyCatalogueCombinedPayment(state,{eventId:"evt_shipping_snapshot",requestId:plan.requestId,amountPaid:plan.dueToday});
  assert.equal(group.quotedShippingAmount,10000);assert.equal(group.shippingQuoteRequired,false);
  assert.throws(()=>confirmDelayedGroup(state,{requestId:plan.requestId,groupId:group.id,shippingAmount:10001}),/frozen/);
  assert.equal(confirmDelayedGroup(state,{requestId:plan.requestId,groupId:group.id,shippingAmount:10000}),84900);
});
