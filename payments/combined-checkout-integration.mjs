import {allocateCatalogueRefund,applyCatalogueCombinedPayment,reserveCatalogueCombinedOrder} from "./catalog-combined-ledger.mjs";
import {previewMixedCheckout} from "./mixed-checkout-preview.mjs";

export class TransactionStore{
  #state;#pending=Promise.resolve();
  constructor(initial={}){this.#state=structuredClone(initial)}
  mutate(fn){const operation=this.#pending.then(()=>fn(this.#state));this.#pending=operation.catch(()=>{});return operation}
  read(){return this.#pending.then(()=>structuredClone(this.#state))}
}

function availableAfterHolds(state,requestId){const result=new Map(Object.entries(state.inventoryAvailable||{}).map(([sku,value])=>[sku,Number(value)]));for(const [id,entry] of Object.entries(state.combinedCheckoutRequests||{})){if(id===requestId||["cancelled","provider_expired"].includes(entry.paymentStatus))continue;for(const line of entry.stockReservations||[])result.set(line.sku,Number(result.get(line.sku)||0)-Number(line.quantity||0))}return result}

export function createCombinedCheckoutCoordinator({store,stripe,previewDependencies}){
  if(!store?.mutate||!stripe?.createCheckoutSession)throw Error("Transactional store and Stripe adapter are required.");
  return {
    async createSession(input){
      const reserved=await store.mutate(state=>{
        state.combinedCheckoutRequests??={};const existing=state.combinedCheckoutRequests[input.requestId];if(existing){if(existing.planFingerprint!==JSON.stringify({items:input.items,deliveryLocation:input.deliveryLocation,deliveryService:input.deliveryService||"standard",promoCode:input.promoCode||""}))throw Error("Checkout request cannot be reused for different input.");return {plan:existing.plan,existing:true}}
        const now=Math.floor(Number(input.now||Date.now())/1000),dependencies={...previewDependencies,availability:availableAfterHolds(state,input.requestId)},preview=previewMixedCheckout({...input,enabled:true},dependencies);if(preview.status!=="ready")return {preview};
        const plan={version:2,requestId:input.requestId,parentOrderNumber:input.parentOrderNumber,currency:preview.currency,dueToday:preview.todayTotal,groups:structuredClone(preview.groups)};
        const entry=reserveCatalogueCombinedOrder(state,plan,{now});entry.planFingerprint=JSON.stringify({items:input.items,deliveryLocation:input.deliveryLocation,deliveryService:input.deliveryService||"standard",promoCode:input.promoCode||""});entry.sessionStatus="creating";return {plan:entry.plan,existing:false};
      });
      if(reserved.preview)return reserved.preview;
      const plan=reserved.plan,idempotencyKey=`aura-combined-${plan.requestId}`;await store.mutate(state=>{state.combinedCheckoutRequests[plan.requestId].sessionStatus="creating"});let session;try{session=await stripe.createCheckoutSession({amountTotal:plan.dueToday,currency:plan.currency,idempotencyKey,recoveryEnabled:false,metadata:{aura_combined_request:plan.requestId,aura_parent_order:plan.parentOrderNumber},groups:plan.groups.map(group=>({id:group.id,amount:group.productDueToday+group.shippingDueToday}))})}catch(error){await store.mutate(state=>{state.combinedCheckoutRequests[plan.requestId].sessionStatus="ambiguous"});throw error}
      await store.mutate(state=>{const entry=state.combinedCheckoutRequests[plan.requestId];entry.sessionStatus="created";entry.sessionReference=String(session.id||"").slice(0,100)});
      return {status:"session_created",sessionId:session.id,url:session.url,amountTotal:plan.dueToday,groupCount:plan.groups.length};
    },
    async applyWebhook(event){
      const object=event?.data?.object||{},requestId=String(object.metadata?.aura_combined_request||"");
      if(event?.type==="charge.refunded")return store.mutate(state=>{if(!requestId||!state.combinedOrders?.[requestId])return {applied:false,reason:"order_not_found"};const eventId=String(event.id||"");if(state.combinedRefundEvents?.[eventId])return {applied:false,reason:"duplicate_refund"};allocateCatalogueRefund(state,{requestId,eventId,amountRefunded:Number(object.amount_refunded||0)});return {applied:false,reason:"refund_review_required",requestId}});
      if(event?.type==="checkout.session.expired"){const provider=await stripe.retrieveCheckoutSession?.(String(object.id||""));if(!provider||provider.status!=="expired"||provider.payment_status==="paid")return {applied:false,reason:"provider_not_expired"};return store.mutate(state=>{state.combinedProviderEvents??={};if(state.combinedProviderEvents[event.id])return {applied:false,reason:"duplicate_expiry"};const reservation=state.combinedCheckoutRequests?.[requestId];if(!reservation)throw Error("Combined checkout reservation was not found.");state.combinedProviderEvents[event.id]={type:event.type,requestId};if(reservation.paymentStatus==="paid")return {applied:false,reason:"already_paid"};reservation.paymentStatus="provider_expired";reservation.sessionStatus="provider_expired";reservation.expiredAt=Number(event.created||0);return {applied:true,reason:"provider_expired"}})}
      if(!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event?.type)||object.payment_status!=="paid")return {applied:false,reason:"not_paid"};
      return store.mutate(state=>{const reservation=state.combinedCheckoutRequests?.[requestId];if(!reservation)throw Error("Combined checkout reservation was not found.");if(reservation.paymentStatus==="provider_expired"){state.combinedPaymentReviews??={};state.combinedPaymentReviews[event.id]={requestId,reason:"paid_after_authoritative_expiry",createdAt:Number(event.created||0)};return {applied:false,reason:"expired_payment_review"}}if(Number(object.amount_total)!==reservation.plan.dueToday||String(object.currency||"").toLowerCase()!==reservation.plan.currency)throw Error("Paid webhook amount does not match the reserved combined total.");const applied=applyCatalogueCombinedPayment(state,{eventId:event.id,requestId,amountPaid:Number(object.amount_total),now:Number(event.created||0)});return {applied,requestId,groupCount:reservation.plan.groups.length}});
    }
  };
}
