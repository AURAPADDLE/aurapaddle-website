import test from "node:test";
import assert from "node:assert/strict";
import {createStripeSandboxAdapter} from "./stripe-sandbox-adapter.mjs";

const request={
  amountTotal:125250,
  currency:"aud",
  idempotencyKey:"aura-combined-sandbox-fixture-1",
  recoveryEnabled:false,
  metadata:{aura_combined_request:"sandbox-fixture-1",aura_parent_order:"SYNTHETIC-APO-1"},
  groups:[{id:"stock",amount:87800},{id:"preorder",amount:37450}]
};

function fixture(){
  const calls=[];
  const client={checkout:{sessions:{
    async create(params,options){calls.push({params,options});return {id:"cs_test_redacted",url:"https://checkout.stripe.test/redacted"}},
    async retrieve(id){return {id,status:"open",payment_status:"unpaid"}}
  }}};
  return {calls,adapter:createStripeSandboxAdapter({client})};
}

test("one synthetic mixed-cart Session contains exact group cents and no customer or receipt address",async()=>{
  const {calls,adapter}=fixture(),session=await adapter.createCheckoutSession(request);
  assert.equal(session.id,"cs_test_redacted");
  assert.equal(calls.length,1);
  const {params,options}=calls[0];
  assert.deepEqual(params.line_items.map(line=>line.price_data.unit_amount),[87800,37450]);
  assert.equal(params.line_items.reduce((sum,line)=>sum+line.price_data.unit_amount*line.quantity,0),125250);
  assert.equal(options.idempotencyKey,request.idempotencyKey);
  assert.equal(params.metadata.aura_synthetic,"true");
  assert.equal(params.after_expiration.recovery.enabled,false);
  assert.match(params.success_url,/checkout-combined-success\.html\?session_id=\{CHECKOUT_SESSION_ID\}$/);
  assert.match(params.cancel_url,/checkout-combined-success\.html\?cancelled=1$/);
  assert.equal(params.allow_promotion_codes,false);
  assert.equal("customer" in params,false);
  assert.equal("customer_email" in params,false);
  assert.equal("receipt_email" in params,false);
  assert.equal("payment_method_types" in params,false);
  assert.equal("receipt_email" in params.payment_intent_data,false);
});

test("amount mismatch and non-AUD fixtures fail before any Stripe request",async()=>{
  const {calls,adapter}=fixture();
  await assert.rejects(()=>adapter.createCheckoutSession({...request,amountTotal:125251}),/must equal/);
  await assert.rejects(()=>adapter.createCheckoutSession({...request,currency:"usd"}),/only permits AUD/);
  assert.equal(calls.length,0);
});

test("provider retrieval remains available for authoritative expiry checks",async()=>{
  const {adapter}=fixture();
  assert.deepEqual(await adapter.retrieveCheckoutSession("cs_test_redacted"),{id:"cs_test_redacted",status:"open",payment_status:"unpaid"});
});
