import test from "node:test";
import assert from "node:assert/strict";
import {TransactionStore} from "./combined-checkout-integration.mjs";
import {payDelayedGroup} from "./catalog-combined-ledger.mjs";
import {requestCombinedBalance} from "./combined-balance-service.mjs";

const requestId="balance-service-fixture",groupId="APO48101:delayed:batch-1",operationId="balance-op-1";
const initial=()=>({combinedOrders:{[requestId]:{parentOrderNumber:"APO48101",customerId:"cus_fixture",customer:{email:"buyer@example.invalid"},shippingReviewRequired:false,groups:[{id:groupId,kind:"delayed",items:[{sku:"AP505002",quantity:1}],remainingProductBalance:37450,paymentStatus:"deposit_paid",fulfilmentStatus:"awaiting_fulfilment"}]}}});
const invoice={id:"in_fixture",status:"open",hostedInvoiceUrl:"https://invoice.stripe.com/i/test_fixture",amountDue:41950};

test("balance request records the authorised amount before provider work and queues one application email",async()=>{
  const store=new TransactionStore(initial()),seen=[];
  const result=await requestCombinedBalance({store,stripe:{createBalanceInvoice:async request=>{seen.push(await store.read());return invoice}},requestId,groupId,shippingAmount:4500,operationId,now:10,taxRateId:"txr_fixture"});
  const state=await store.read(),group=state.combinedOrders[requestId].groups[0];
  assert.equal(seen[0].combinedOrders[requestId].groups[0].balanceRequestedAmount,41950);
  assert.equal(group.balanceInvoiceId,invoice.id);assert.equal(group.balanceInvoiceStatus,"open");assert.equal(result.amountTotal,41950);
  assert.deepEqual(Object.keys(state.transactionalEmailOutbox),[`${operationId}:combined_balance_requested`]);
  const again=await requestCombinedBalance({store,stripe:{createBalanceInvoice:async()=>{throw Error("must not create again")}},requestId,groupId,shippingAmount:4500,operationId:"different-retry",now:11,taxRateId:"txr_fixture"});
  assert.equal(again.existing,true);assert.equal(Object.keys((await store.read()).transactionalEmailOutbox).length,1);
});

test("authoritative paid webhook can win before invoice binding without a stale request email",async()=>{
  const store=new TransactionStore(initial());
  const result=await requestCombinedBalance({store,stripe:{createBalanceInvoice:async()=>{await store.mutate(state=>payDelayedGroup(state,{eventId:"evt_fast_paid",requestId,groupId,amountPaid:41950,now:11}));return invoice}},requestId,groupId,shippingAmount:4500,operationId,now:10,taxRateId:"txr_fixture"});
  const state=await store.read(),group=state.combinedOrders[requestId].groups[0];
  assert.equal(result.complete,true);assert.equal(group.paymentStatus,"paid_in_full");assert.equal(group.balanceInvoiceStatus,"paid");assert.equal(Object.keys(state.transactionalEmailOutbox||{}).length,0);
});

test("provider timeout leaves a resumable authorised request and retry binds exactly one invoice",async()=>{
  const store=new TransactionStore(initial());let attempts=0;
  const stripe={createBalanceInvoice:async()=>{attempts++;if(attempts===1)throw Error("ambiguous provider timeout");return invoice}};
  await assert.rejects(()=>requestCombinedBalance({store,stripe,requestId,groupId,shippingAmount:4500,operationId,now:10,taxRateId:"txr_fixture"}),/ambiguous/);
  let state=await store.read(),group=state.combinedOrders[requestId].groups[0];assert.equal(group.paymentStatus,"balance_requested");assert.equal(group.balanceInvoiceStatus,"creating");assert.equal(group.balanceInvoiceId,undefined);
  await requestCombinedBalance({store,stripe,requestId,groupId,shippingAmount:4500,operationId,now:11,taxRateId:"txr_fixture"});
  state=await store.read();group=state.combinedOrders[requestId].groups[0];assert.equal(attempts,2);assert.equal(group.balanceInvoiceId,invoice.id);assert.equal(Object.keys(state.transactionalEmailOutbox).length,1);
});
