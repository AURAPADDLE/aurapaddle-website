import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {abandonedCheckoutList,adminOrderList,applyStripeEvent,buildCheckoutParams,calculateShipping,campaignProgress,isStripeHostedInvoiceUrl,loadCatalog,loadShippingRates,loadStripeMap,normaliseAttribution,normaliseCheckoutItems,normaliseQuantity,orderProgress,prepareBalanceRequest,publicOrderView,queueOrderEmails,queueOrderMilestoneEmail,reserveCheckoutIdentity,unsubscribeRecoveryEmail,updateOrderProgress,verifyStripeSignature} from "./lib.mjs";
import {enqueueStripeAnalytics,hashUserData,measurementPayload} from "./analytics.mjs";
import {recoveryEmailContent} from "./recovery-email.mjs";
import {adminOrderEmailContent,customerOrderEmailContent,milestoneOrderEmailContent} from "./order-email.mjs";

const catalog=loadCatalog();
const shippingRates=loadShippingRates();
const stripeMap=loadStripeMap(catalog);
const shippingFor=(items,regionId="gold-coast-brisbane")=>calculateShipping(items,regionId,shippingRates);

test("catalogue contains 77 board SKUs and the Fishing Rack accessory",()=>{
  assert.equal(catalog.variants.length,78);
  assert.equal(catalog.bySku.size,78);
  assert.equal(catalog.variants.filter(item=>item.orderMode==="available").length,0);
  assert.equal(catalog.variants.filter(item=>item.orderMode==="preorder").length,78);
  assert.equal(catalog.variants.filter(item=>item.campaign?.thresholdRequired===false).length,4);
  assert.equal(stripeMap.bySku.size,76);
  const rack=catalog.bySku.get("AP667703");assert.equal(rack.checkoutAmount,12900);assert.equal(rack.depositAmount,6450);assert.equal(rack.retailAmount-rack.checkoutAmount,0);assert.equal(rack.bundle.unitAmount,6900);
});

test("Hydrofoil Kit Set applies the AUD 50 incentive and a 50% initial payment",()=>{
  const variant=catalog.bySku.get("AP246531");
  assert.equal(variant.slug,"hydrofoil-set");assert.equal(variant.retailAmount,149900);assert.equal(variant.checkoutAmount,144900);assert.equal(variant.depositAmount,72450);
  assert.equal(stripeMap.bySku.has("AP246531"),false);
  const items=normaliseCheckoutItems([{sku:"AP246531",quantity:1}],catalog),params=buildCheckoutParams({items,priceBySku:stripeMap.bySku,siteUrl:"http://localhost:4242",returnPath:"/products/hydrofoil-set.html",shipping:shippingFor(items)});
  assert.equal(params.get("line_items[0][price_data][product_data][name]"),"AURA PADDLE Hydrofoil Kit Set · APO00000");
  assert.equal(params.get("line_items[0][price_data][unit_amount]"),"72450");
  assert.equal(params.get("metadata[aura_shipping_amount]"),"quote_required");
});

test("Wayfinder RRP follows the approved size bands",()=>{
  const variants=catalog.variants.filter(item=>item.slug==="wayfinder");
  for(const variant of variants){
    const lowerBand=["6'6\"","7'0\"","7'6\""].includes(variant.size);
    assert.equal(variant.retailAmount,lowerBand?59900:69900);
    assert.equal(variant.checkoutAmount,lowerBand?54900:64900);
    assert.equal(variant.depositAmount,lowerBand?27450:32450);
  }
});

test("Fishing Rack is AUD 129 alone and AUD 69 per paired Angler board",()=>{
  const angler=catalog.variants.find(item=>item.slug==="angler-fishing");
  const standalone=normaliseCheckoutItems([{sku:"AP667703",quantity:1}],catalog);
  let params=buildCheckoutParams({items:standalone,priceBySku:stripeMap.bySku,siteUrl:"http://localhost:4242",returnPath:"/cart-preview.html",shipping:shippingFor(standalone)});
  assert.equal(params.get("line_items[0][price_data][unit_amount]"),"6450");
  assert.equal(params.get("line_items[0][price_data][product_data][name]"),"AURA PADDLE Fishing Rack · APO00000");
  const bundled=normaliseCheckoutItems([{sku:angler.sku,quantity:2},{sku:"AP667703",quantity:3}],catalog),bundleLine=bundled.find(item=>item.bundleApplied),fullPriceLine=bundled.find(item=>item.variant.sku==="AP667703"&&!item.bundleApplied);
  assert.equal(bundleLine.quantity,2);assert.equal(bundleLine.unitPaymentAmount,3450);assert.equal(fullPriceLine.quantity,1);
  params=buildCheckoutParams({items:bundled,priceBySku:stripeMap.bySku,siteUrl:"http://localhost:4242",returnPath:"/cart-preview.html",shipping:shippingFor(bundled)});
  assert.equal(params.get("metadata[aura_items]"),`${angler.sku}:2,AP667703:3`);
  assert.equal(params.get("line_items[1][price_data][unit_amount]"),"3450");
  assert.equal(params.get("line_items[2][price_data][unit_amount]"),"6450");
});

test("checkout trusts the 50% deposit, excludes Afterpay, stays country-safe and retains dynamic payment methods",()=>{
  const variant=catalog.bySku.get("AP734955");
  const items=[{variant,quantity:2}],params=buildCheckoutParams({items,priceBySku:stripeMap.bySku,siteUrl:"http://localhost:4242",returnPath:"/products/yoga-cruiser.html?colour=glacier",shipping:shippingFor(items),recoveryEmailConsent:true,integrationIdentifier:"aura_cart_abcdefgh"});
  assert.equal(params.get("line_items[0][price]"),null);
  assert.equal(params.get("line_items[0][price_data][product]"),stripeMap.bySku.get("AP734955").productId);
  assert.equal(params.get("line_items[0][price_data][unit_amount]"),"37450");
  assert.equal(params.get("line_items[0][quantity]"),"2");
  assert.equal(params.get("payment_method_types[0]"),null);
  assert.equal(params.get("adaptive_pricing[enabled]"),"false");
  assert.equal(params.get("excluded_payment_method_types[0]"),"afterpay_clearpay");
  assert.equal(params.get("integration_identifier"),"aura_cart_abcdefgh");
  assert.equal(params.get("shipping_address_collection[allowed_countries][0]"),"AU");
  assert.equal(params.get("consent_collection[promotions]"),null);
  assert.equal(params.get("metadata[aura_recovery_email_consent]"),"true");
  assert.equal(params.get("after_expiration[recovery][enabled]"),"true");
  assert.equal(params.get("after_expiration[recovery][allow_promotion_codes]"),"false");
});

test("Checkout expires after two hours so Stripe can produce a recovery URL",()=>{
  const items=normaliseCheckoutItems([{sku:"AP734955",quantity:1}],catalog),now=1_800_000_000;
  const params=buildCheckoutParams({items,priceBySku:new Map(),siteUrl:"http://localhost:4242",returnPath:"/cart/",shipping:shippingFor(items),now});
  assert.equal(params.get("expires_at"),String(now+7200));
});

test("pre-order checkout applies the AUD 50 incentive and collects exactly 50%",()=>{
  const variant=catalog.bySku.get("AP233694");
  assert.equal(variant.retailAmount-variant.checkoutAmount,5000);
  const items=[{variant,quantity:1}],params=buildCheckoutParams({items,priceBySku:stripeMap.bySku,siteUrl:"http://localhost:4242",returnPath:"/products/yoga-cruiser.html?colour=eucalyptus",shipping:shippingFor(items)});
  assert.equal(variant.depositAmount,37450);
  assert.equal(params.get("line_items[0][price_data][unit_amount]"),"37450");
  assert.equal(params.get("metadata[aura_items]"),"AP233694:1");
  assert.equal(params.get("metadata[aura_payment_stage]"),"initial_50_percent");
});

test("multi-SKU cart is merged and rendered as multiple trusted line items",()=>{
  const items=normaliseCheckoutItems([{sku:"AP734955",quantity:1},{sku:"AP233694",quantity:2},{sku:"AP233694",quantity:1}],catalog);
  assert.equal(items.length,2);assert.equal(items[1].quantity,3);
  const params=buildCheckoutParams({items,priceBySku:stripeMap.bySku,siteUrl:"http://localhost:4242",returnPath:"/cart-preview.html",shipping:shippingFor(items)});
  assert.equal(params.get("line_items[0][price_data][unit_amount]"),"37450");
  assert.equal(params.get("line_items[1][price_data][unit_amount]"),"37450");
  assert.equal(params.get("line_items[1][quantity]"),"3");
  assert.equal(params.get("metadata[aura_order_mode]"),"preorder");
});

test("shipping regions use the approved iSUP and surfboard prices",()=>{
  const isup=normaliseCheckoutItems([{sku:"AP734955",quantity:1}],catalog);
  assert.equal(shippingFor(isup,"local-pickup").amount,0);
  assert.equal(shippingFor(isup,"gold-coast-brisbane").amount,4900);
  assert.equal(shippingFor(isup,"qld-nsw-main").amount,7900);
  assert.equal(shippingFor(isup,"canberra-melbourne").amount,9900);
  assert.equal(shippingFor(isup,"adelaide").amount,12900);
  assert.equal(shippingFor(isup,"perth").amount,17900);
  assert.equal(shippingFor(isup,"tasmania").amount,14900);
  assert.equal(shippingFor(isup,"remote").quoteRequired,true);
  const gannetVariant=catalog.variants.find(item=>item.slug==="gannet"),gannet=[{variant:gannetVariant,quantity:1}];
  assert.equal(shippingFor(gannet,"gold-coast-brisbane").amount,7900);
  assert.equal(shippingFor(gannet,"qld-nsw-main").amount,10900);
  const meridianVariant=catalog.variants.find(item=>item.slug==="meridian"),meridian=[{variant:meridianVariant,quantity:1}];
  assert.equal(shippingFor(meridian,"perth").amount,27900);
  assert.equal(shippingFor([{variant:gannetVariant,quantity:2}],"qld-nsw-main").quoteRequired,true);
});

test("Stripe records shipping for the balance request without charging it today",()=>{
  const items=normaliseCheckoutItems([{sku:"AP734955",quantity:1}],catalog),shipping=shippingFor(items,"qld-nsw-main");
  const params=buildCheckoutParams({items,priceBySku:stripeMap.bySku,siteUrl:"http://localhost:4242",returnPath:"/cart-preview.html",shipping});
  assert.equal(params.get("metadata[aura_shipping_region]"),"qld-nsw-main");
  assert.equal(params.get("metadata[aura_shipping_amount]"),"7900");
  assert.equal(params.get("line_items[0][price_data][unit_amount]"),"37450");
  assert.match(params.get("custom_text[submit][message]"),/full refund within 48 hours/);
  assert.match(params.get("custom_text[submit][message]"),/confirms production in writing/);
  const pickup=shippingFor(items,"local-pickup"),pickupParams=buildCheckoutParams({items,priceBySku:stripeMap.bySku,siteUrl:"http://localhost:4242",returnPath:"/cart-preview.html",shipping:pickup});
  assert.equal(pickupParams.get("shipping_address_collection[allowed_countries][0]"),null);
});

test("Checkout assigns the APO order identity to Stripe metadata",()=>{
  const items=normaliseCheckoutItems([{sku:"AP734955",quantity:1}],catalog);
  const params=buildCheckoutParams({items,priceBySku:new Map(),siteUrl:"http://localhost:4242",returnPath:"/cart/",shipping:shippingFor(items),orderNumber:"APO48217",trackingToken:"secure_tracking_token_48217"});
  assert.equal(params.get("metadata[aura_order_number]"),"APO48217");
  assert.equal(params.get("payment_intent_data[metadata][aura_order_number]"),"APO48217");
  assert.equal(params.get("payment_intent_data[description]"),"AURA PADDLE APO48217 initial payment");
  assert.equal(params.get("line_items[0][price_data][product_data][name]"),"AURA PADDLE Yoga Cruiser · APO48217");
  assert.equal(params.get("metadata[aura_tracking_token]"),"secure_tracking_token_48217");
});

test("checkout attribution is consent-scoped, validated and linked to Stripe metadata",()=>{
  const attribution=normaliseAttribution({
    consent:{analytics:true,marketing:true,updatedAt:"2026-08-25T00:00:00.000Z"},
    first:{source:"google",medium:"cpc",campaign:"launch",landingPath:"/shop/",clickType:"gclid",clickId:"abc_123",capturedAt:"2026-08-25T00:00:00.000Z"},
    last:{source:"google",medium:"cpc",campaign:"launch",landingPath:"/products/yoga-cruiser.html",clickType:"gclid",clickId:"abc_123",capturedAt:"2026-08-25T00:05:00.000Z"},
    analyticsClientId:"123456789.987654321",
    analyticsSessionId:"1787635200"
  });
  const items=normaliseCheckoutItems([{sku:"AP734955",quantity:1}],catalog);
  const params=buildCheckoutParams({items,priceBySku:new Map(),siteUrl:"http://localhost:4242",returnPath:"/cart/",shipping:shippingFor(items),attribution,orderNumber:"APO48217",trackingToken:"secure_tracking_token_48217"});
  assert.equal(params.get("metadata[aura_attr_source]"),"google");
  assert.equal(params.get("metadata[aura_click_type]"),"gclid");
  assert.equal(params.get("metadata[aura_click_id]"),"abc_123");
  assert.equal(params.get("metadata[aura_ga_client_id]"),"123456789.987654321");
  const analyticsOnly=normaliseAttribution({...attribution,consent:{analytics:true,marketing:false},last:{...attribution.last,clickType:"gclid",clickId:"should_be_removed"}});
  assert.equal(analyticsOnly.last.clickId,undefined);
});

test("checkout retries reuse the same APO identity and Stripe integration identifier",()=>{
  const state={events:{},orders:{},reservations:{},checkoutRequests:{}};
  let integerCalls=0,byteCalls=0;
  const randomInt=()=>{integerCalls+=1;return 19710};
  const randomBytes=size=>{byteCalls+=1;return Buffer.alloc(size,byteCalls)};
  const first=reserveCheckoutIdentity(state,{requestId:"retry-safe-123",now:1_800_000_000,randomInt,randomBytes});
  const retry=reserveCheckoutIdentity(state,{requestId:"retry-safe-123",now:1_800_000_010,randomInt:()=>99999,randomBytes:()=>Buffer.alloc(24,9)});
  assert.deepEqual(retry,first);
  assert.equal(first.orderNumber,"APO19710");
  assert.match(first.trackingToken,/^[A-Za-z0-9_-]{16,80}$/);
  assert.match(first.integrationIdentifier,/^aura_cart_[a-z]{8}$/);
  assert.equal(integerCalls,1);assert.equal(byteCalls,2);
});

test("checkout reservation retains attribution for the APO order",()=>{
  const state={events:{},orders:{},reservations:{},checkoutRequests:{}};
  reserveCheckoutIdentity(state,{requestId:"attribution-123",attribution:{consent:{analytics:true,marketing:false},first:{source:"newsletter",medium:"email",landingPath:"/shop/"}},randomInt:()=>12345,randomBytes:size=>Buffer.alloc(size,7)});
  assert.equal(state.checkoutRequests["attribution-123"].orderNumber,"APO12345");
  assert.equal(state.checkoutRequests["attribution-123"].attribution.first.source,"newsletter");
});

test("quantity validation rejects tampering",()=>{
  assert.equal(normaliseQuantity("3"),3);
  assert.throws(()=>normaliseQuantity(0));
  assert.throws(()=>normaliseQuantity(21));
  assert.throws(()=>normaliseQuantity(1.5));
});

test("Stripe webhook signature is verified",()=>{
  const payload='{"id":"evt_test"}',timestamp=1_800_000_000,secret="whsec_test";
  const signature=crypto.createHmac("sha256",secret).update(`${timestamp}.${payload}`).digest("hex");
  assert.equal(verifyStripeSignature(payload,`t=${timestamp},v1=${signature}`,secret,300,timestamp),true);
  assert.equal(verifyStripeSignature(`${payload}x`,`t=${timestamp},v1=${signature}`,secret,300,timestamp),false);
});

test("paid and refunded events update preorder progress idempotently",()=>{
  const state={events:{},orders:{}};
  const completed={id:"evt_paid",type:"checkout.session.completed",created:1,data:{object:{id:"cs_test_1",payment_status:"paid",payment_intent:"pi_test_1",amount_total:74900,currency:"aud",metadata:{aura_items:"AP233694:2",aura_order_mode:"preorder",aura_payment_stage:"initial_50_percent"}}}};
  assert.equal(applyStripeEvent(state,completed),true);
  assert.equal(applyStripeEvent(state,completed),false);
  assert.equal(campaignProgress(state,catalog).find(item=>item.id==="paddle-launch-batch-01").reserved,2);
  const refunded={id:"evt_refund",type:"charge.refunded",created:2,data:{object:{payment_intent:"pi_test_1",amount_refunded:37450,refunded:false}}};
  applyStripeEvent(state,refunded);
  assert.equal(campaignProgress(state,catalog).find(item=>item.id==="paddle-launch-batch-01").reserved,1);
});

test("Invoice payment updates the remaining-balance order state",()=>{
  const state={events:{},orders:{}};
  applyStripeEvent(state,{id:"evt_initial",type:"checkout.session.completed",created:1,data:{object:{id:"cs_test_order",customer:"cus_test",payment_status:"paid",payment_intent:"pi_test_order",amount_total:37450,currency:"aud",metadata:{aura_items:"AP734955:1",aura_order_number:"APO48217",aura_tracking_token:"secure_tracking_token_48217",aura_order_mode:"preorder",aura_payment_stage:"initial_50_percent"}}}});
  const order=state.orders.cs_test_order;
  assert.equal(order.orderNumber,"APO48217");assert.equal(order.customerId,"cus_test");assert.equal(order.orderStatus,"initial_payment_received");
  order.balanceRequestedAmount=45350;order.balanceInvoiceId="in_test";order.balancePaymentStatus="requested";
  applyStripeEvent(state,{id:"evt_balance",type:"invoice.paid",created:2,data:{object:{id:"in_test",amount_paid:45350,metadata:{aura_order_number:"APO48217"}}}});
  assert.equal(order.balancePaymentStatus,"paid");assert.equal(order.orderStatus,"balance_paid");assert.equal(order.fulfilmentStatus,"preparing_for_dispatch");
});

test("Invoice payment does not fulfil an order when the paid amount is zero or mismatched",()=>{
  const state={events:{},orders:{cs_test_order:{orderNumber:"APO48218",balanceRequestedAmount:42350,balanceInvoiceId:"in_expected",balancePaymentStatus:"requested",orderStatus:"balance_requested",fulfilmentStatus:"awaiting_balance"}}};
  const order=state.orders.cs_test_order;
  applyStripeEvent(state,{id:"evt_zero",type:"invoice.paid",created:2,data:{object:{id:"in_expected",amount_paid:0,metadata:{aura_order_number:"APO48218"}}}});
  assert.equal(order.balancePaymentStatus,"payment_review");assert.equal(order.orderStatus,"balance_requested");assert.equal(order.fulfilmentStatus,"awaiting_balance");assert.equal(order.requiresBalancePaymentReview,true);
});

test("dual-entry balance payment exposes only an authentic Stripe-hosted invoice URL",()=>{
  const base={orderNumber:"APO48218",items:[{sku:"AP734955",quantity:1}],quantity:1,currency:"aud",amountTotal:37450,initialPaymentStatus:"paid",balancePaymentStatus:"requested",balanceRequestedAmount:45350,shippingLabel:"QLD / NSW major cities",shippingAmount:7900,orderStatus:"balance_requested",fulfilmentStatus:"awaiting_balance",updated:2};
  const valid=publicOrderView({...base,balanceInvoiceUrl:"https://invoice.stripe.com/i/acct_123/test_abc"});
  assert.equal(valid.balancePaymentUrl,"https://invoice.stripe.com/i/acct_123/test_abc");
  const malicious=publicOrderView({...base,balanceInvoiceUrl:"https://example.com/fake-invoice"});
  assert.equal(malicious.balancePaymentUrl,"");
  assert.equal(isStripeHostedInvoiceUrl("javascript:alert(1)"),false);
  const paid=publicOrderView({...base,balancePaymentStatus:"paid",balanceInvoiceUrl:"https://invoice.stripe.com/i/acct_123/test_abc"});
  assert.equal(paid.balancePaymentUrl,"");
});

test("admin order list contains operational totals without exposing the customer tracking token",()=>{
  const state={orders:{cs_test:{orderNumber:"APO48218",trackingToken:"must-not-leak",items:[{sku:"AP734955",quantity:1}],quantity:1,currency:"aud",amountTotal:37450,initialPaymentStatus:"paid",balancePaymentStatus:"not_requested",shippingLabel:"QLD / NSW major cities",shippingAmount:7900,shippingQuoteRequired:false,fulfilmentStatus:"preorder_confirmed",customerEmail:"buyer@example.com",created:2,updated:2}}};
  const [order]=adminOrderList(state,catalog);
  assert.equal(order.remainingProductBalance,37450);assert.equal(order.shippingAmount,7900);assert.equal(order.items[0].name,"AURA PADDLE Yoga Cruiser");assert.equal("trackingToken" in order,false);
});

test("final balance approval locks published freight and accepts a confirmed quote only when required",()=>{
  const fixed={amountTotal:37450,shippingAmount:7900,shippingQuoteRequired:false};
  assert.deepEqual(prepareBalanceRequest(fixed,{productReady:true,finalShippingConfirmed:true,shippingAmount:1}),{shippingAmount:7900,dueAmount:45350});
  const quoted={amountTotal:37450,shippingAmount:null,shippingQuoteRequired:true};
  assert.deepEqual(prepareBalanceRequest(quoted,{productReady:true,finalShippingConfirmed:true,shippingAmount:12900}),{shippingAmount:12900,dueAmount:50350});
  assert.throws(()=>prepareBalanceRequest(quoted,{productReady:false,finalShippingConfirmed:true,shippingAmount:12900}),/product is ready/);
  assert.throws(()=>prepareBalanceRequest(quoted,{productReady:true,finalShippingConfirmed:false,shippingAmount:12900}),/shipping charge/);
});

test("customer progress is derived from legacy and explicit order milestones",()=>{
  const initial=orderProgress({initialPaymentStatus:"paid",created:10,balancePaymentStatus:"not_requested",fulfilmentStatus:"preorder_confirmed"});
  assert.equal(initial.find(item=>item.state==="current").id,"order_confirmed");
  const paid=orderProgress({initialPaymentStatus:"paid",created:10,balancePaymentStatus:"paid",balanceRequestedAt:20,balancePaidAt:30,fulfilmentStatus:"preparing_for_dispatch"});
  assert.equal(paid.find(item=>item.state==="current").id,"preparing_for_dispatch");
  assert.equal(paid.find(item=>item.id==="production_confirmed").state,"complete");
});

test("manual order progress enforces payment and secure tracking rules",()=>{
  const order={initialPaymentStatus:"paid",balancePaymentStatus:"not_requested",fulfilmentStatus:"preorder_confirmed",orderStatus:"initial_payment_received",created:10,updated:10};
  updateOrderProgress(order,{stage:"production_confirmed",estimatedDispatchDate:"2026-11-30"},20);
  assert.equal(order.fulfilmentStatus,"production_confirmed");assert.equal(order.estimatedDispatchDate,"2026-11-30");
  assert.throws(()=>updateOrderProgress(order,{stage:"dispatched",carrier:"Mainfreight",trackingNumber:"ABC"},30),/Final payment/);
  order.balancePaymentStatus="paid";order.fulfilmentStatus="preparing_for_dispatch";
  assert.throws(()=>updateOrderProgress(order,{stage:"dispatched",carrier:"",trackingNumber:"ABC"},30),/Carrier/);
  assert.throws(()=>updateOrderProgress(order,{stage:"dispatched",carrier:"Mainfreight",trackingNumber:"ABC",trackingUrl:"http://example.com"},30),/HTTPS/);
  updateOrderProgress(order,{stage:"dispatched",carrier:"Mainfreight",trackingNumber:"ABC123",trackingUrl:"https://example.com/track/ABC123"},30);
  assert.equal(order.fulfilmentStatus,"dispatched");assert.equal(order.dispatchedAt,30);
  updateOrderProgress(order,{stage:"delivered"},40);assert.equal(order.fulfilmentStatus,"delivered");assert.equal(order.deliveredAt,40);
});

test("milestone notifications are queued once without exposing unsafe tracking links",()=>{
  const state={transactionalEmailOutbox:{}},order={sessionId:"cs_live_progress",orderNumber:"APO48228",trackingToken:"secure_tracking_token_48228",customerEmail:"Buyer@Example.com",customerName:"Alex Buyer",items:[{sku:"AP734955",quantity:1}],amountTotal:37450,currency:"aud",balanceRequestedAmount:45350,balanceInvoiceUrl:"https://invoice.stripe.com/i/test",trackingUrl:"javascript:alert(1)"};
  assert.equal(queueOrderMilestoneEmail(state,order,"balance_requested",20),true);
  assert.equal(queueOrderMilestoneEmail(state,order,"balance_requested",21),false);
  const queued=state.transactionalEmailOutbox["cs_live_progress:balance_requested"];
  assert.equal(queued.recipient,"buyer@example.com");assert.equal(queued.trackingUrl,"");
});

test("paid Stripe webhook queues one authoritative GA4 purchase",()=>{
  const attribution={version:1,consent:{analytics:true,marketing:false,updatedAt:"2026-08-25T00:00:00.000Z"},first:{source:"google",medium:"cpc"},last:{source:"google",medium:"cpc"},analyticsClientId:"123456789.987654321",analyticsSessionId:"1787635200"};
  const state={events:{},orders:{},reservations:{APO48219:1},checkoutRequests:{request_123:{orderNumber:"APO48219",attribution}},analyticsOutbox:{}};
  const event={id:"evt_purchase",type:"checkout.session.completed",created:1_787_635_200,data:{object:{id:"cs_test_purchase",customer:"cus_test",payment_status:"paid",payment_intent:"pi_test_purchase",amount_total:37450,currency:"aud",customer_details:{email:"MAX@example.com",phone:"+61 400 000 000"},metadata:{aura_items:"AP734955:1",aura_order_number:"APO48219",aura_tracking_token:"secure_tracking_token_48219",aura_order_mode:"preorder",aura_payment_stage:"initial_50_percent"}}}};
  assert.equal(applyStripeEvent(state,event),true);
  assert.equal(state.orders.cs_test_purchase.attribution.last.source,"google");
  assert.equal(enqueueStripeAnalytics(state,event,catalog,{enhancedConversionsEnabled:false}),true);
  assert.equal(enqueueStripeAnalytics(state,event,catalog,{enhancedConversionsEnabled:false}),false);
  const entry=state.analyticsOutbox["purchase:APO48219"],payload=measurementPayload(entry);
  assert.equal(payload.events[0].name,"purchase");
  assert.equal(payload.events[0].params.transaction_id,"APO48219");
  assert.equal(payload.events[0].params.value,374.5);
  assert.equal(payload.events[0].params.session_id,1787635200);
  assert.equal(payload.user_data,undefined);
  assert.equal(payload.consent.ad_user_data,"DENIED");
});

test("enhanced conversion preparation hashes customer data only when enabled and consented",()=>{
  const hashed=hashUserData({email:" Max.Example@Gmail.com ",phone:"+61 400 000 000",name:"Max Example",address:{line1:"1 Main Street",city:"Gold Coast",state:"QLD",postal_code:"4217",country:"AU"}});
  assert.match(hashed.sha256_email_address,/^[a-f0-9]{64}$/);
  assert.notEqual(hashed.sha256_email_address,"maxexample@gmail.com");
  const attribution={version:1,consent:{analytics:true,marketing:true},analyticsClientId:"123456789.987654321"};
  const state={events:{},orders:{},checkoutRequests:{request_456:{orderNumber:"APO48220",attribution}},analyticsOutbox:{}};
  const event={id:"evt_enhanced",type:"checkout.session.completed",created:1_787_635_200,data:{object:{id:"cs_test_enhanced",customer:"cus_test",payment_status:"paid",payment_intent:"pi_test_enhanced",amount_total:37450,currency:"aud",customer_details:{email:"max@example.com",phone:"+61400000000"},metadata:{aura_items:"AP734955:1",aura_order_number:"APO48220",aura_tracking_token:"secure_tracking_token_48220",aura_order_mode:"preorder",aura_payment_stage:"initial_50_percent"}}}};
  applyStripeEvent(state,event);
  enqueueStripeAnalytics(state,event,catalog,{enhancedConversionsEnabled:true});
  const payload=measurementPayload(state.analyticsOutbox["purchase:APO48220"]);
  assert.match(payload.user_data.sha256_email_address,/^[a-f0-9]{64}$/);
  assert.equal(payload.user_id,"cus_test");
  assert.equal(payload.consent.ad_user_data,"GRANTED");
});

test("expired Checkout records an abandonment and queues one explicitly consented recovery email",()=>{
  const attribution={version:1,consent:{analytics:true,marketing:true},last:{source:"google",medium:"cpc",campaign:"launch"},analyticsClientId:"123456789.987654321",analyticsSessionId:"1787635200"};
  const state={events:{},orders:{},checkoutRequests:{request_expired:{orderNumber:"APO48221",attribution}},analyticsOutbox:{},abandonedCheckouts:{},recoveryEmailOutbox:{},recoverySuppressions:{}};
  const event={id:"evt_expired",type:"checkout.session.expired",created:1_787_650_000,data:{object:{id:"cs_test_expired",created:1_787_642_800,amount_total:37450,currency:"aud",customer_details:{email:"buyer@example.com",phone:"+61400000000"},after_expiration:{recovery:{url:"https://buy.stripe.com/r/test_recovery",expires_at:1_790_242_800}},metadata:{aura_items:"AP734955:1",aura_order_number:"APO48221",aura_recovery_email_consent:"true"}}}};
  assert.equal(applyStripeEvent(state,event),true);
  const abandoned=state.abandonedCheckouts.cs_test_expired,queued=state.recoveryEmailOutbox.cs_test_expired;
  assert.equal(abandoned.status,"email_queued");assert.equal(abandoned.customerEmail,"buyer@example.com");assert.equal(abandoned.promotionConsent,true);
  assert.equal(queued.status,"pending");assert.equal(queued.recipient,"buyer@example.com");assert.equal(queued.phone,undefined);
  assert.equal(enqueueStripeAnalytics(state,event,catalog),true);
  assert.equal(measurementPayload(state.analyticsOutbox["checkout_abandoned:cs_test_expired"]).events[0].name,"checkout_abandoned");
  const list=abandonedCheckoutList(state,catalog);
  assert.equal(list[0].items[0].name,"AURA PADDLE Yoga Cruiser");assert.equal(list[0].source,"google");
});

test("recovery email is not queued without explicit website consent",()=>{
  const state={events:{},orders:{},checkoutRequests:{},abandonedCheckouts:{},recoveryEmailOutbox:{},recoverySuppressions:{}};
  applyStripeEvent(state,{id:"evt_no_consent",type:"checkout.session.expired",created:1_787_650_100,data:{object:{id:"cs_test_no_consent",amount_total:14950,currency:"aud",customer_details:{email:"private@example.com"},after_expiration:{recovery:{url:"https://buy.stripe.com/r/private"}},metadata:{aura_items:"AP081165:1",aura_order_number:"APO48222",aura_recovery_email_consent:"false"}}}});
  assert.equal(state.abandonedCheckouts.cs_test_no_consent.status,"no_consent");
  assert.equal(state.recoveryEmailOutbox.cs_test_no_consent,undefined);
});

test("recovery unsubscribe suppresses queued email and future sends",()=>{
  const state={events:{},orders:{},checkoutRequests:{},abandonedCheckouts:{},recoveryEmailOutbox:{},recoverySuppressions:{}};
  const expired=(id,session,created)=>({id,type:"checkout.session.expired",created,data:{object:{id:session,amount_total:14950,currency:"aud",customer_details:{email:"same@example.com"},consent:{promotions:"opt_in"},after_expiration:{recovery:{url:`https://buy.stripe.com/r/${session}`,expires_at:created+30*86400}},metadata:{aura_items:"AP081165:1",aura_order_number:"APO48223"}}}});
  applyStripeEvent(state,expired("evt_first","cs_test_first",1_787_650_200));
  const token=state.recoveryEmailOutbox.cs_test_first.unsubscribeToken;
  assert.equal(unsubscribeRecoveryEmail(state,token,1_787_650_201),true);
  assert.equal(state.recoveryEmailOutbox.cs_test_first.status,"suppressed");
  applyStripeEvent(state,expired("evt_second","cs_test_second",1_787_650_300));
  assert.equal(state.abandonedCheckouts.cs_test_second.status,"unsubscribed");
  assert.equal(state.recoveryEmailOutbox.cs_test_second,undefined);
});

test("successful recovery is linked back to the original abandoned session",()=>{
  const state={events:{},orders:{},checkoutRequests:{},abandonedCheckouts:{cs_test_old:{sessionId:"cs_test_old",status:"email_sent"}},recoveryEmailOutbox:{},recoverySuppressions:{}};
  applyStripeEvent(state,{id:"evt_recovered",type:"checkout.session.completed",created:1_787_650_400,data:{object:{id:"cs_test_new",recovered_from:"cs_test_old",payment_status:"paid",payment_intent:"pi_recovered",amount_total:14950,currency:"aud",metadata:{aura_items:"AP081165:1",aura_order_number:"APO48224",aura_tracking_token:"secure_tracking_token_48224"}}}});
  assert.equal(state.abandonedCheckouts.cs_test_old.status,"recovered");
  assert.equal(state.abandonedCheckouts.cs_test_old.recoveredSessionId,"cs_test_new");
});

test("paid checkout queues one customer confirmation and one internal order notification",()=>{
  const state={events:{},orders:{},checkoutRequests:{},transactionalEmailOutbox:{}};
  const event={id:"evt_order_email",type:"checkout.session.completed",created:1_787_650_500,data:{object:{id:"cs_live_order_email",customer:"cus_live",payment_status:"paid",payment_intent:"pi_live_order_email",amount_total:37450,currency:"aud",customer_details:{email:"Buyer@Example.com",name:"Alex Buyer",phone:"+61400000000"},metadata:{aura_items:"AP734955:1",aura_order_number:"APO48226",aura_tracking_token:"secure_tracking_token_48226",aura_order_mode:"preorder",aura_payment_stage:"initial_50_percent",aura_shipping_region:"local-pickup",aura_shipping_label:"Local pickup — Gold Coast, QLD",aura_shipping_amount:"0"}}}};
  assert.equal(applyStripeEvent(state,event),true);
  assert.equal(queueOrderEmails(state,event),true);
  assert.equal(queueOrderEmails(state,event),false);
  assert.equal(Object.keys(state.transactionalEmailOutbox).length,2);
  const customer=state.transactionalEmailOutbox["cs_live_order_email:customer"],admin=state.transactionalEmailOutbox["cs_live_order_email:admin"];
  assert.equal(customer.recipient,"buyer@example.com");assert.equal(customer.status,"pending");assert.equal(customer.customerName,"Alex Buyer");
  assert.equal(admin.recipient,"admin@aurapaddle.com");assert.equal(admin.kind,"admin_notification");
});

test("order emails include payment, dispatch and secure operational links",()=>{
  const entry={sessionId:"cs_live_mail",kind:"customer_confirmation",recipient:"buyer@example.com",orderNumber:"APO48227",trackingToken:"secure_tracking_token_48227",paymentIntentId:"pi_live_mail",items:[{sku:"AP734955",quantity:1}],amountTotal:37450,currency:"aud",paymentStage:"initial_50_percent",shippingLabel:"Local pickup — Gold Coast, QLD",shippingAmount:0,shippingQuoteRequired:false,customerName:"Alex Buyer",customerEmail:"buyer@example.com",customerPhone:"+61400000000"};
  const customer=customerOrderEmailContent(entry,{catalog,siteUrl:"https://www.aurapaddle.com"});
  assert.match(customer.subject,/APO48227/);assert.match(customer.text,/AUD \$374\.50/);assert.match(customer.text,/15 September 2026/);assert.match(customer.text,/order\/\?order=APO48227&token=secure_tracking_token_48227/);assert.match(customer.text,/within 48 hours/);
  const admin=adminOrderEmailContent({...entry,kind:"admin_notification",recipient:"admin@aurapaddle.com"},{catalog,siteUrl:"https://www.aurapaddle.com"});
  assert.match(admin.subject,/New order APO48227/);assert.match(admin.text,/Alex Buyer/);assert.match(admin.text,/dashboard\.stripe\.com\/payments\/pi_live_mail/);assert.match(admin.text,/Local pickup/);
  const milestone=milestoneOrderEmailContent({...entry,kind:"dispatched",carrier:"Mainfreight",trackingNumber:"MF123",trackingUrl:"https://example.com/track/MF123"},{siteUrl:"https://www.aurapaddle.com"});
  assert.match(milestone.subject,/dispatched/);assert.match(milestone.text,/MF123/);assert.match(milestone.text,/secure_tracking_token_48227/);
});

test("recovery email includes Stripe link, identity and unsubscribe but no SMS action",()=>{
  const content=recoveryEmailContent({sessionId:"cs_test_mail",orderNumber:"APO48225",items:[{sku:"AP081165",quantity:1}],amountTotal:14950,currency:"aud",recipient:"buyer@example.com",recoveryUrl:"https://buy.stripe.com/r/test_mail",unsubscribeToken:"abcdefghijklmnopqrstuvwxyz123456"},{catalog,siteUrl:"https://www.aurapaddle.com"});
  assert.match(content.text,/https:\/\/buy\.stripe\.com\/r\/test_mail/);assert.match(content.text,/Aura Paddle Pty Ltd/);assert.match(content.text,/unsubscribe/);
  assert.doesNotMatch(content.text,/\bSMS\b|text message/i);
});
