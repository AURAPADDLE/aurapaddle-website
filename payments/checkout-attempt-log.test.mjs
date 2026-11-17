import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {CHECKOUT_BLOCK_RETENTION_SECONDS,checkoutAttemptToken,checkoutBlockList,checkoutBlockReason,recordCheckoutBlock,resolveCheckoutBlocks} from "./checkout-attempt-log.mjs";

test("records only an allowlisted anonymous blocker schema",()=>{
  const state={},attemptToken=checkoutAttemptToken("group-available-123");
  const entry=recordCheckoutBlock(state,{attemptToken,stage:"delivery",reason:"manual_quote",paymentMode:"available",itemCount:2,email:"private@example.test",address:"private",requestBody:{secret:true}},1000);
  assert.equal(entry.attemptToken,attemptToken);assert.equal(entry.reason,"manual_quote");assert.doesNotMatch(JSON.stringify(entry),/private|address|requestBody|email|secret/);
  assert.deepEqual(Object.keys(checkoutBlockList(state,1000)[0]).sort(),["createdAt","id","itemCount","lastAt","paymentMode","reason","repeatCount","resolvedAt","stage","status"].sort());
});

test("dedupes same group and reason while keeping other groups distinct",()=>{
  const state={},attemptToken=checkoutAttemptToken("same-cart-attempt"),base={attemptToken,stage:"delivery",reason:"manual_quote",itemCount:2};
  const first=recordCheckoutBlock(state,{...base,paymentMode:"available"},1000),repeat=recordCheckoutBlock(state,{...base,paymentMode:"available"},1100);
  recordCheckoutBlock(state,{...base,paymentMode:"preorder"},1100);recordCheckoutBlock(state,{...base,paymentMode:"available",reason:"region_mismatch"},1100);
  assert.equal(first.id,repeat.id);assert.equal(repeat.repeatCount,2);assert.equal(checkoutBlockList(state,1100).length,3);
});

test("later session creation resolves only its anonymous attempt",()=>{const state={},one=checkoutAttemptToken("checkout-group-one"),two=checkoutAttemptToken("checkout-group-two");recordCheckoutBlock(state,{attemptToken:one,stage:"cart",reason:"mixed_payment_modes"},1000);recordCheckoutBlock(state,{attemptToken:two,stage:"delivery",reason:"manual_quote"},1000);assert.equal(resolveCheckoutBlocks(state,{attemptToken:one,now:1200}),1);const list=checkoutBlockList(state,1200);assert.equal(list.find(x=>x.reason==="mixed_payment_modes").status,"resolved");assert.equal(list.find(x=>x.reason==="manual_quote").status,"blocked")});
test("retention prunes old records and internal fixtures are excluded",()=>{const state={},token=checkoutAttemptToken("retention-attempt");assert.equal(recordCheckoutBlock(state,{attemptToken:token,stage:"input",reason:"invalid_email",internalTest:true},1),null);recordCheckoutBlock(state,{attemptToken:token,stage:"input",reason:"invalid_email"},1);assert.equal(checkoutBlockList(state,CHECKOUT_BLOCK_RETENTION_SECONDS+2).length,0)});
test("classifies cart validation without retaining raw errors",()=>{assert.equal(checkoutBlockReason(new Error("Place in-stock and pre-order products in separate orders.")),"mixed_payment_modes");assert.equal(checkoutBlockReason(new Error("private unknown SKU detail")),"invalid_items")});
test("private view uses existing bearer auth and exposes no customer fields",()=>{const html=fs.readFileSync(new URL("../admin/checkout-blocks/index.html",import.meta.url),"utf8"),server=fs.readFileSync(new URL("server.mjs",import.meta.url),"utf8");assert.match(html,/Authorization:`Bearer \$\{token\}`/);assert.match(server,/api\/admin\/checkout-blocks/);assert.match(server,/requireAdmin\(req\)/);assert.doesNotMatch(html,/<th>(Customer|Email|Address|Postcode|IP|Stripe Session)<\/th>/i)});
