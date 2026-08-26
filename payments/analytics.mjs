import crypto from "node:crypto";

const sha256=value=>crypto.createHash("sha256").update(value).digest("hex");
const cents=value=>Number((Number(value||0)/100).toFixed(2));

function normaliseEmail(value){
  const email=String(value||"").trim().toLowerCase().replace(/\s+/g,"");
  const [local,domain]=email.split("@");
  if(!local||!domain)return "";
  return `${["gmail.com","googlemail.com"].includes(domain)?local.replace(/\./g,""):local}@${domain}`;
}

function normalisePhone(value,country=""){
  const raw=String(value||"").trim();
  if(!raw)return "";
  const digits=raw.replace(/\D/g,"");
  if(!digits)return "";
  if(raw.startsWith("+"))return `+${digits}`;
  if(String(country).toUpperCase()==="AU"&&digits.startsWith("0"))return `+61${digits.slice(1)}`;
  return `+${digits}`;
}

function normaliseName(value){return String(value||"").toLowerCase().replace(/[\d\p{P}\p{S}]/gu,"").trim()}
function normaliseStreet(value){return String(value||"").toLowerCase().replace(/[\p{P}\p{S}]/gu,"").trim()}

export function hashUserData(customerDetails={}){
  const email=normaliseEmail(customerDetails.email),phone=normalisePhone(customerDetails.phone,customerDetails.address?.country);
  const name=customerDetails.name||"",parts=String(name).trim().split(/\s+/),firstName=parts.shift()||"",lastName=parts.join(" ");
  const address=customerDetails.address||{};
  const result={};
  if(email)result.sha256_email_address=sha256(email);
  if(phone)result.sha256_phone_number=sha256(phone);
  const addressResult={};
  const cleanFirst=normaliseName(firstName),cleanLast=normaliseName(lastName),cleanStreet=normaliseStreet(address.line1);
  if(cleanFirst)addressResult.sha256_first_name=sha256(cleanFirst);
  if(cleanLast)addressResult.sha256_last_name=sha256(cleanLast);
  if(cleanStreet)addressResult.sha256_street=sha256(cleanStreet);
  if(address.city)addressResult.city=String(address.city).toLowerCase().trim();
  if(address.state)addressResult.region=String(address.state).toLowerCase().trim();
  if(address.postal_code)addressResult.postal_code=String(address.postal_code).replace(/[.~]/g,"").trim();
  if(address.country)addressResult.country=String(address.country).toUpperCase().slice(0,2);
  if(Object.keys(addressResult).length>=2)result.address=addressResult;
  return result;
}

function orderItems(order,catalog){
  const items=Array.isArray(order.items)?order.items:[];
  const anglerQuantity=items.filter(item=>catalog.bySku.get(item.sku)?.slug==="angler-fishing").reduce((sum,item)=>sum+Number(item.quantity||0),0);
  const rackQuantity=items.filter(item=>item.sku==="AP667703").reduce((sum,item)=>sum+Number(item.quantity||0),0);
  const pairedRack=Math.min(anglerQuantity,rackQuantity);
  let remainingPairedRack=pairedRack;
  return items.map(item=>{
    const variant=catalog.bySku.get(item.sku),quantity=Number(item.quantity||1);
    let unitAmount=variant?.orderMode==="preorder"?variant.depositAmount:variant?.checkoutAmount;
    if(item.sku==="AP667703"){
      const paired=Math.min(quantity,remainingPairedRack),regular=quantity-paired;
      remainingPairedRack-=paired;
      unitAmount=Math.round((paired*3450+regular*6450)/quantity);
    }
    return {
      item_id:item.sku,
      item_name:variant?.productName||variant?.shortName||item.sku,
      item_brand:"AURA PADDLE",
      item_category:variant?.kind==="accessory"?"Accessory":variant?.shortName||"Board",
      item_variant:[variant?.size,variant?.colour].filter(Boolean).join(" · "),
      price:cents(unitAmount),
      quantity
    };
  });
}

function orderForEvent(state,event){
  const object=event.data?.object||{};
  if(["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type))return state.orders?.[object.id];
  if(event.type==="checkout.session.expired")return state.abandonedCheckouts?.[object.id];
  if(event.type==="charge.refunded"){
    const paymentIntentId=typeof object.payment_intent==="string"?object.payment_intent:object.payment_intent?.id;
    return Object.values(state.orders||{}).find(order=>order.paymentIntentId===paymentIntentId);
  }
  return Object.values(state.orders||{}).find(order=>order.orderNumber===object.metadata?.aura_order_number);
}

function queueEntry(state,key,entry){
  state.analyticsOutbox??={};
  if(state.analyticsOutbox[key])return false;
  state.analyticsOutbox[key]={key,status:"pending",attempts:0,nextAttemptAt:0,...entry};
  return true;
}

export function enqueueStripeAnalytics(state,event,catalog,{enhancedConversionsEnabled=false}={}){
  const object=event.data?.object||{},order=orderForEvent(state,event),consent=order?.attribution?.consent||{};
  if(!order||consent.analytics!==true||!order.attribution?.analyticsClientId)return false;
  const base={
    stripeEventId:event.id,
    orderNumber:order.orderNumber,
    clientId:order.attribution.analyticsClientId,
    sessionId:order.attribution.analyticsSessionId||"",
    consent:{analytics:true,marketing:consent.marketing===true},
    timestampMicros:Number(event.created||Math.floor(Date.now()/1000))*1_000_000,
    createdAt:Math.floor(Date.now()/1000)
  };
  let key,eventName,params;
  if(["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)&&object.payment_status==="paid"){
    key=`purchase:${order.orderNumber}`;
    eventName="purchase";
    params={transaction_id:order.orderNumber,currency:String(order.currency||"aud").toUpperCase(),value:cents(order.amountTotal),shipping:0,payment_stage:order.paymentStage||"initial_50_percent",items:orderItems(order,catalog)};
  }else if(event.type==="checkout.session.expired"){
    key=`checkout_abandoned:${object.id}`;
    eventName="checkout_abandoned";
    params={transaction_id:order.orderNumber,currency:String(order.currency||"aud").toUpperCase(),value:cents(order.amountTotal),items:orderItems(order,catalog)};
  }else if(event.type==="charge.refunded"){
    const cumulative=Number(object.amount_refunded||0),previous=Number(order.analyticsRefundQueuedAmount||0),delta=cumulative-previous;
    if(delta<=0)return false;
    key=`refund:${event.id}`;
    eventName="refund";
    params={transaction_id:order.orderNumber,currency:String(order.currency||"aud").toUpperCase(),value:cents(delta),refund_scope:object.refunded?"full":"partial"};
    if(object.refunded)params.items=orderItems(order,catalog);
    order.analyticsRefundQueuedAmount=cumulative;
  }else if(event.type==="invoice.paid"&&order.balancePaymentStatus==="paid"){
    key=`balance_payment:${object.id}`;
    eventName="balance_payment";
    params={transaction_id:`${order.orderNumber}-BALANCE`,currency:String(object.currency||order.currency||"aud").toUpperCase(),value:cents(object.amount_paid),shipping:cents(order.shippingAmount),payment_stage:"balance_and_shipping"};
  }else if(event.type==="invoice.voided"){
    key=`balance_invoice_voided:${object.id}`;
    eventName="balance_invoice_voided";
    params={transaction_id:`${order.orderNumber}-BALANCE`,payment_stage:"balance_and_shipping"};
  }else if(event.type==="invoice.payment_failed"){
    key=`balance_payment_failed:${object.id}`;
    eventName="balance_payment_failed";
    params={transaction_id:`${order.orderNumber}-BALANCE`,currency:String(object.currency||order.currency||"aud").toUpperCase(),value:cents(object.amount_due),payment_stage:"balance_and_shipping"};
  }else return false;
  const entry={...base,eventName,params};
  if(enhancedConversionsEnabled&&consent.marketing===true&&eventName==="purchase"&&order.customerId){
    const userData=hashUserData(object.customer_details||{});
    if(Object.keys(userData).length){entry.userData=userData;entry.userId=order.customerId}
  }
  return queueEntry(state,key,entry);
}

export function measurementPayload(entry){
  const params={...entry.params,engagement_time_msec:1};
  if(entry.sessionId)params.session_id=Number(entry.sessionId);
  const payload={
    client_id:entry.clientId,
    timestamp_micros:entry.timestampMicros,
    consent:{ad_user_data:entry.consent?.marketing?"GRANTED":"DENIED",ad_personalization:"DENIED"},
    events:[{name:entry.eventName,params}]
  };
  if(entry.userId)payload.user_id=entry.userId;
  if(entry.userData)payload.user_data=entry.userData;
  return payload;
}
