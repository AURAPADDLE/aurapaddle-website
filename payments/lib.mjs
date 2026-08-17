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

function orderMetadata(items,shipping,orderNumber,trackingToken){
  const modes=new Set(items.map(item=>item.variant.orderMode));
  const hasPreorder=items.some(item=>item.variant.orderMode==="preorder");
  const quantities=new Map();for(const item of items)quantities.set(item.variant.sku,(quantities.get(item.variant.sku)||0)+item.quantity);
  return {
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
    aura_tracking_token:trackingToken
  };
}

function appendObject(params,prefix,object){
  for(const [key,value] of Object.entries(object))params.set(`${prefix}[${key}]`,String(value));
}

export function buildCheckoutParams({items,priceBySku,siteUrl,returnPath,shipping,orderNumber="APO00000",trackingToken="test-tracking-token",integrationIdentifier="aura_cart_abcdefgh"}){
  const params=new URLSearchParams();
  if(!shipping?.regionId)throw new Error("Shipping region is required for checkout.");
  if(!/^APO\d{5}$/.test(orderNumber))throw new Error("Invalid AURA order number.");
  if(!/^[A-Za-z0-9_-]{16,80}$/.test(trackingToken))throw new Error("Invalid order tracking token.");
  const metadata=orderMetadata(items,shipping,orderNumber,trackingToken);
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
    else{params.set(`${prefix}[price_data][product_data][name]`,variant.productName);params.set(`${prefix}[price_data][product_data][description]`,sourceItem.bundleApplied?"Fishing Rack — Angler Fishing bundle price":variant.kind==="accessory"?"Fishing Rack accessory":`${variant.shortName} · ${variant.size} · ${variant.colour} · ${variant.sku}`);params.set(`${prefix}[price_data][product_data][metadata][aura_sku]`,variant.sku)}
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
  params.set("locale","en");
  params.set("submit_type","pay");
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

export function applyStripeEvent(state,event){
  state.events??={};state.orders??={};
  if(state.events[event.id])return false;
  const object=event.data?.object||{};
  if(["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)&&object.payment_status==="paid"){
    const metadata=object.metadata||{},items=parseMetadataItems(metadata),quantity=items.reduce((sum,item)=>sum+item.quantity,0);
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
      created:object.created||event.created,
      updated:event.created
    };
  }
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
    if(order){order.balancePaymentStatus="paid";order.balanceInvoiceId=object.id;order.balancePaidAmount=Number(object.amount_paid||0);order.orderStatus="balance_paid";order.fulfilmentStatus="preparing_for_dispatch";order.updated=event.created}
  }
  if(event.type==="invoice.voided"){
    const order=Object.values(state.orders).find(item=>item.orderNumber===object.metadata?.aura_order_number);
    if(order){order.balancePaymentStatus="voided";order.updated=event.created}
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
