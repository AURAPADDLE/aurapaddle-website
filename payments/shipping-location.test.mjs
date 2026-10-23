import test from "node:test";
import assert from "node:assert/strict";
import {assertShippingValidationConfiguration,compareDeliveryLocation,normaliseDeliveryLocation,resolveDeliveryLocation,validateCoverageTable} from "./shipping-location.mjs";
import {applyStripeEvent,buildCheckoutParams,updateOrderProgress} from "./lib.mjs";

const rates={byId:new Map([
  ["gold-coast-brisbane",{id:"gold-coast-brisbane"}],
  ["qld-nsw-main",{id:"qld-nsw-main"}],
  ["remote",{id:"remote",quoteRequired:true}]
])};
const table={status:"draft",version:"test-reviewed-v1",locations:[
  {suburb:"Southport",state:"QLD",postcode:"4215",regionId:"gold-coast-brisbane",reviewed:true,source:"carrier-test-fixture",effectiveFrom:"2026-10-01"},
  {suburb:"Melbourne",state:"VIC",postcode:"3000",regionId:"qld-nsw-main",reviewed:true,source:"carrier-test-fixture",effectiveFrom:"2026-10-01"}
]};

test("normalises an exact Australian suburb, state and postcode triplet",()=>{
  assert.deepEqual(normaliseDeliveryLocation({suburb:" southport ",state:"qld",postcode:"4215"}),{suburb:"southport",state:"QLD",postcode:"4215",country:"AU"});
});

test("Dooen VIC 3401 is not inferred to be Melbourne Metro",()=>{
  const result=resolveDeliveryLocation({suburb:"Dooen",state:"VIC",postcode:"3401"},table,rates);
  assert.equal(result.status,"manual_quote");assert.equal(result.quoteRequired,true);assert.equal(result.regionId,undefined);
});

test("requires exact suburb, state and postcode rather than state or postcode alone",()=>{
  assert.equal(resolveDeliveryLocation({suburb:"Southport",state:"NSW",postcode:"4215"},table,rates).status,"manual_quote");
  assert.equal(resolveDeliveryLocation({suburb:"Labrador",state:"QLD",postcode:"4215"},table,rates).status,"manual_quote");
  assert.equal(resolveDeliveryLocation({suburb:"Melbourne",state:"VIC",postcode:"3001"},table,rates).status,"manual_quote");
});

test("rejects invalid address fields",()=>{
  assert.equal(resolveDeliveryLocation({suburb:"Dooen",state:"VIC",postcode:"34"},table,rates).status,"invalid");
  assert.equal(resolveDeliveryLocation({suburb:"Dooen",state:"XX",postcode:"3401"},table,rates).status,"invalid");
});

test("detects a Stripe address change before fulfilment",()=>{
  const expected={suburb:"Melbourne",state:"VIC",postcode:"3000"};
  assert.equal(compareDeliveryLocation(expected,{city:"Melbourne",state:"vic",postalCode:"3000"}),true);
  assert.equal(compareDeliveryLocation(expected,{city:"Dooen",state:"VIC",postalCode:"3401"}),false);
});

test("coverage entries must be explicit, reviewed and attributable",()=>{
  assert.equal(validateCoverageTable(table,rates),table);
  assert.throws(()=>validateCoverageTable({...table,locations:[{suburb:"Dooen",state:"VIC",postcode:"3401",regionId:"qld-nsw-main"}]},rates),/Unreviewed carrier coverage/);
});

test("production enforcement rejects a draft or empty carrier table",()=>{
  assert.deepEqual(assertShippingValidationConfiguration("off",{status:"draft",locations:[]}),{mode:"off",coverageStatus:"draft",reviewedLocations:0});
  assert.deepEqual(assertShippingValidationConfiguration("draft",{status:"draft",locations:[]}),{mode:"draft",coverageStatus:"draft",reviewedLocations:0});
  assert.throws(()=>assertShippingValidationConfiguration("enforced",{status:"draft",locations:table.locations}),/non-empty approved/);
  assert.throws(()=>assertShippingValidationConfiguration("enforced",{status:"approved",locations:[]}),/non-empty approved/);
  assert.equal(assertShippingValidationConfiguration("enforced",{status:"approved",locations:table.locations}).mode,"enforced");
});

test("checkout metadata binds the verified address and coverage version",()=>{
  const variant={sku:"AP734955",slug:"yoga-cruiser",productName:"Yoga Cruiser",shortName:"Yoga Cruiser",size:"10'6\"",colour:"Glacier Blue",orderMode:"available",checkoutAmount:74900,depositAmount:37450};
  const params=buildCheckoutParams({items:[{variant,quantity:1}],priceBySku:new Map(),siteUrl:"https://www.aurapaddle.com",returnPath:"/cart/",shipping:{regionId:"qld-nsw-main",label:"QLD / NSW / ACT major cities, coastal areas & Melbourne Metro",amount:0,quoteRequired:false,pickup:false},shippingLocation:{suburb:"Melbourne",state:"VIC",postcode:"3000",coverageVersion:"test-reviewed-v1"},orderNumber:"APO12345",trackingToken:"1234567890abcdef"});
  assert.equal(params.get("metadata[aura_shipping_suburb]"),"Melbourne");
  assert.equal(params.get("metadata[aura_shipping_state]"),"VIC");
  assert.equal(params.get("metadata[aura_shipping_postcode]"),"3000");
  assert.equal(params.get("metadata[aura_shipping_coverage_version]"),"test-reviewed-v1");
});

test("changed Stripe address creates a fulfilment hold and blocks dispatch",()=>{
  const state={};
  const event={id:"evt_address_change",type:"checkout.session.completed",created:100, data:{object:{id:"cs_test_address_change",payment_status:"paid",amount_total:74900,currency:"aud",customer_details:{email:"buyer@example.com"},collected_information:{shipping_details:{name:"Buyer",address:{city:"Dooen",state:"VIC",postal_code:"3401",country:"AU"}}},metadata:{aura_items:"AP734955:1",aura_order_number:"APO12346",aura_tracking_token:"1234567890abcdef",aura_order_mode:"available",aura_payment_stage:"paid_in_full",aura_shipping_region:"qld-nsw-main",aura_shipping_label:"Melbourne Metro",aura_shipping_amount:"0",aura_shipping_suburb:"Melbourne",aura_shipping_state:"VIC",aura_shipping_postcode:"3000",aura_shipping_coverage_version:"test-reviewed-v1"}}}};
  assert.equal(applyStripeEvent(state,event),true);
  const order=state.orders.cs_test_address_change;
  assert.equal(order.shippingReviewRequired,true);
  assert.equal(order.fulfilmentStatus,"shipping_review_required");
  assert.throws(()=>updateOrderProgress(order,{stage:"dispatched",carrier:"Carrier",trackingNumber:"TRACK"},200),/freight review/);
  assert.throws(()=>updateOrderProgress(order,{stage:"collected",note:"pickup"},200),/freight review/);
  assert.throws(()=>updateOrderProgress(order,{stage:"internal_test",note:"test"},200),/freight review/);
  assert.equal(applyStripeEvent(state,event),false);
  assert.equal(order.initialPaymentStatus,"paid");
  assert.equal(order.paymentStatus,"paid");
  updateOrderProgress(order,{stage:"resolve_shipping_review",note:"Max confirmed the corrected carrier zone and freight before fulfilment."},210);
  assert.equal(order.shippingReviewRequired,false);
  assert.equal(order.fulfilmentStatus,"preparing_for_dispatch");
  assert.equal(order.orderAudit.at(-1).action,"resolve_shipping_review");
});

test("balance payment remains paid without hiding an open shipping review",()=>{
  const state={events:{},orders:{session:{orderNumber:"APO12348",amountTotal:50000,balanceRequestedAmount:50000,balanceInvoiceId:"in_balance",balancePaymentStatus:"requested",shippingReviewRequired:true,fulfilmentStatus:"shipping_review_required",initialPaymentStatus:"paid"}}};
  const event={id:"evt_balance_review",type:"invoice.paid",created:300,data:{object:{id:"in_balance",amount_paid:50000,amount_remaining:0,metadata:{aura_order_number:"APO12348"}}}};
  assert.equal(applyStripeEvent(state,event),true);
  const order=state.orders.session;
  assert.equal(order.balancePaymentStatus,"paid");
  assert.equal(order.shippingReviewRequired,true);
  assert.equal(order.fulfilmentStatus,"shipping_review_required");
  assert.equal(applyStripeEvent(state,event),false);
});

test("legacy paid orders without address metadata are not placed on hold",()=>{
  const state={};
  const event={id:"evt_legacy_address",type:"checkout.session.completed",created:100,data:{object:{id:"cs_test_legacy_address",payment_status:"paid",amount_total:74900,currency:"aud",customer_details:{email:"buyer@example.com"},collected_information:{shipping_details:{name:"Buyer",address:{city:"Dooen",state:"VIC",postal_code:"3401",country:"AU"}}},metadata:{aura_items:"AP734955:1",aura_order_number:"APO12349",aura_tracking_token:"1234567890abcdef",aura_order_mode:"available",aura_payment_stage:"paid_in_full",aura_shipping_region:"qld-nsw-main",aura_shipping_label:"Legacy selected region",aura_shipping_amount:"0"}}}};
  applyStripeEvent(state,event);
  assert.equal(state.orders.cs_test_legacy_address.shippingReviewRequired,false);
  assert.equal(state.orders.cs_test_legacy_address.fulfilmentStatus,"preparing_for_dispatch");
});

test("matching Stripe address preserves the normal fulfilment path",()=>{
  const state={};
  const event={id:"evt_address_match",type:"checkout.session.completed",created:100,data:{object:{id:"cs_test_address_match",payment_status:"paid",amount_total:74900,currency:"aud",customer_details:{email:"buyer@example.com"},collected_information:{shipping_details:{name:"Buyer",address:{city:"Melbourne",state:"VIC",postal_code:"3000",country:"AU"}}},metadata:{aura_items:"AP734955:1",aura_order_number:"APO12347",aura_tracking_token:"1234567890abcdef",aura_order_mode:"available",aura_payment_stage:"paid_in_full",aura_shipping_region:"qld-nsw-main",aura_shipping_label:"Melbourne Metro",aura_shipping_amount:"0",aura_shipping_suburb:"Melbourne",aura_shipping_state:"VIC",aura_shipping_postcode:"3000",aura_shipping_coverage_version:"test-reviewed-v1"}}}};
  applyStripeEvent(state,event);
  assert.equal(state.orders.cs_test_address_match.shippingReviewRequired,false);
  assert.equal(state.orders.cs_test_address_match.fulfilmentStatus,"preparing_for_dispatch");
});
