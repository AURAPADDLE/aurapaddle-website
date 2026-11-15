import test from "node:test";
import assert from "node:assert/strict";
import {checkoutAttemptLog} from "./checkout-attempt-log.mjs";

test("checkout attempt logs only an allowlisted anonymous schema",()=>{
  let output="";
  const entry=checkoutAttemptLog({stage:"blocked",reason:"mixed_payment_modes",paymentMode:"preorder",itemCount:2,now:"2026-11-15T00:00:00Z",email:"private@example.test",address:"private",requestBody:{secret:true}},value=>{output=value});
  assert.deepEqual(entry,{event:"aura_checkout_attempt",version:1,stage:"blocked",paymentMode:"preorder",itemCount:2,at:"2026-11-15T00:00:00.000Z",reason:"mixed_payment_modes"});
  assert.doesNotMatch(output,/private|address|requestBody|email|secret/);
});

test("unknown values fail closed instead of entering logs",()=>{
  const entry=checkoutAttemptLog({stage:"customer@example.test",reason:"raw server error",paymentMode:"other",itemCount:999},()=>{});
  assert.equal(entry.stage,"failed");assert.equal(entry.reason,"unexpected");assert.equal(entry.paymentMode,"unknown");assert.equal(entry.itemCount,50);
});
