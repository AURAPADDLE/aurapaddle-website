import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url));
const catalogPath=path.join(here,"catalog.json");
const stripeMapPath=path.join(here,"stripe-sandbox-map.json");
const shippingRatesPath=path.resolve(here,"..","shipping-rates.json");

export function loadCatalog(){
  const parsed=JSON.parse(fs.readFileSync(catalogPath,"utf8"));
  const bySku=new Map();
  for(const variant of parsed.variants||[]){
    if(!/^AP\d{6}$/.test(variant.sku))throw new Error(`Invalid AP SKU in Stripe catalogue: ${variant.sku}`);
    if(bySku.has(variant.sku))throw new Error(`Duplicate AP SKU in Stripe catalogue: ${variant.sku}`);
    if(!Number.isInteger(variant.checkoutAmount)||variant.checkoutAmount<=0)throw new Error(`Invalid checkout amount for ${variant.sku}`);
    if(!Number.isInteger(variant.depositAmount)||variant.depositAmount<=0||variant.depositAmount>variant.checkoutAmount)throw new Error(`Invalid deposit amount for ${variant.sku}`);
    if(variant.orderMode==="preorder"&&variant.depositAmount*2!==variant.checkoutAmount)throw new Error(`Pre-order deposit must equal 50% for ${variant.sku}`);
    bySku.set(variant.sku,Object.freeze(variant));
  }
  return {generatedAt:parsed.generatedAt,currency:parsed.currency,variants:parsed.variants,bySku};
}

export function loadShippingRates(){
  const parsed=JSON.parse(fs.readFileSync(shippingRatesPath,"utf8"));
  if(parsed.currency!=="AUD"||!Array.isArray(parsed.regions)||!parsed.regions.length)throw new Error("Invalid shipping-rate configuration.");
  const byId=new Map();
  for(const region of parsed.regions){
    if(!/^[a-z0-9-]+$/.test(region.id)||byId.has(region.id))throw new Error(`Invalid or duplicate shipping region: ${region.id}`);
    if(!region.quoteRequired&&(!Number.isInteger(region.isup)||!Number.isInteger(region.surfboard)))throw new Error(`Invalid shipping prices for ${region.id}`);
    byId.set(region.id,Object.freeze(region));
  }
  return {...parsed,byId};
}

export function calculateShipping(items,regionId,rates=loadShippingRates()){
  const region=rates.byId.get(String(regionId||""));
  if(!region)throw new Error("Select a valid Australian delivery region.");
  if(region.id==="local-pickup")return {regionId:region.id,label:region.label,amount:0,quoteRequired:false,pickup:true};
  if(region.quoteRequired)return {regionId:region.id,label:region.label,amount:null,quoteRequired:true,pickup:false};
  const isup=new Set(rates.classes.isup),surfboard=new Set(rates.classes.surfboard);
  const hasAngler=items.some(item=>item.variant.slug==="angler-fishing");
  let amount=0,surfboardQuantity=0,quoteRequired=false;
  for(const item of items){
    const slug=item.variant.slug;
    if(item.variant.sku==="AP667703"){
      if(!hasAngler)quoteRequired=true;
      continue;
    }
    if(isup.has(slug))amount+=region.isup*item.quantity;
    else if(surfboard.has(slug)){
      surfboardQuantity+=item.quantity;
      amount+=region.surfboard*item.quantity;
      if(/^9['’]/.test(item.variant.size))amount+=rates.longboardSurcharge*item.quantity;
    }else quoteRequired=true;
  }
  if(surfboardQuantity>1)quoteRequired=true;
  return {regionId:region.id,label:region.label,amount:quoteRequired?null:amount,quoteRequired,pickup:false};
}

export function loadStripeMap(catalog){
  const parsed=JSON.parse(fs.readFileSync(stripeMapPath,"utf8"));
  if(parsed.mode!=="sandbox")throw new Error("Only the Stripe sandbox mapping is permitted in this review build.");
  const bySku=new Map();
  for(const variant of catalog.variants){
    if(variant.kind==="accessory")continue;
    const entry=parsed.skus?.[variant.sku];
    if(!entry)continue;
    if(!/^prod_[A-Za-z0-9]+$/.test(entry.productId)||!/^price_[A-Za-z0-9]+$/.test(entry.priceId))throw new Error(`Invalid Stripe object mapping for ${variant.sku}`);
    if(entry.currency!=="aud"||entry.unitAmount!==variant.checkoutAmount)throw new Error(`Stripe sandbox price mismatch for ${variant.sku}`);
    bySku.set(variant.sku,Object.freeze(entry));
  }
  return {accountId:parsed.accountId,mode:parsed.mode,generatedAt:parsed.generatedAt,bySku};
}

export function normaliseQuantity(value){
  const quantity=Number(value);
  if(!Number.isInteger(quantity)||quantity<1||quantity>20)throw new Error("Quantity must be a whole number between 1 and 20.");
  return quantity;
}

const attributionText=(value,max=120)=>{
  if(typeof value!=="string")return "";
  return value.trim().replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max);
};

function normaliseAttributionTouch(value,{analytics,marketing}){
  if(!value||typeof value!=="object")return null;
  const touch={};
  if(analytics){
    touch.source=attributionText(value.source,100);
    touch.medium=attributionText(value.medium,100);
    touch.campaign=attributionText(value.campaign,160);
    touch.campaignId=attributionText(value.campaignId,100);
    touch.content=attributionText(value.content,160);
    touch.term=attributionText(value.term,160);
    touch.landingPath=attributionText(value.landingPath,240).startsWith("/")?attributionText(value.landingPath,240):"";
    touch.referrerHost=attributionText(value.referrerHost,160).toLowerCase().replace(/[^a-z0-9.-]/g,"");
  }
  if(marketing){
    const clickType=attributionText(value.clickType,16).toLowerCase();
    if(["gclid","gbraid","wbraid"].includes(clickType)){
      touch.clickType=clickType;
      touch.clickId=attributionText(value.clickId,240).replace(/[^A-Za-z0-9._~-]/g,"");
    }
    touch.gadSource=attributionText(value.gadSource,40).replace(/[^A-Za-z0-9._~-]/g,"");
  }
  const capturedAt=Date.parse(value.capturedAt||"");
  if(Number.isFinite(capturedAt))touch.capturedAt=new Date(capturedAt).toISOString();
  for(const key of Object.keys(touch))if(touch[key]==="")delete touch[key];
  return Object.keys(touch).length?touch:null;
}

export function normaliseAttribution(value){
  const raw=value&&typeof value==="object"?value:{};
  const consentRaw=raw.consent&&typeof raw.consent==="object"?raw.consent:{};
  const consent={analytics:consentRaw.analytics===true,marketing:consentRaw.marketing===true};
  const updatedAt=Date.parse(consentRaw.updatedAt||"");
  if(Number.isFinite(updatedAt))consent.updatedAt=new Date(updatedAt).toISOString();
  const attribution={version:1,consent};
  attribution.first=normaliseAttributionTouch(raw.first,consent);
  attribution.last=normaliseAttributionTouch(raw.last,consent);
  if(consent.analytics){
    const clientId=attributionText(raw.analyticsClientId,80);
    const sessionId=attributionText(String(raw.analyticsSessionId||""),32);
    if(/^\d+\.\d+$/.test(clientId))attribution.analyticsClientId=clientId;
    if(/^\d+$/.test(sessionId))attribution.analyticsSessionId=sessionId;
  }
  if(!attribution.first)delete attribution.first;
  if(!attribution.last)delete attribution.last;
  return attribution;
}

export function reserveCheckoutIdentity(state,{requestId,attribution,now=Math.floor(Date.now()/1000),randomInt=crypto.randomInt,randomBytes=crypto.randomBytes}={}){
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId||""))throw new Error("Invalid checkout request ID.");
  state.orders??={};state.reservations??={};state.checkoutRequests??={};
  for(const [key,entry] of Object.entries(state.checkoutRequests))if(now-Number(entry?.reservedAt||0)>86400)delete state.checkoutRequests[key];
  const existing=state.checkoutRequests[requestId];
  if(existing){
    if(!existing.attribution&&attribution)existing.attribution=normaliseAttribution(attribution);
    return {orderNumber:existing.orderNumber,trackingToken:existing.trackingToken,integrationIdentifier:existing.integrationIdentifier};
  }
  const used=new Set(Object.values(state.orders).map(order=>order.orderNumber));
  for(const [number,reservedAt] of Object.entries(state.reservations)){
    if(now-Number(reservedAt)>86400)delete state.reservations[number];
    else used.add(number);
  }
  let orderNumber;
  do orderNumber=`APO${randomInt(0,100000).toString().padStart(5,"0")}`;while(used.has(orderNumber));
  const trackingToken=randomBytes(24).toString("base64url");
  const suffix=randomBytes(8).toString("hex").slice(0,8).replace(/[0-9]/g,char=>"abcdefghij"[Number(char)]);
  const identity={orderNumber,trackingToken,integrationIdentifier:`aura_cart_${suffix}`,reservedAt:now,attribution:normaliseAttribution(attribution)};
  state.reservations[orderNumber]=now;
  state.checkoutRequests[requestId]=identity;
  return {orderNumber,trackingToken,integrationIdentifier:identity.integrationIdentifier};
}

export function normaliseCheckoutItems(rawItems,catalog){
  if(!Array.isArray(rawItems)||rawItems.length<1||rawItems.length>20)throw new Error("A cart must contain between 1 and 20 distinct products.");
  const merged=new Map();
  for(const raw of rawItems){
    const sku=String(raw?.sku||"").toUpperCase(),variant=catalog.bySku.get(sku);
    if(!variant)throw new Error(`SKU ${sku||"(missing)"} is not enabled for Stripe Checkout.`);
    const quantity=normaliseQuantity(raw.quantity);
    merged.set(sku,{variant,quantity:(merged.get(sku)?.quantity||0)+quantity});
  }
  let items=[...merged.values()];
  if(items.some(item=>item.quantity>20))throw new Error("A single SKU cannot exceed 20 boards per online order.");
  if(items.reduce((sum,item)=>sum+item.quantity,0)>50)throw new Error("An online cart cannot exceed 50 boards. Contact AURA PADDLE for a larger order.");
  const anglerQuantity=items.filter(item=>item.variant.slug==="angler-fishing").reduce((sum,item)=>sum+item.quantity,0);
  const rack=items.find(item=>item.variant.sku==="AP667703");
  if(rack&&anglerQuantity>0){
    const paired=Math.min(rack.quantity,anglerQuantity),regular=rack.quantity-paired;
    items=items.filter(item=>item!==rack);
    if(paired)items.push({...rack,quantity:paired,unitPaymentAmount:rack.variant.orderMode==="preorder"?rack.variant.bundle.unitAmount/2:rack.variant.bundle.unitAmount,bundleApplied:true});
    if(regular)items.push({...rack,quantity:regular});
  }
  return items;
}

export function safeReturnPath(value,fallbackValue="/cart-preview.html"){
  const fallback=typeof fallbackValue==="string"?fallbackValue:`/products/${fallbackValue.slug}.html?size=${encodeURIComponent(fallbackValue.size)}&colour=${encodeURIComponent(fallbackValue.colourKey)}`;
  if(typeof value!=="string"||!value.startsWith("/")||value.startsWith("//")||value.includes("\\"))return fallback;
  try{
    const parsed=new URL(value,"https://www.aurapaddle.com");
    if(parsed.origin!=="https://www.aurapaddle.com")return fallback;
    return `${parsed.pathname}${parsed.search}`;
  }catch{return fallback}
}

function orderMetadata(items,shipping,orderNumber,trackingToken,attribution){
  const modes=new Set(items.map(item=>item.variant.orderMode));
  const hasPreorder=items.some(item=>item.variant.orderMode==="preorder");
  const quantities=new Map();for(const item of items)quantities.set(item.variant.sku,(quantities.get(item.variant.sku)||0)+item.quantity);
  const normalised=normaliseAttribution(attribution),last=normalised.last||{};
  const metadata={
    aura_cart_version:"2",
    aura_items:[...quantities].map(([sku,quantity])=>`${sku}:${quantity}`).join(","),
    aura_item_count:String(quantities.size),
    aura_total_quantity:String(items.reduce((sum,item)=>sum+item.quantity,0)),
    aura_order_mode:modes.size===1?[...modes][0]:"mixed",
    aura_payment_stage:hasPreorder?"initial_50_percent":"paid_in_full",
    aura_shipping_region:shipping.regionId,
    aura_shipping_label:shipping.label,
    aura_shipping_amount:shipping.amount===null?"quote_required":String(shipping.amount),
    aura_shipping_stage:"pay_before_dispatch",
    aura_order_number:orderNumber,
    aura_tracking_token:trackingToken,
    aura_attribution_version:"1",
    aura_consent_analytics:String(normalised.consent.analytics),
    aura_consent_marketing:String(normalised.consent.marketing)
  };
  const optional={
    aura_attr_source:last.source,
    aura_attr_medium:last.medium,
    aura_attr_campaign:last.campaign,
    aura_click_type:last.clickType,
    aura_click_id:last.clickId,
    aura_gad_source:last.gadSource,
    aura_ga_client_id:normalised.analyticsClientId,
    aura_ga_session_id:normalised.analyticsSessionId,
    aura_consent_updated_at:normalised.consent.updatedAt
  };
  for(const [key,value] of Object.entries(optional))if(value)metadata[key]=value;
  return metadata;
}

function appendObject(params,prefix,object){
  for(const [key,value] of Object.entries(object))params.set(`${prefix}[${key}]`,String(value));
}

export function buildCheckoutParams({items,priceBySku,siteUrl,returnPath,shipping,attribution,orderNumber="APO00000",trackingToken="test-tracking-token",integrationIdentifier="aura_cart_abcdefgh",now=Math.floor(Date.now()/1000)}){
  const params=new URLSearchParams();
  if(!shipping?.regionId)throw new Error("Shipping region is required for checkout.");
  if(!/^APO\d{5}$/.test(orderNumber))throw new Error("Invalid AURA order number.");
  if(!/^[A-Za-z0-9_-]{16,80}$/.test(trackingToken))throw new Error("Invalid order tracking token.");
  const metadata=orderMetadata(items,shipping,orderNumber,trackingToken,attribution);
  const cancelPath=safeReturnPath(returnPath,"/cart-preview.html");
  const cancelUrl=new URL(cancelPath,siteUrl);
  cancelUrl.searchParams.set("checkout","cancelled");

  params.set("mode","payment");
  params.set("adaptive_pricing[enabled]","false");
  params.set("excluded_payment_method_types[0]","afterpay_clearpay");
  params.set("integration_identifier",integrationIdentifier);
  items.forEach(({variant,quantity},index)=>{
    const prefix=`line_items[${index}]`,stripePrice=priceBySku?.get(variant.sku);
    const sourceItem=items[index],paymentAmount=sourceItem.unitPaymentAmount??(variant.orderMode==="preorder"?variant.depositAmount:variant.checkoutAmount);
    params.set(`${prefix}[price_data][currency]`,"aud");
    if(stripePrice)params.set(`${prefix}[price_data][product]`,stripePrice.productId);
    else{params.set(`${prefix}[price_data][product_data][name]`,`${variant.productName} · ${orderNumber}`);params.set(`${prefix}[price_data][product_data][description]`,sourceItem.bundleApplied?"Fishing Rack — Angler Fishing bundle price":variant.kind==="accessory"?"Fishing Rack accessory":`${variant.shortName} · ${variant.size} · ${variant.colour} · ${variant.sku}`);params.set(`${prefix}[price_data][product_data][metadata][aura_sku]`,variant.sku)}
    params.set(`${prefix}[price_data][unit_amount]`,String(paymentAmount));
    params.set(`${prefix}[quantity]`,String(quantity));
  });
  const cartReference=crypto.createHash("sha256").update(metadata.aura_items).digest("hex").slice(0,24);
  params.set("client_reference_id",items.length===1?items[0].variant.sku:`cart-${cartReference}`);
  params.set("customer_creation","always");
  params.set("billing_address_collection","required");
  if(!shipping.pickup)params.set("shipping_address_collection[allowed_countries][0]","AU");
  params.set("phone_number_collection[enabled]","true");
  params.set("allow_promotion_codes","false");
  params.set("consent_collection[promotions]","auto");
  params.set("after_expiration[recovery][enabled]","true");
  params.set("after_expiration[recovery][allow_promotion_codes]","false");
  params.set("expires_at",String(now+7200));
  params.set("locale","en");
  params.set("submit_type","pay");
  params.set("payment_intent_data[description]",`AURA PADDLE ${orderNumber} initial payment`);
  params.set("success_url",`${siteUrl}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url",cancelUrl.toString());
  const freightCopy=shipping.quoteRequired?`${shipping.label}: freight quote required.`:shipping.pickup?"Free local pickup in Gold Coast, QLD. Exact pickup address is provided after order confirmation.":`${shipping.label}: AUD $${(shipping.amount/100).toFixed(2)} shipping.`;
  params.set("custom_text[submit][message]",`This Checkout collects the 50% initial product payment only. ${freightCopy} The remaining product balance and any shipping charge are payable before dispatch. Change of mind: full refund within 48 hours; conditional orders remain cancellable until AURA PADDLE confirms production in writing. Australian Consumer Law rights are not limited.`);
  if(!shipping.pickup)params.set("custom_text[shipping_address][message]",`${freightCopy} AURA PADDLE will request this amount with the remaining product balance before dispatch.`);
  appendObject(params,"metadata",metadata);
  appendObject(params,"payment_intent_data[metadata]",metadata);
  return params;
}

function parseMetadataItems(metadata){
  const compact=String(metadata.aura_items||"");
  if(compact)return compact.split(",").map(entry=>{const [sku,rawQuantity]=entry.split(":");return {sku,quantity:normaliseQuantity(rawQuantity),activeQuantity:normaliseQuantity(rawQuantity)}}).filter(item=>/^AP(?:\d{6}|-RACK-01)$/.test(item.sku));
  if(metadata.aura_sku)return [{sku:metadata.aura_sku,quantity:normaliseQuantity(metadata.aura_quantity||1),activeQuantity:normaliseQuantity(metadata.aura_quantity||1)}];
  return [];
}

export function verifyStripeSignature(payload,header,secret,toleranceSeconds=300,now=Math.floor(Date.now()/1000)){
  if(!header||!secret)return false;
  const entries=header.split(",").map(part=>part.trim().split("="));
  const timestamp=Number(entries.find(([key])=>key==="t")?.[1]);
  const signatures=entries.filter(([key])=>key==="v1").map(([,value])=>value);
  if(!Number.isFinite(timestamp)||Math.abs(now-timestamp)>toleranceSeconds||!signatures.length)return false;
  const expected=crypto.createHmac("sha256",secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some(signature=>{
    if(signature.length!==expected.length)return false;
    return crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
  });
}

function attributionFromMetadata(metadata={}){
  const consent={
    analytics:metadata.aura_consent_analytics==="true",
    marketing:metadata.aura_consent_marketing==="true",
    updatedAt:metadata.aura_consent_updated_at||undefined
  };
  const last={
    source:metadata.aura_attr_source||undefined,
    medium:metadata.aura_attr_medium||undefined,
    campaign:metadata.aura_attr_campaign||undefined,
    clickType:metadata.aura_click_type||undefined,
    clickId:metadata.aura_click_id||undefined,
    gadSource:metadata.aura_gad_source||undefined
  };
  return normaliseAttribution({
    version:1,
    consent,
    first:last,
    last,
    analyticsClientId:metadata.aura_ga_client_id||undefined,
    analyticsSessionId:metadata.aura_ga_session_id||undefined
  });
}

function normaliseRecoveryEmail(value){
  const email=String(value||"").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:"";
}

function pruneRecoveryState(state,now){
  const cutoff=now-30*86400;
  for(const [key,item] of Object.entries(state.abandonedCheckouts||{}))if(Number(item?.expiredAt||0)<cutoff)delete state.abandonedCheckouts[key];
  for(const [key,item] of Object.entries(state.recoveryEmailOutbox||{}))if(["sent","suppressed","failed"].includes(item?.status)&&Number(item?.updatedAt||item?.createdAt||0)<cutoff)delete state.recoveryEmailOutbox[key];
}

function recordAbandonedCheckout(state,object,event){
  state.abandonedCheckouts??={};state.recoveryEmailOutbox??={};state.recoverySuppressions??={};
  const now=Number(event.created||Math.floor(Date.now()/1000));
  pruneRecoveryState(state,now);
  const metadata=object.metadata||{},items=parseMetadataItems(metadata),email=normaliseRecoveryEmail(object.customer_details?.email||object.customer_email),recipientHash=email?crypto.createHash("sha256").update(email).digest("hex"):"";
  const promotionConsent=object.consent?.promotions==="opt_in",recovery=object.after_expiration?.recovery||{},recoveryUrl=String(recovery.url||"");
  const reservation=Object.values(state.checkoutRequests||{}).find(item=>item?.orderNumber===metadata.aura_order_number);
  const attribution=reservation?.attribution?normaliseAttribution(reservation.attribution):attributionFromMetadata(metadata);
  let status=!promotionConsent?"no_consent":!email?"missing_email":!recoveryUrl?"missing_recovery_url":"email_queued";
  const suppressed=recipientHash&&state.recoverySuppressions[recipientHash];
  const recent=recipientHash&&Object.values(state.recoveryEmailOutbox).some(entry=>entry.recipientHash===recipientHash&&["pending","retry","sending","sent"].includes(entry.status)&&now-Number(entry.createdAt||0)<7*86400);
  if(suppressed)status="unsubscribed";
  else if(recent)status="recent_email_suppressed";
  const abandonment={
    sessionId:object.id,orderNumber:metadata.aura_order_number||"",items,amountTotal:Number(object.amount_total||0),currency:object.currency||"aud",customerEmail:email,
    promotionConsent,recoveryUrl,recoveryExpiresAt:Number(recovery.expires_at||0),createdAt:Number(object.created||0),expiredAt:now,status,attribution
  };
  state.abandonedCheckouts[object.id]=abandonment;
  if(status==="email_queued"){
    const unsubscribeToken=crypto.randomBytes(24).toString("base64url");
    state.recoveryEmailOutbox[object.id]={
      key:object.id,sessionId:object.id,orderNumber:abandonment.orderNumber,items,amountTotal:abandonment.amountTotal,currency:abandonment.currency,
      recipient:email,recipientHash,recoveryUrl,recoveryExpiresAt:abandonment.recoveryExpiresAt,unsubscribeToken,status:"pending",attempts:0,nextAttemptAt:0,createdAt:now,updatedAt:now
    };
  }
}

export function abandonedCheckoutList(state,catalog){
  return Object.values(state.abandonedCheckouts||{}).sort((a,b)=>Number(b.expiredAt||0)-Number(a.expiredAt||0)).map(item=>{
    const emailEntry=state.recoveryEmailOutbox?.[item.sessionId];
    return {
      sessionId:item.sessionId,orderNumber:item.orderNumber,email:item.customerEmail||"",items:(item.items||[]).map(entry=>({sku:entry.sku,quantity:entry.quantity,name:catalog?.bySku?.get(entry.sku)?.productName||entry.sku})),
      amountTotal:item.amountTotal,currency:String(item.currency||"aud").toUpperCase(),createdAt:item.createdAt,expiredAt:item.expiredAt,recoveryExpiresAt:item.recoveryExpiresAt,
      promotionConsent:item.promotionConsent===true,status:item.status,emailStatus:emailEntry?.status||"not_queued",emailSentAt:emailEntry?.sentAt||null,recoveryUrl:item.recoveryUrl||"",
      recoveredAt:item.recoveredAt||null,recoveredSessionId:item.recoveredSessionId||"",source:item.attribution?.last?.source||"",campaign:item.attribution?.last?.campaign||""
    };
  });
}

export function unsubscribeRecoveryEmail(state,token,now=Math.floor(Date.now()/1000)){
  const candidate=String(token||"");
  if(!/^[A-Za-z0-9_-]{24,80}$/.test(candidate))return false;
  const tokenHash=crypto.createHash("sha256").update(candidate).digest("hex");
  const entry=Object.values(state.recoveryEmailOutbox||{}).find(item=>crypto.createHash("sha256").update(String(item.unsubscribeToken||"")).digest("hex")===tokenHash);
  if(!entry?.recipientHash)return false;
  state.recoverySuppressions??={};state.recoverySuppressions[entry.recipientHash]={createdAt:now};
  for(const queued of Object.values(state.recoveryEmailOutbox||{}))if(queued.recipientHash===entry.recipientHash&&["pending","retry","sending"].includes(queued.status)){queued.status="suppressed";queued.updatedAt=now}
  for(const abandoned of Object.values(state.abandonedCheckouts||{}))if(normaliseRecoveryEmail(abandoned.customerEmail)&&crypto.createHash("sha256").update(normaliseRecoveryEmail(abandoned.customerEmail)).digest("hex")===entry.recipientHash&&!abandoned.recoveredAt)abandoned.status="unsubscribed";
  return true;
}

export function applyStripeEvent(state,event){
  state.events??={};state.orders??={};state.abandonedCheckouts??={};state.recoveryEmailOutbox??={};state.recoverySuppressions??={};
  if(state.events[event.id])return false;
  const object=event.data?.object||{};
  if(["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)&&object.payment_status==="paid"){
    const metadata=object.metadata||{},items=parseMetadataItems(metadata),quantity=items.reduce((sum,item)=>sum+item.quantity,0);
    const reservation=Object.values(state.checkoutRequests||{}).find(item=>item?.orderNumber===metadata.aura_order_number);
    const attribution=reservation?.attribution?normaliseAttribution(reservation.attribution):attributionFromMetadata(metadata);
    state.orders[object.id]={
      sessionId:object.id,
      orderNumber:metadata.aura_order_number||"",
      trackingToken:metadata.aura_tracking_token||"",
      paymentIntentId:typeof object.payment_intent==="string"?object.payment_intent:object.payment_intent?.id||"",
      customerId:typeof object.customer==="string"?object.customer:object.customer?.id||"",
      sku:items.length===1?items[0].sku:"",
      items,
      orderMode:metadata.aura_order_mode||"mixed",
      paymentStage:metadata.aura_payment_stage||"initial_50_percent",
      shippingRegion:metadata.aura_shipping_region||"",
      shippingLabel:metadata.aura_shipping_label||"",
      shippingAmount:metadata.aura_shipping_amount==="quote_required"?null:Number(metadata.aura_shipping_amount||0),
      shippingQuoteRequired:metadata.aura_shipping_amount==="quote_required",
      quantity,
      activeQuantity:quantity,
      unitAmount:items.length===1?Math.round(Number(object.amount_total||0)/quantity):0,
      amountTotal:Number(object.amount_total||0),
      amountRefunded:0,
      currency:object.currency||"aud",
      paymentStatus:object.payment_status,
      orderStatus:"initial_payment_received",
      initialPaymentStatus:"paid",
      balancePaymentStatus:"not_requested",
      fulfilmentStatus:"preorder_confirmed",
      customerEmail:object.customer_details?.email||object.customer_email||"",
      attribution,
      created:object.created||event.created,
      updated:event.created
    };
    if(object.recovered_from&&state.abandonedCheckouts[object.recovered_from]){
      const abandoned=state.abandonedCheckouts[object.recovered_from];
      abandoned.recoveredAt=event.created;abandoned.recoveredSessionId=object.id;abandoned.status="recovered";
    }
  }
  if(event.type==="checkout.session.expired")recordAbandonedCheckout(state,object,event);
  if(event.type==="charge.refunded"){
    const paymentIntentId=typeof object.payment_intent==="string"?object.payment_intent:object.payment_intent?.id;
    const order=Object.values(state.orders).find(item=>item.paymentIntentId===paymentIntentId);
    if(order){
      order.amountRefunded=Number(object.amount_refunded||0);
      if(object.refunded){for(const item of order.items||[])item.activeQuantity=0;order.activeQuantity=0}
      else if((order.items||[]).length===1&&order.unitAmount>0){order.items[0].activeQuantity=Math.max(0,Math.floor((order.amountTotal-order.amountRefunded)/order.unitAmount));order.activeQuantity=order.items[0].activeQuantity}
      else{for(const item of order.items||[])item.activeQuantity=0;order.activeQuantity=0;order.requiresRefundAllocationReview=true}
      order.paymentStatus=object.refunded?"refunded":"partially_refunded";
      if(object.refunded){order.orderStatus="refunded";order.initialPaymentStatus="refunded";order.fulfilmentStatus="cancelled"}
      order.updated=event.created;
    }
  }
  if(event.type==="invoice.paid"){
    const orderNumber=object.metadata?.aura_order_number;
    const order=Object.values(state.orders).find(item=>item.orderNumber===orderNumber);
    if(order){
      const paidAmount=Number(object.amount_paid||0),expectedAmount=Number(order.balanceRequestedAmount||0),invoiceMatches=!order.balanceInvoiceId||order.balanceInvoiceId===object.id;
      order.balancePaidAmount=paidAmount;
      if(expectedAmount>0&&paidAmount===expectedAmount&&invoiceMatches){order.balancePaymentStatus="paid";order.balanceInvoiceId=object.id;order.orderStatus="balance_paid";order.fulfilmentStatus="preparing_for_dispatch";delete order.requiresBalancePaymentReview}
      else{order.balancePaymentStatus="payment_review";order.requiresBalancePaymentReview=true}
      order.updated=event.created;
    }
  }
  if(event.type==="invoice.voided"){
    const order=Object.values(state.orders).find(item=>item.orderNumber===object.metadata?.aura_order_number);
    if(order){order.balancePaymentStatus="voided";order.updated=event.created}
  }
  if(event.type==="invoice.payment_failed"){
    const order=Object.values(state.orders).find(item=>item.orderNumber===object.metadata?.aura_order_number);
    if(order){order.balancePaymentStatus="payment_failed";order.orderStatus="balance_payment_failed";order.updated=event.created}
  }
  state.events[event.id]={type:event.type,created:event.created};
  return true;
}

export function campaignProgress(state,catalog){
  const campaigns=new Map();
  for(const variant of catalog.variants){
    if(!variant.campaign||variant.campaign.thresholdRequired===false||!variant.campaign.target)continue;
    if(!campaigns.has(variant.campaign.id))campaigns.set(variant.campaign.id,{...variant.campaign,reserved:0});
  }
  for(const order of Object.values(state.orders||{})){
    if(Array.isArray(order.items))for(const item of order.items){const variant=catalog.bySku.get(item.sku);if(variant?.campaign&&campaigns.has(variant.campaign.id))campaigns.get(variant.campaign.id).reserved+=Number(item.activeQuantity||0)}
    else if(order.campaignId&&campaigns.has(order.campaignId))campaigns.get(order.campaignId).reserved+=Number(order.activeQuantity||0);
  }
  return [...campaigns.values()].map(item=>({...item,percent:Math.min(100,Math.round(item.reserved/item.target*100))}));
}
