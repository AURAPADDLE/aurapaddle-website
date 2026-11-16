import {allocateCatalogueRefund,applyCatalogueCombinedPayment,reserveCatalogueCombinedOrder} from "./catalog-combined-ledger.mjs";
import {releaseOrderInventory,reserveOrderInventory} from "./inventory.mjs";
import {previewMixedCheckout} from "./mixed-checkout-preview.mjs";
import {compareDeliveryLocation} from "./shipping-location.mjs";

export class TransactionStore{
  #state;#pending=Promise.resolve();
  constructor(initial={}){this.#state=structuredClone(initial)}
  mutate(fn){const operation=this.#pending.then(()=>fn(this.#state));this.#pending=operation.catch(()=>{});return operation}
  read(){return this.#pending.then(()=>structuredClone(this.#state))}
}

function availableAfterHolds(state,requestId,availabilityForState){const source=typeof availabilityForState==="function"?availabilityForState(state):state.inventoryAvailable||{},result=source instanceof Map?new Map(source):new Map(Object.entries(source).map(([sku,value])=>[sku,Number(value)]));for(const [id,entry] of Object.entries(state.combinedCheckoutRequests||{})){if(id===requestId||["cancelled","provider_expired"].includes(entry.paymentStatus)||entry.inventoryAllocation?.length)continue;for(const line of entry.stockReservations||[])result.set(line.sku,Number(result.get(line.sku)||0)-Number(line.quantity||0))}return result}

export function createCombinedCheckoutCoordinator({store,stripe,previewDependencies,identityFactory,clock=()=>Date.now()}){
  if(!store?.mutate||!stripe?.createCheckoutSession)throw Error("Transactional store and Stripe adapter are required.");
  return {
    async createSession(input){
      const reserved=await store.mutate(state=>{
        state.combinedCheckoutRequests??={};const existing=state.combinedCheckoutRequests[input.requestId];if(existing){if(existing.planFingerprint!==JSON.stringify({items:input.items,deliveryLocation:input.deliveryLocation,deliveryService:input.deliveryService||"standard",promoCode:input.promoCode||"",customerEmail:String(input.customerEmail||"").trim().toLowerCase()}))throw Error("Checkout request cannot be reused for different input.");return {plan:existing.plan,context:existing.checkoutContext,existing:true}}
        const checkoutNow=Number(clock()),now=Math.floor(checkoutNow/1000),dependencies={...previewDependencies,availability:availableAfterHolds(state,input.requestId,previewDependencies?.availabilityForState)},preview=previewMixedCheckout({...input,now:checkoutNow,enabled:true},dependencies);if(preview.status!=="ready")return {preview};
        const identity=identityFactory?identityFactory(state,{...input,now}):{orderNumber:input.parentOrderNumber,trackingToken:input.trackingToken||"",integrationIdentifier:input.integrationIdentifier||"",customerEmail:input.customerEmail||""};
        const plan={version:2,requestId:input.requestId,parentOrderNumber:identity.orderNumber,currency:preview.currency,dueToday:preview.todayTotal,groups:structuredClone(preview.groups),shippingEvidence:structuredClone(preview.shippingEvidence)};
        const entry=reserveCatalogueCombinedOrder(state,plan,{now});entry.inventoryAllocation=reserveOrderInventory(state,{orderNumber:plan.parentOrderNumber,items:entry.stockReservations,now});entry.planFingerprint=JSON.stringify({items:input.items,deliveryLocation:input.deliveryLocation,deliveryService:input.deliveryService||"standard",promoCode:input.promoCode||"",customerEmail:identity.customerEmail});entry.checkoutContext=structuredClone(identity);entry.sessionStatus="creating";return {plan:entry.plan,context:entry.checkoutContext,existing:false};
      });
      if(reserved.preview)return reserved.preview;
      const plan=reserved.plan,context=reserved.context||await store.read().then(state=>state.combinedCheckoutRequests?.[plan.requestId]?.checkoutContext||{}),idempotencyKey=`aura-combined-${plan.requestId}`;await store.mutate(state=>{state.combinedCheckoutRequests[plan.requestId].sessionStatus="creating"});let session;try{session=await stripe.createCheckoutSession({amountTotal:plan.dueToday,currency:plan.currency,idempotencyKey,recoveryEnabled:false,metadata:{aura_combined_request:plan.requestId,aura_parent_order:plan.parentOrderNumber,aura_tracking_token:context.trackingToken||"",aura_integration_identifier:context.integrationIdentifier||""},customerEmail:context.customerEmail||"",groups:structuredClone(plan.groups)})}catch(error){await store.mutate(state=>{state.combinedCheckoutRequests[plan.requestId].sessionStatus="ambiguous"});throw error}
      await store.mutate(state=>{const entry=state.combinedCheckoutRequests[plan.requestId];entry.sessionStatus="created";entry.sessionReference=String(session.id||"").slice(0,100)});
      return {status:"session_created",sessionId:session.id,url:session.url,orderNumber:plan.parentOrderNumber,amountTotal:plan.dueToday,groupCount:plan.groups.length};
    },
    async applyWebhook(event){
      const object=event?.data?.object||{},requestId=String(object.metadata?.aura_combined_request||"");
      if(event?.type==="charge.refunded")return store.mutate(state=>{if(!requestId||!state.combinedOrders?.[requestId])return {applied:false,reason:"order_not_found"};const eventId=String(event.id||"");if(state.combinedRefundEvents?.[eventId])return {applied:false,reason:"duplicate_refund"};allocateCatalogueRefund(state,{requestId,eventId,amountRefunded:Number(object.amount_refunded||0)});return {applied:false,reason:"refund_review_required",requestId}});
      if(event?.type==="checkout.session.expired"){const provider=await stripe.retrieveCheckoutSession?.(String(object.id||""));if(!provider||provider.status!=="expired"||provider.payment_status==="paid")return {applied:false,reason:"provider_not_expired"};return store.mutate(state=>{state.combinedProviderEvents??={};if(state.combinedProviderEvents[event.id])return {applied:false,reason:"duplicate_expiry"};const reservation=state.combinedCheckoutRequests?.[requestId];if(!reservation)throw Error("Combined checkout reservation was not found.");state.combinedProviderEvents[event.id]={type:event.type,requestId};if(reservation.paymentStatus==="paid")return {applied:false,reason:"already_paid"};reservation.paymentStatus="provider_expired";reservation.sessionStatus="provider_expired";reservation.expiredAt=Number(event.created||0);releaseOrderInventory(state,{orderNumber:reservation.plan.parentOrderNumber});reservation.inventoryAllocation=[];return {applied:true,reason:"provider_expired"}})}
      if(!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event?.type)||object.payment_status!=="paid")return {applied:false,reason:"not_paid"};
      return store.mutate(state=>{const reservation=state.combinedCheckoutRequests?.[requestId];if(!reservation)throw Error("Combined checkout reservation was not found.");if(reservation.paymentStatus==="provider_expired"){state.combinedPaymentReviews??={};state.combinedPaymentReviews[event.id]={requestId,reason:"paid_after_authoritative_expiry",createdAt:Number(event.created||0)};return {applied:false,reason:"expired_payment_review"}}if(Number(object.amount_total)!==reservation.plan.dueToday||String(object.currency||"").toLowerCase()!==reservation.plan.currency)throw Error("Paid webhook amount does not match the reserved combined total.");const details=object.collected_information?.shipping_details||object.shipping_details||{},address=details.address||{},deliveryAddress={city:String(address.city||""),state:String(address.state||""),postalCode:String(address.postal_code||""),country:String(address.country||"").toUpperCase()},expected=reservation.plan.shippingEvidence?.location||null,shippingReviewRequired=Boolean(expected&&!compareDeliveryLocation(expected,deliveryAddress));const applied=applyCatalogueCombinedPayment(state,{eventId:event.id,requestId,amountPaid:Number(object.amount_total),now:Number(event.created||0),shippingReviewRequired,deliveryAddress,customer:object.customer_details||{email:object.customer_email||""},paymentIntentId:typeof object.payment_intent==="string"?object.payment_intent:object.payment_intent?.id,customerId:typeof object.customer==="string"?object.customer:object.customer?.id});return {applied,requestId,groupCount:reservation.plan.groups.length,shippingReviewRequired}});
    },
    async sessionSummary(sessionId){
      const id=String(sessionId||"");
      if(!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(id))throw Object.assign(Error("Invalid Checkout Session ID."),{status:400});
      const state=await store.read(),entries=Object.entries(state.combinedCheckoutRequests||{}),match=entries.find(([,entry])=>entry.sessionReference===id);
      if(!match)throw Object.assign(Error("Checkout Session was not found."),{status:404});
      const [requestId,reservation]=match,provider=await stripe.retrieveCheckoutSession(id);
      if(!provider||provider.id!==id||String(provider.metadata?.aura_combined_request||"")!==requestId||Number(provider.amount_total)!==reservation.plan.dueToday||String(provider.currency||"").toLowerCase()!==reservation.plan.currency)throw Object.assign(Error("Checkout Session could not be verified."),{status:409});
      const order=state.combinedOrders?.[requestId],providerPaid=provider.payment_status==="paid",locallyPaid=order?.paymentStatus==="paid";
      const status=providerPaid&&locallyPaid?"paid":providerPaid?"confirming":provider.status==="expired"?"expired":"awaiting_payment";
      const source=order||reservation.plan;
      return {status,paymentStatus:provider.payment_status||"unpaid",checkoutStatus:provider.status||"open",orderNumber:source.parentOrderNumber,currency:source.currency,amountToday:source.dueToday,amountPaid:locallyPaid?Number(order.amountPaid||0):0,groups:source.groups.map(group=>({id:group.id,kind:group.kind,items:group.items.map(item=>({sku:item.sku,quantity:item.quantity})),productDueToday:group.productDueToday,shippingDueToday:group.shippingDueToday,remainingProductBalance:group.remainingProductBalance,shippingDueLater:group.shippingDueLater===true,paymentStatus:group.paymentStatus,fulfilmentStatus:group.fulfilmentStatus||""}))};
    }
  };
}
