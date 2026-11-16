import test from "node:test";
import assert from "node:assert/strict";
import {TransactionStore} from "./combined-checkout-integration.mjs";
import {payDelayedGroup} from "./catalog-combined-ledger.mjs";
import {refreshCombinedBalanceLink,requestCombinedBalance} from "./combined-balance-service.mjs";

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

const refreshState=()=>{const state=initial(),group=state.combinedOrders[requestId].groups[0];state.combinedOrders[requestId].currency="aud";group.paymentStatus="balance_requested";group.confirmedShippingAmount=4500;group.balanceRequestedAmount=41950;group.balanceInvoiceId="in_fixture";group.balanceInvoiceStatus="open";group.balanceInvoiceUrl="https://invoice.stripe.com/i/old";return state};
const refreshedInvoice=overrides=>({id:"in_fixture",status:"open",currency:"aud",amount_due:41950,amount_remaining:41950,hosted_invoice_url:"https://invoice.stripe.com/i/new",metadata:{aura_combined_request:requestId,aura_group_id:groupId,aura_parent_order:"APO48101",aura_payment_stage:"combined_balance"},...overrides});

test("admin refresh retrieves and stores only the same open unpaid invoice link without queuing email",async()=>{
  const store=new TransactionStore(refreshState()),calls=[];
  await refreshCombinedBalanceLink({store,stripe:{retrieveBalanceInvoice:async id=>{calls.push(id);return refreshedInvoice()}},requestId,groupId,operationId:"refresh-link-1",now:20});
  await refreshCombinedBalanceLink({store,stripe:{retrieveBalanceInvoice:async id=>{calls.push(id);return refreshedInvoice()}},requestId,groupId,operationId:"refresh-link-1",now:21});
  const state=await store.read(),group=state.combinedOrders[requestId].groups[0];
  assert.deepEqual(calls,["in_fixture","in_fixture"]);assert.equal(group.balanceInvoiceUrl,"https://invoice.stripe.com/i/new");assert.equal(group.balanceInvoiceLinkRefreshOperationId,"refresh-link-1");assert.equal(Object.keys(state.transactionalEmailOutbox||{}).length,0);
});

test("balance link refresh rejects paid, voided, wrong-group, mismatched amount and missing URL invoices",async()=>{
  for(const [name,mutate,invoice,pattern] of [
    ["paid",state=>{state.combinedOrders[requestId].groups[0].paymentStatus="paid_in_full"},refreshedInvoice(),/already paid/],
    ["voided",state=>{state.combinedOrders[requestId].groups[0].balanceInvoiceStatus="voided"},refreshedInvoice(),/no longer payable/],
    ["wrong-group",()=>{},refreshedInvoice({metadata:{aura_combined_request:requestId,aura_group_id:"other-group",aura_parent_order:"APO48101",aura_payment_stage:"combined_balance"}}),/ownership/],
    ["amount",()=>{},refreshedInvoice({amount_due:41951,amount_remaining:41951}),/amount or currency/],
    ["missing-url",()=>{},refreshedInvoice({hosted_invoice_url:""}),/valid hosted invoice link/]
  ]){const state=refreshState();mutate(state);const store=new TransactionStore(state);await assert.rejects(()=>refreshCombinedBalanceLink({store,stripe:{retrieveBalanceInvoice:async()=>invoice},requestId,groupId,operationId:`refresh-${name}`,now:20}),pattern);assert.equal((await store.read()).combinedOrders[requestId].groups[0].balanceInvoiceUrl,"https://invoice.stripe.com/i/old")}
});
