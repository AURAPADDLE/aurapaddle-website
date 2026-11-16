import {confirmDelayedGroup} from "./catalog-combined-ledger.mjs";
import {queueCombinedGroupEmail} from "./combined-notifications.mjs";

const integer=value=>Number.isSafeInteger(Number(value))?Number(value):NaN;

export async function requestCombinedBalance({store,stripe,requestId,groupId,shippingAmount,operationId,now=0,taxRateId=""}={}){
  if(!store?.mutate||typeof stripe?.createBalanceInvoice!=="function")throw Error("Balance storage and Stripe adapter are required.");
  const shipping=integer(shippingAmount);
  if(!Number.isSafeInteger(shipping)||shipping<0)throw Error("Final shipping must be non-negative cents.");
  const prepared=await store.mutate(state=>{
    const order=state.combinedOrders?.[requestId],group=order?.groups.find(item=>item.id===groupId);
    if(!order||!group||group.kind!=="delayed")throw Error("Combined pre-order group not found.");
    if(order.shippingReviewRequired)throw Error("Review the changed delivery address before requesting the balance.");
    if(group.paymentStatus==="paid_in_full")return {complete:true,requestId,groupId};
    if(group.balanceInvoiceId&&group.balanceInvoiceUrl){if(group.confirmedShippingAmount!==shipping)throw Error("A different balance request already exists for this group.");return {complete:false,existing:true,requestId,groupId,invoiceId:group.balanceInvoiceId,status:group.balanceInvoiceStatus,amountTotal:group.balanceRequestedAmount}}
    if(!order.customerId)throw Error("The original Stripe customer is unavailable for a secure balance invoice.");
    const productBalanceAmount=integer(group.remainingProductBalance),amountTotal=productBalanceAmount+shipping;
    confirmDelayedGroup(state,{requestId,groupId,shippingAmount:shipping,operationId,now});
    group.balanceInvoiceStatus=group.balanceInvoiceStatus||"creating";
    group.balanceRequestOperationId=group.balanceRequestOperationId||operationId;
    return {complete:false,requestId,groupId,orderNumber:order.parentOrderNumber,customerId:order.customerId,productBalanceAmount,shippingAmount:shipping,amountTotal};
  });
  if(prepared.complete||prepared.existing)return prepared;
  const invoice=await stripe.createBalanceInvoice({...prepared,taxRateId});
  return store.mutate(state=>{
    const group=state.combinedOrders?.[requestId]?.groups.find(item=>item.id===groupId);
    if(!group)throw Error("Combined pre-order group not found.");
    if(Number(invoice.amountDue)!==prepared.amountTotal)throw Error("Combined balance invoice total changed before it was bound to the order.");
    if(group.balanceInvoiceId&&group.balanceInvoiceId!==invoice.id)throw Error("A different balance invoice is already bound to this group.");
    group.balanceInvoiceId=invoice.id;
    group.balanceInvoiceUrl=invoice.hostedInvoiceUrl;
    if(group.paymentStatus==="paid_in_full")group.balanceInvoiceStatus="paid";
    else {
      if(!["payment_failed","voided"].includes(group.balanceInvoiceStatus))group.balanceInvoiceStatus=invoice.status;
      queueCombinedGroupEmail(state,{requestId,groupId,kind:"combined_balance_requested",eventId:operationId,now});
    }
    return {complete:group.paymentStatus==="paid_in_full",requestId,groupId,invoiceId:group.balanceInvoiceId,status:group.balanceInvoiceStatus,amountTotal:prepared.amountTotal};
  });
}

export async function refreshCombinedBalanceLink({store,stripe,requestId,groupId,operationId,now=0}={}){
  if(!store?.mutate||typeof stripe?.retrieveBalanceInvoice!=="function")throw Error("Balance storage and Stripe retrieval are required.");
  if(!/^[A-Za-z0-9:_-]{8,160}$/.test(String(operationId||"")))throw Error("A stable refresh operation identifier is required.");
  const snapshot=await store.read(),order=snapshot.combinedOrders?.[requestId],group=order?.groups.find(item=>item.id===groupId);
  if(!order||!group||group.kind!=="delayed")throw Error("Combined pre-order group not found.");
  if(group.paymentStatus==="paid_in_full")throw Error("This group is already paid in full.");
  if(["voided","paid"].includes(group.balanceInvoiceStatus))throw Error("This balance invoice is no longer payable.");
  if(!/^in_[A-Za-z0-9]+$/.test(String(group.balanceInvoiceId||""))||!Number.isSafeInteger(group.balanceRequestedAmount)||group.balanceRequestedAmount<=0)throw Error("No bound unpaid balance invoice is available.");
  const invoice=await stripe.retrieveBalanceInvoice(group.balanceInvoiceId),metadata=invoice?.metadata||{};
  if(String(invoice?.id||"")!==group.balanceInvoiceId||String(metadata.aura_combined_request||"")!==requestId||String(metadata.aura_group_id||"")!==groupId||String(metadata.aura_parent_order||"")!==order.parentOrderNumber||String(metadata.aura_payment_stage||"")!=="combined_balance")throw Error("Stripe invoice ownership does not match this order group.");
  if(String(invoice.currency||"").toLowerCase()!==String(order.currency||"aud").toLowerCase()||Number(invoice.amount_due)!==group.balanceRequestedAmount)throw Error("Stripe invoice amount or currency does not match the approved balance.");
  if(invoice.status!=="open"||Number(invoice.amount_remaining)!==group.balanceRequestedAmount)throw Error("The bound Stripe invoice is not an open unpaid invoice.");
  const hostedInvoiceUrl=String(invoice.hosted_invoice_url||"");
  if(!/^https:\/\/invoice\.stripe\.com\//i.test(hostedInvoiceUrl))throw Error("Stripe did not return a valid hosted invoice link.");
  return store.mutate(state=>{
    const current=state.combinedOrders?.[requestId]?.groups.find(item=>item.id===groupId);
    if(!current||current.balanceInvoiceId!==invoice.id||current.paymentStatus==="paid_in_full"||current.balanceInvoiceStatus==="voided"||current.balanceRequestedAmount!==Number(invoice.amount_due))throw Error("The balance invoice changed while its link was being refreshed.");
    current.balanceInvoiceUrl=hostedInvoiceUrl;current.balanceInvoiceStatus="open";current.balanceInvoiceLinkRefreshedAt=now;current.balanceInvoiceLinkRefreshOperationId=operationId;
    return {requestId,groupId,invoiceId:current.balanceInvoiceId,status:current.balanceInvoiceStatus,hostedInvoiceUrl,refreshedAt:now};
  });
}
