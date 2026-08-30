import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {abandonedCheckoutList,adminOrderList,applyStripeEvent,buildCheckoutParams,calculateShipping,campaignProgress,isStripeHostedInvoiceUrl,loadCatalog,loadShippingRates,loadStripeMap,normaliseAttribution,normaliseCheckoutItems,normaliseQuantity,prepareBalanceRequest,publicOrderView,queueOrderEmails,reserveCheckoutIdentity,safeReturnPath,unsubscribeRecoveryEmail,verifyStripeSignature} from "./lib.mjs";
import {enqueueStripeAnalytics,measurementPayload} from "./analytics.mjs";
import {ensureRecoveryInbox,sendRecoveryEmail} from "./recovery-email.mjs";
import {sendOrderEmail} from "./order-email.mjs";
import {createStateStore} from "./state-store.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const siteDir=path.resolve(here,"..");
function loadLocalEnvironment(){
  const envPath=path.join(here,".env");
  if(!fs.existsSync(envPath))return;
  for(const rawLine of fs.readFileSync(envPath,"utf8").split(/\r?\n/)){
    const line=rawLine.trim();
    if(!line||line.startsWith("#"))continue;
    const equals=line.indexOf("=");
    if(equals<1)continue;
    const key=line.slice(0,equals).trim(),value=line.slice(equals+1).trim().replace(/^(['"])(.*)\1$/,"$2");
    if(/^[A-Z][A-Z0-9_]*$/.test(key)&&process.env[key]===undefined)process.env[key]=value;
  }
}
loadLocalEnvironment();
const dataDir=process.env.ORDER_DATA_DIR?path.resolve(process.env.ORDER_DATA_DIR):path.join(here,"data");
const statePath=path.join(dataDir,"state.json");
const databaseUrl=process.env.DATABASE_URL||process.env.ORDERS_DB_URL||process.env.RENDER_URL||"";
const port=Number(process.env.PORT||4242);
const host=process.env.HOST||"127.0.0.1";
const siteUrl=(process.env.PUBLIC_SITE_URL||`http://localhost:${port}`).replace(/\/$/,"");
const stripeApiBase=(process.env.STRIPE_API_BASE||"https://api.stripe.com").replace(/\/$/,"");
const stripeKey=process.env.STRIPE_API_KEY||"";
const webhookSecret=process.env.STRIPE_WEBHOOK_SECRET||"";
const adminApiToken=process.env.ADMIN_API_TOKEN||"";
const allowLive=process.env.ALLOW_LIVE_PAYMENTS==="true";
const ga4MeasurementId=process.env.GA4_MEASUREMENT_ID||"G-0DJKT6VHVL";
const ga4ApiSecret=process.env.GA4_API_SECRET||"";
const analyticsDispatchEnabled=process.env.GA4_SERVER_EVENTS_ENABLED!=="false";
const analyticsValidationMode=process.env.GA4_VALIDATION_MODE==="true";
const enhancedConversionsEnabled=process.env.ENHANCED_CONVERSIONS_ENABLED==="true";
const agentMailApiKey=process.env.AGENTMAIL_AGENTMAIL_API_KEY||process.env.AGENTMAIL_API_KEY||"";
const orderNotificationEmail=process.env.ORDER_NOTIFICATION_EMAIL||"admin@aurapaddle.com";
const catalog=loadCatalog();
const shippingRates=loadShippingRates();
const configuredStripeAccount=process.env.STRIPE_ACCOUNT_ID||"";
const sandboxStripeMap=loadStripeMap(catalog);
const stripeMap=allowLive
  ? {accountId:"live",mode:"live",bySku:new Map()}
  : configuredStripeAccount&&sandboxStripeMap.accountId!==configuredStripeAccount
    ? {accountId:configuredStripeAccount,mode:"sandbox-inline",bySku:new Map()}
    : sandboxStripeMap;
const store=createStateStore({databaseUrl,statePath});
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8",".xml":"application/xml; charset=utf-8"};

function send(res,status,body,headers={}){
  const payload=typeof body==="string"?body:JSON.stringify(body);
  res.writeHead(status,{"Content-Type":typeof body==="string"?"text/plain; charset=utf-8":"application/json; charset=utf-8","Cache-Control":"no-store",...headers});res.end(payload);
}
function readBody(req,limit=1_000_000){return new Promise((resolve,reject)=>{const chunks=[];let size=0;req.on("data",chunk=>{size+=chunk.length;if(size>limit){reject(new Error("Request body is too large."));req.destroy();return}chunks.push(chunk)});req.on("end",()=>resolve(Buffer.concat(chunks)));req.on("error",reject)})}
async function createOrderIdentity(requestId,attribution){return store.mutate(state=>reserveCheckoutIdentity(state,{requestId,attribution}))}
function requireAdmin(req){const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");if(!adminApiToken||token.length!==adminApiToken.length)return false;return crypto.timingSafeEqual(Buffer.from(token),Buffer.from(adminApiToken))}
function assertStripeKeyMode(){
  if(!stripeKey)throw new Error("Stripe API key is not configured on the checkout server.");
  if(allowLive&&!/^(sk|rk)_live_/.test(stripeKey))throw new Error("Live payments require a live Stripe key.");
  if(!allowLive&&!/^(sk|rk)_test_/.test(stripeKey))throw new Error("Live Stripe keys are blocked. Use a sandbox key for review.");
}
async function stripeRequest(apiPath,options={}){
  assertStripeKeyMode();
  const response=await fetch(`${stripeApiBase}${apiPath}`,{...options,headers:{Authorization:`Bearer ${stripeKey}`,"Stripe-Version":"2026-07-29.dahlia",...options.headers}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error?.message||`Stripe returned HTTP ${response.status}.`);
  return payload;
}
async function checkout(req,res){
  const origin=req.headers.origin;
  if(origin&&origin!==new URL(siteUrl).origin)return send(res,403,{error:"Checkout requests must come from the AURA PADDLE website."});
  const body=JSON.parse((await readBody(req)).toString("utf8")||"{}");
  const rawItems=Array.isArray(body.items)?body.items:[{sku:body.sku,quantity:normaliseQuantity(body.quantity)}];
  const items=normaliseCheckoutItems(rawItems,catalog);
  const shipping=calculateShipping(items,body.shippingRegion,shippingRates);
  const fallback=items.length===1?items[0].variant:"/cart-preview.html";
  const returnPath=safeReturnPath(body.returnPath,fallback);
  const requestId=/^[a-zA-Z0-9_-]{8,80}$/.test(body.requestId||"")?body.requestId:`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const attribution=normaliseAttribution(body.attribution);
  const identity=await createOrderIdentity(requestId,attribution);
  const params=buildCheckoutParams({items,priceBySku:stripeMap.bySku,siteUrl,returnPath,shipping,attribution,recoveryEmailConsent:body.recoveryEmailConsent===true,...identity});
  const session=await stripeRequest("/v1/checkout/sessions",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":`aura-${requestId}`},body:params});
  send(res,200,{id:session.id,url:session.url,orderNumber:identity.orderNumber,testMode:!session.livemode});
}
async function sessionSummary(req,res,url){
  const id=url.searchParams.get("id")||"";
  if(!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id))return send(res,400,{error:"Invalid Checkout Session ID."});
  const session=await stripeRequest(`/v1/checkout/sessions/${encodeURIComponent(id)}`);
  const items=String(session.metadata?.aura_items||"").split(",").filter(Boolean).map(entry=>{const [sku,quantity]=entry.split(":");return {sku,quantity:Number(quantity||1)}});
  send(res,200,{id:session.id,orderNumber:session.metadata?.aura_order_number||"",trackingToken:session.metadata?.aura_tracking_token||"",paymentStatus:session.payment_status,status:session.status,amountTotal:session.amount_total,currency:session.currency,customerEmail:session.customer_details?.email||session.customer_email||"",sku:items.length===1?items[0].sku:session.client_reference_id||"",items,orderMode:session.metadata?.aura_order_mode||"",paymentStage:session.metadata?.aura_payment_stage||"",shippingRegion:session.metadata?.aura_shipping_region||"",shippingLabel:session.metadata?.aura_shipping_label||"",shippingAmount:session.metadata?.aura_shipping_amount||"",quantity:items.reduce((sum,item)=>sum+item.quantity,0)||1});
}
async function orderStatus(req,res,url){
  const orderNumber=url.searchParams.get("order")||"",token=url.searchParams.get("token")||"";
  const order=Object.values((await store.read()).orders||{}).find(item=>item.orderNumber===orderNumber);
  if(!order||!token||token!==order.trackingToken)return send(res,404,{error:"Order not found."});
  send(res,200,publicOrderView(order));
}
async function requestBalance(req,res){
  if(!requireAdmin(req))return send(res,401,{error:"Admin authorisation required."});
  const body=JSON.parse((await readBody(req)).toString("utf8")||"{}");
  const state=await store.read(),order=Object.values(state.orders||{}).find(item=>item.orderNumber===body.orderNumber);
  if(!order)return send(res,404,{error:"Order not found."});
  if(order.balancePaymentStatus==="paid")return send(res,409,{error:"The balance is already paid."});
  if(order.balancePaymentStatus==="requested"&&isStripeHostedInvoiceUrl(order.balanceInvoiceUrl))return send(res,200,{orderNumber:order.orderNumber,status:order.balancePaymentStatus,amount:order.balanceRequestedAmount,invoiceUrl:order.balanceInvoiceUrl,existing:true});
  if(order.initialPaymentStatus!=="paid"||["cancelled","refunded","dispatched"].includes(order.fulfilmentStatus))return send(res,409,{error:"This order is not eligible for a remaining-balance request."});
  const {shippingAmount,dueAmount}=prepareBalanceRequest(order,body);
  if(!order.customerId)throw new Error("Stripe customer is missing from the initial payment record.");
  const customerLocaleParams=new URLSearchParams();
  customerLocaleParams.set("preferred_locales[0]","en");
  await stripeRequest(`/v1/customers/${encodeURIComponent(order.customerId)}`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:customerLocaleParams});
  const invoiceParams=new URLSearchParams({customer:order.customerId,collection_method:"send_invoice",days_until_due:"14",description:`AURA PADDLE ${order.orderNumber} remaining balance and shipping`});
  invoiceParams.set("metadata[aura_order_number]",order.orderNumber);
  invoiceParams.set("custom_fields[0][name]","AURA order");invoiceParams.set("custom_fields[0][value]",order.orderNumber);
  const invoice=await stripeRequest("/v1/invoices",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":`${order.orderNumber}-balance-invoice`},body:invoiceParams});
  const item=new URLSearchParams({customer:order.customerId,invoice:invoice.id,currency:"aud",amount:String(dueAmount),description:`${order.orderNumber} — remaining product balance and shipping`});
  item.set("metadata[aura_order_number]",order.orderNumber);
  await stripeRequest("/v1/invoiceitems",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":`${order.orderNumber}-balance-item`},body:item});
  const draft=await stripeRequest(`/v1/invoices/${invoice.id}`);
  if(Number(draft.amount_due)!==dueAmount)throw new Error(`Stripe invoice total mismatch: expected ${dueAmount}, received ${Number(draft.amount_due||0)}.`);
  await store.mutate(latest=>{const target=Object.values(latest.orders||{}).find(item=>item.orderNumber===body.orderNumber);if(!target)throw new Error("Order not found.");target.shippingAmount=shippingAmount;target.balanceRequestedAmount=dueAmount;target.balancePaymentStatus="requested";target.balanceInvoiceId=invoice.id;target.balanceInvoiceUrl="";target.balanceRequestedAt=Math.floor(Date.now()/1000);target.orderStatus="balance_requested";target.updated=Math.floor(Date.now()/1000)});
  let sent;
  try{sent=await stripeRequest(`/v1/invoices/${invoice.id}/send`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":`${order.orderNumber}-balance-send`},body:new URLSearchParams()})}
  catch(error){await store.mutate(latest=>{const target=Object.values(latest.orders||{}).find(item=>item.orderNumber===body.orderNumber);if(target){target.balancePaymentStatus="request_failed";target.orderStatus="initial_payment_received";target.updated=Math.floor(Date.now()/1000)}});throw error}
  const updated=await store.mutate(latest=>{const target=Object.values(latest.orders||{}).find(item=>item.orderNumber===body.orderNumber);if(!target)throw new Error("Order not found.");target.balanceInvoiceUrl=sent.hosted_invoice_url||"";target.fulfilmentStatus="awaiting_balance";target.updated=Math.floor(Date.now()/1000);return target});
  send(res,200,{orderNumber:updated.orderNumber,status:updated.balancePaymentStatus,amount:dueAmount,invoiceUrl:updated.balanceInvoiceUrl});
}
async function updateFulfilment(req,res){
  if(!requireAdmin(req))return send(res,401,{error:"Admin authorisation required."});
  const body=JSON.parse((await readBody(req)).toString("utf8")||"{}"),allowed=new Set(["cancelled","dispatched"]);
  if(!allowed.has(body.status))throw new Error("Invalid fulfilment status.");
  const order=await store.mutate(state=>{const target=Object.values(state.orders||{}).find(item=>item.orderNumber===body.orderNumber);if(!target)return null;target.fulfilmentStatus=body.status;target.orderStatus=body.status;if(body.status==="dispatched")target.dispatchedAt=Math.floor(Date.now()/1000);target.updated=Math.floor(Date.now()/1000);return target});
  if(!order)return send(res,404,{error:"Order not found."});
  send(res,200,publicOrderView(order));
}

async function orders(req,res){
  if(!requireAdmin(req))return send(res,401,{error:"Admin authorisation required."});
  send(res,200,{generatedAt:Math.floor(Date.now()/1000),items:adminOrderList(await store.read(),catalog)});
}

async function abandonedCheckouts(req,res){
  if(!requireAdmin(req))return send(res,401,{error:"Admin authorisation required."});
  send(res,200,{generatedAt:Math.floor(Date.now()/1000),items:abandonedCheckoutList(await store.read(),catalog)});
}

async function unsubscribeRecovery(req,res,url){
  const removed=await store.mutate(state=>unsubscribeRecoveryEmail(state,url.searchParams.get("token")));
  const title=removed?"Email preference updated":"This link is no longer valid";
  const message=removed?"You will not receive further AURA PADDLE checkout recovery emails.":"The unsubscribe link is invalid or has expired. Contact admin@aurapaddle.com if you need help.";
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:Arial,sans-serif;background:#f3f7f8;color:#122936;margin:0"><main style="max-width:620px;margin:80px auto;background:#fff;padding:40px;border-radius:12px"><h1>${title}</h1><p>${message}</p><p><a href="/">Return to AURA PADDLE</a></p></main></body></html>`;
  res.writeHead(removed?200:404,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});res.end(html);
}

let analyticsFlushActive=false;
async function claimAnalyticsEntry(){
  return store.mutate(state=>{
    const now=Math.floor(Date.now()/1000);
    for(const entry of Object.values(state.analyticsOutbox||{}))if(entry.status==="sending"&&now-Number(entry.claimedAt||0)>300)entry.status="retry";
    const entry=Object.values(state.analyticsOutbox||{}).find(item=>["pending","retry"].includes(item.status)&&Number(item.nextAttemptAt||0)<=now);
    if(!entry)return null;
    entry.status="sending";entry.claimedAt=now;entry.attempts=Number(entry.attempts||0)+1;
    return structuredClone(entry);
  });
}
async function completeAnalyticsEntry(key){
  await store.mutate(state=>{const entry=state.analyticsOutbox?.[key];if(entry){entry.status="sent";entry.sentAt=Math.floor(Date.now()/1000);delete entry.lastError;delete entry.claimedAt}});
}
async function retryAnalyticsEntry(key,error){
  await store.mutate(state=>{const entry=state.analyticsOutbox?.[key];if(!entry)return;const delay=Math.min(3600,30*2**Math.min(Number(entry.attempts||1)-1,7));entry.status=Number(entry.attempts||0)>=12?"failed":"retry";entry.nextAttemptAt=Math.floor(Date.now()/1000)+delay;entry.lastError=String(error?.message||error||"Analytics delivery failed").slice(0,240);delete entry.claimedAt});
}
async function flushAnalyticsOutbox(){
  if(analyticsFlushActive||!analyticsDispatchEnabled||!ga4ApiSecret)return;
  analyticsFlushActive=true;
  try{
    for(let count=0;count<20;count+=1){
      const entry=await claimAnalyticsEntry();if(!entry)break;
      try{
        const endpoint=analyticsValidationMode?"debug/mp/collect":"mp/collect";
        const response=await fetch(`https://www.google-analytics.com/${endpoint}?measurement_id=${encodeURIComponent(ga4MeasurementId)}&api_secret=${encodeURIComponent(ga4ApiSecret)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(measurementPayload(entry)),signal:AbortSignal.timeout(10000)});
        const result=analyticsValidationMode?await response.json().catch(()=>({})):null;
        if(!response.ok||result?.validationMessages?.some(message=>message.severity==="ERROR"))throw new Error(`GA4 Measurement Protocol rejected ${entry.eventName}.`);
        await completeAnalyticsEntry(entry.key);
      }catch(error){await retryAnalyticsEntry(entry.key,error)}
    }
  }finally{analyticsFlushActive=false}
}
let recoveryFlushActive=false;
let recoveryEmailReady=false;
let recoveryEmailInitError="";
async function claimRecoveryEmail(){
  return store.mutate(state=>{
    const now=Math.floor(Date.now()/1000);
    for(const entry of Object.values(state.recoveryEmailOutbox||{}))if(entry.status==="sending"&&now-Number(entry.claimedAt||0)>300)entry.status="retry";
    for(const entry of Object.values(state.recoveryEmailOutbox||{}))if(["pending","retry"].includes(entry.status)&&state.recoverySuppressions?.[entry.recipientHash]){entry.status="suppressed";entry.updatedAt=now}
    const entry=Object.values(state.recoveryEmailOutbox||{}).find(item=>["pending","retry"].includes(item.status)&&Number(item.nextAttemptAt||0)<=now);
    if(!entry)return null;
    entry.status="sending";entry.claimedAt=now;entry.attempts=Number(entry.attempts||0)+1;entry.updatedAt=now;
    return structuredClone(entry);
  });
}
async function completeRecoveryEmail(key,result){
  await store.mutate(state=>{const entry=state.recoveryEmailOutbox?.[key],abandoned=state.abandonedCheckouts?.[key],now=Math.floor(Date.now()/1000);if(entry){entry.status="sent";entry.sentAt=now;entry.updatedAt=now;entry.messageId=result?.message_id||"";delete entry.lastError;delete entry.claimedAt}if(abandoned&&!abandoned.recoveredAt)abandoned.status="email_sent"});
}
async function retryRecoveryEmail(key,error){
  await store.mutate(state=>{const entry=state.recoveryEmailOutbox?.[key];if(!entry)return;const now=Math.floor(Date.now()/1000),delay=Math.min(3600,30*2**Math.min(Number(entry.attempts||1)-1,7));entry.status=Number(entry.attempts||0)>=12?"failed":"retry";entry.nextAttemptAt=now+delay;entry.updatedAt=now;entry.lastError=String(error?.message||error||"Recovery email delivery failed").slice(0,240);delete entry.claimedAt;const abandoned=state.abandonedCheckouts?.[key];if(abandoned&&entry.status==="failed")abandoned.status="email_failed"});
}
async function flushRecoveryEmailOutbox(){
  if(recoveryFlushActive||!agentMailApiKey)return;
  recoveryFlushActive=true;
  try{for(let count=0;count<10;count+=1){const entry=await claimRecoveryEmail();if(!entry)break;try{await completeRecoveryEmail(entry.key,await sendRecoveryEmail(entry,{apiKey:agentMailApiKey,catalog,siteUrl}))}catch(error){await retryRecoveryEmail(entry.key,error)}}}finally{recoveryFlushActive=false}
}
async function initialiseRecoveryEmail(){
  if(!agentMailApiKey)return;
  try{await ensureRecoveryInbox(agentMailApiKey);recoveryEmailReady=true;recoveryEmailInitError=""}
  catch(error){recoveryEmailReady=false;recoveryEmailInitError=String(error?.message||error||"Recovery email configuration failed").slice(0,160);console.error("Recovery email configuration failed",error)}
}
let orderEmailFlushActive=false;
async function claimOrderEmail(){
  return store.mutate(state=>{
    const now=Math.floor(Date.now()/1000);
    for(const entry of Object.values(state.transactionalEmailOutbox||{}))if(entry.status==="sending"&&now-Number(entry.claimedAt||0)>300)entry.status="retry";
    const entry=Object.values(state.transactionalEmailOutbox||{}).find(item=>["pending","retry"].includes(item.status)&&Number(item.nextAttemptAt||0)<=now);
    if(!entry)return null;
    entry.status="sending";entry.claimedAt=now;entry.attempts=Number(entry.attempts||0)+1;entry.updatedAt=now;
    return structuredClone(entry);
  });
}
async function completeOrderEmail(key,result){
  await store.mutate(state=>{const entry=state.transactionalEmailOutbox?.[key];if(!entry)return;const now=Math.floor(Date.now()/1000);entry.status="sent";entry.sentAt=now;entry.updatedAt=now;entry.messageId=result?.message_id||"";delete entry.lastError;delete entry.claimedAt});
}
async function retryOrderEmail(key,error){
  await store.mutate(state=>{const entry=state.transactionalEmailOutbox?.[key];if(!entry)return;const now=Math.floor(Date.now()/1000),delay=Math.min(3600,30*2**Math.min(Number(entry.attempts||1)-1,7));entry.status=Number(entry.attempts||0)>=12?"failed":"retry";entry.nextAttemptAt=now+delay;entry.updatedAt=now;entry.lastError=String(error?.message||error||"Order email delivery failed").slice(0,240);delete entry.claimedAt});
}
async function flushOrderEmailOutbox(){
  if(orderEmailFlushActive||!agentMailApiKey)return;
  orderEmailFlushActive=true;
  try{for(let count=0;count<10;count+=1){const entry=await claimOrderEmail();if(!entry)break;try{await completeOrderEmail(entry.key,await sendOrderEmail(entry,{apiKey:agentMailApiKey,catalog,siteUrl}))}catch(error){await retryOrderEmail(entry.key,error)}}}finally{orderEmailFlushActive=false}
}
async function webhook(req,res){
  const raw=await readBody(req);
  if(!verifyStripeSignature(raw.toString("utf8"),req.headers["stripe-signature"],webhookSecret))return send(res,400,{error:"Invalid Stripe webhook signature."});
  const event=JSON.parse(raw.toString("utf8"));
  await store.mutate(state=>{const applied=applyStripeEvent(state,event);if(applied)enqueueStripeAnalytics(state,event,catalog,{enhancedConversionsEnabled});queueOrderEmails(state,event,{adminEmail:orderNotificationEmail});return applied});
  void flushAnalyticsOutbox().catch(error=>console.error("GA4 outbox flush failed",error));
  void flushRecoveryEmailOutbox().catch(error=>console.error("Recovery email outbox flush failed",error));
  void flushOrderEmailOutbox().catch(error=>console.error("Order email outbox flush failed",error));
  send(res,200,{received:true});
}
function staticFile(req,res,url){
  let pathname=decodeURIComponent(url.pathname);
  if(pathname==="/")pathname="/index.html";
  if(pathname.startsWith("/payments/")||pathname.startsWith("/scripts/")||pathname.split("/").some(part=>part.startsWith(".")))return send(res,404,"Not found");
  let target=path.resolve(siteDir,`.${pathname}`);
  if(!target.startsWith(`${siteDir}${path.sep}`))return send(res,403,"Forbidden");
  let stat;try{stat=fs.statSync(target);if(stat.isDirectory()){target=path.join(target,"index.html");stat=fs.statSync(target)}}catch{return send(res,404,"Not found")}
  if(!stat.isFile())return send(res,404,"Not found");
  res.writeHead(200,{"Content-Type":mime[path.extname(target).toLowerCase()]||"application/octet-stream","Content-Length":stat.size,"Cache-Control":pathname.startsWith("/assets/")?"public, max-age=3600":"no-cache"});
  if(req.method==="HEAD")return res.end();
  fs.createReadStream(target).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,siteUrl);
  try{
    if(req.method==="GET"&&url.pathname==="/api/health"){const state=await store.read(),analyticsEntries=Object.values(state.analyticsOutbox||{}),recoveryEntries=Object.values(state.recoveryEmailOutbox||{}),orderEmailEntries=Object.values(state.transactionalEmailOutbox||{});return send(res,200,{ok:true,mode:allowLive?"live-enabled":"sandbox-only",storage:store.kind,stripeConfigured:Boolean(stripeKey),webhookConfigured:Boolean(webhookSecret),adminConfigured:Boolean(adminApiToken),catalogueSkus:catalog.variants.length,mappedStripePrices:stripeMap.bySku.size,stripeAccount:stripeMap.accountId,analytics:{serverEventsEnabled:analyticsDispatchEnabled,configured:Boolean(ga4ApiSecret),validationMode:analyticsValidationMode,enhancedConversionsEnabled,pending:analyticsEntries.filter(item=>["pending","retry","sending"].includes(item.status)).length,failed:analyticsEntries.filter(item=>item.status==="failed").length},checkoutRecovery:{enabled:true,emailConfigured:Boolean(agentMailApiKey),emailReady:recoveryEmailReady,configurationError:Boolean(recoveryEmailInitError),smsEnabled:false,pending:recoveryEntries.filter(item=>["pending","retry","sending"].includes(item.status)).length,failed:recoveryEntries.filter(item=>item.status==="failed").length},orderNotifications:{enabled:true,emailConfigured:Boolean(agentMailApiKey),emailReady:recoveryEmailReady,recipient:orderNotificationEmail,pending:orderEmailEntries.filter(item=>["pending","retry","sending"].includes(item.status)).length,failed:orderEmailEntries.filter(item=>item.status==="failed").length},account:"AURA PADDLE PTY LTD"})}
    if(req.method==="POST"&&url.pathname==="/api/checkout")return await checkout(req,res);
    if(req.method==="GET"&&url.pathname==="/api/checkout-session")return await sessionSummary(req,res,url);
    if(req.method==="GET"&&url.pathname==="/api/order")return await orderStatus(req,res,url);
    if(req.method==="POST"&&url.pathname==="/api/admin/request-balance")return await requestBalance(req,res);
    if(req.method==="POST"&&url.pathname==="/api/admin/order-status")return await updateFulfilment(req,res);
    if(req.method==="GET"&&url.pathname==="/api/admin/orders")return await orders(req,res);
    if(req.method==="GET"&&url.pathname==="/api/admin/abandoned-checkouts")return await abandonedCheckouts(req,res);
    if(req.method==="GET"&&url.pathname==="/api/recovery/unsubscribe")return await unsubscribeRecovery(req,res,url);
    if(req.method==="POST"&&url.pathname==="/api/stripe-webhook")return await webhook(req,res);
    if(req.method==="GET"&&url.pathname==="/api/preorder-progress")return send(res,200,{campaigns:campaignProgress(await store.read(),catalog)});
    if(["GET","HEAD"].includes(req.method))return staticFile(req,res,url);
    send(res,405,{error:"Method not allowed."},{Allow:"GET, HEAD, POST"});
  }catch(error){console.error(error);send(res,400,{error:error.message||"Unexpected checkout error."})}
});

await store.init();
setInterval(()=>void flushAnalyticsOutbox().catch(error=>console.error("GA4 outbox flush failed",error)),60_000).unref();
setInterval(()=>void flushRecoveryEmailOutbox().catch(error=>console.error("Recovery email outbox flush failed",error)),60_000).unref();
setInterval(()=>void flushOrderEmailOutbox().catch(error=>console.error("Order email outbox flush failed",error)),60_000).unref();
setTimeout(()=>void flushAnalyticsOutbox().catch(error=>console.error("GA4 initial outbox flush failed",error)),2_000).unref();
setTimeout(()=>void initialiseRecoveryEmail().then(()=>Promise.all([flushRecoveryEmailOutbox(),flushOrderEmailOutbox()])).catch(error=>console.error("Transactional email initialisation failed",error)),3_000).unref();
server.listen(port,host,()=>{
  console.log(`AURA Stripe review server: ${siteUrl}`);
  console.log(`Stripe mode: ${allowLive?"LIVE ENABLED":"sandbox only"}; key configured: ${Boolean(stripeKey)}; webhook configured: ${Boolean(webhookSecret)}`);
  console.log(`Trusted checkout catalogue: ${catalog.variants.length} AP SKUs`);
  console.log(`Order storage: ${store.kind}`);
});
