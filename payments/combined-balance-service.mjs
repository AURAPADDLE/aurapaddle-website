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
