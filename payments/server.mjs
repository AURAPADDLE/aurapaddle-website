import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {applyStripeEvent,buildCheckoutParams,calculateShipping,campaignProgress,loadCatalog,loadShippingRates,loadStripeMap,normaliseCheckoutItems,normaliseQuantity,safeReturnPath,verifyStripeSignature} from "./lib.mjs";
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
const catalog=loadCatalog();
const shippingRates=loadShippingRates();
const stripeMap=allowLive?{accountId:"live",mode:"live",bySku:new Map()}:loadStripeMap(catalog);
const store=createStateStore({databaseUrl,statePath});
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8",".xml":"application/xml; charset=utf-8"};

function send(res,status,body,headers={}){
  const payload=typeof body==="string"?body:JSON.stringify(body);
  res.writeHead(status,{"Content-Type":typeof body==="string"?"text/plain; charset=utf-8":"application/json; charset=utf-8","Cache-Control":"no-store",...headers});res.end(payload);
}
function readBody(req,limit=1_000_000){return new Promise((resolve,reject)=>{const chunks=[];let size=0;req.on("data",chunk=>{size+=chunk.length;if(size>limit){reject(new Error("Request body is too large."));req.destroy();return}chunks.push(chunk)});req.on("end",()=>resolve(Buffer.concat(chunks)));req.on("error",reject)})}
async function createOrderIdentity(){
  return store.mutate(state=>{
    const now=Math.floor(Date.now()/1000),used=new Set(Object.values(state.orders||{}).map(order=>order.orderNumber));
    state.reservations??={};
    for(const [number,reservedAt] of Object.entries(state.reservations))if(now-Number(reservedAt)>86400)delete state.reservations[number];else used.add(number);
    let orderNumber;
    do orderNumber=`APO${crypto.randomInt(0,100000).toString().padStart(5,"0")}`;while(used.has(orderNumber));
    state.reservations[orderNumber]=now;
    return {orderNumber,trackingToken:crypto.randomBytes(24).toString("base64url")};
  });
}
function requireAdmin(req){const token=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");if(!adminApiToken||token.length!==adminApiToken.length)return false;return crypto.timingSafeEqual(Buffer.from(token),Buffer.from(adminApiToken))}
function assertStripeKeyMode(){
  if(!stripeKey)throw new Error("Stripe API key is not configured on the checkout server.");
  if(allowLive&&!/^(sk|rk)_live_/.test(stripeKey))throw new Error("Live payments require a live Stripe key.");
  if(!allowLive&&!/^(sk|rk)_test_/.test(stripeKey))throw new Error("Live Stripe keys are blocked. Use a sandbox key for review.");
}
async function stripeRequest(apiPath,options={}){
  assertStripeKeyMode();
  const response=await fetch(`${stripeApiBase}${apiPath}`,{...options,headers:{Authorization:`Bearer ${stripeKey}`,"Stripe-Version":"2026-06-24.dahlia",...options.headers}});
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
  const suffix=crypto.randomBytes(8).toString("hex").slice(0,8).replace(/[0-9]/g,char=>"abcdefghij"[Number(char)]);
  const identity=await createOrderIdentity();
  const params=buildCheckoutParams({items,priceBySku:stripeMap.bySku,siteUrl,returnPath,shipping,...identity,integrationIdentifier:`aura_cart_${suffix}`});
  const requestId=/^[a-zA-Z0-9_-]{8,80}$/.test(body.requestId||"")?body.requestId:`${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
function orderView(order){
  const dispatched=order.dispatchedAt?new Date(order.dispatchedAt*1000):null;
  const estimatedArrival=dispatched?new Date(dispatched.getTime()+28*86400000):null;
  return {orderNumber:order.orderNumber,items:order.items,quantity:order.quantity,currency:order.currency,initialPaymentAmount:order.amountTotal,initialPaymentStatus:order.initialPaymentStatus,balancePaymentStatus:order.balancePaymentStatus,balanceRequestedAmount:order.balanceRequestedAmount||null,shippingLabel:order.shippingLabel,shippingAmount:order.shippingAmount,orderStatus:order.orderStatus,fulfilmentStatus:order.fulfilmentStatus,dispatchedAt:dispatched?.toISOString()||null,estimatedArrival:estimatedArrival?.toISOString()||null,updated:order.updated};
}
async function orderStatus(req,res,url){
  const orderNumber=url.searchParams.get("order")||"",token=url.searchParams.get("token")||"";
  const order=Object.values((await store.read()).orders||{}).find(item=>item.orderNumber===orderNumber);
  if(!order||!token||token!==order.trackingToken)return send(res,404,{error:"Order not found."});
  send(res,200,orderView(order));
}
async function requestBalance(req,res){
  if(!requireAdmin(req))return send(res,401,{error:"Admin authorisation required."});
  const body=JSON.parse((await readBody(req)).toString("utf8")||"{}");
  const state=await store.read(),order=Object.values(state.orders||{}).find(item=>item.orderNumber===body.orderNumber);
  if(!order)return send(res,404,{error:"Order not found."});
  if(order.balancePaymentStatus==="paid")return send(res,409,{error:"The balance is already paid."});
  const shippingAmount=order.shippingQuoteRequired?Number(body.shippingAmount):order.shippingAmount;
  if(!Number.isInteger(shippingAmount)||shippingAmount<0)throw new Error("A confirmed shipping amount is required.");
  if(!order.customerId)throw new Error("Stripe customer is missing from the initial payment record.");
  const dueAmount=order.amountTotal+shippingAmount;
  const item=new URLSearchParams({customer:order.customerId,currency:"aud",amount:String(dueAmount),description:`${order.orderNumber} — remaining product balance and shipping`});
  item.set("metadata[aura_order_number]",order.orderNumber);
  await stripeRequest("/v1/invoiceitems",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":`${order.orderNumber}-balance-item`},body:item});
  const invoiceParams=new URLSearchParams({customer:order.customerId,collection_method:"send_invoice",days_until_due:"14",description:`AURA PADDLE ${order.orderNumber} remaining balance and shipping`});
  invoiceParams.set("metadata[aura_order_number]",order.orderNumber);
  invoiceParams.set("custom_fields[0][name]","AURA order");invoiceParams.set("custom_fields[0][value]",order.orderNumber);
  const invoice=await stripeRequest("/v1/invoices",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":`${order.orderNumber}-balance-invoice`},body:invoiceParams});
  const sent=await stripeRequest(`/v1/invoices/${invoice.id}/send`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":`${order.orderNumber}-balance-send`},body:new URLSearchParams()});
  await store.mutate(latest=>{const target=Object.values(latest.orders||{}).find(item=>item.orderNumber===body.orderNumber);if(!target)throw new Error("Order not found.");target.shippingAmount=shippingAmount;target.balanceRequestedAmount=dueAmount;target.balancePaymentStatus="requested";target.balanceInvoiceId=sent.id;target.balanceInvoiceUrl=sent.hosted_invoice_url||"";target.balanceRequestedAt=Math.floor(Date.now()/1000);target.orderStatus="balance_requested";target.updated=Math.floor(Date.now()/1000)});
  send(res,200,{orderNumber:order.orderNumber,status:order.balancePaymentStatus,amount:dueAmount,invoiceUrl:order.balanceInvoiceUrl});
}
async function updateFulfilment(req,res){
  if(!requireAdmin(req))return send(res,401,{error:"Admin authorisation required."});
  const body=JSON.parse((await readBody(req)).toString("utf8")||"{}"),allowed=new Set(["cancelled","dispatched"]);
  if(!allowed.has(body.status))throw new Error("Invalid fulfilment status.");
  const order=await store.mutate(state=>{const target=Object.values(state.orders||{}).find(item=>item.orderNumber===body.orderNumber);if(!target)return null;target.fulfilmentStatus=body.status;target.orderStatus=body.status;if(body.status==="dispatched")target.dispatchedAt=Math.floor(Date.now()/1000);target.updated=Math.floor(Date.now()/1000);return target});
  if(!order)return send(res,404,{error:"Order not found."});
  send(res,200,orderView(order));
}
async function webhook(req,res){
  const raw=await readBody(req);
  if(!verifyStripeSignature(raw.toString("utf8"),req.headers["stripe-signature"],webhookSecret))return send(res,400,{error:"Invalid Stripe webhook signature."});
  const event=JSON.parse(raw.toString("utf8"));
  await store.mutate(state=>applyStripeEvent(state,event));
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
    if(req.method==="GET"&&url.pathname==="/api/health")return send(res,200,{ok:true,mode:allowLive?"live-enabled":"sandbox-only",storage:store.kind,stripeConfigured:Boolean(stripeKey),webhookConfigured:Boolean(webhookSecret),adminConfigured:Boolean(adminApiToken),catalogueSkus:catalog.variants.length,mappedStripePrices:stripeMap.bySku.size,stripeAccount:stripeMap.accountId,account:"AURA PADDLE PTY LTD"});
    if(req.method==="POST"&&url.pathname==="/api/checkout")return await checkout(req,res);
    if(req.method==="GET"&&url.pathname==="/api/checkout-session")return await sessionSummary(req,res,url);
    if(req.method==="GET"&&url.pathname==="/api/order")return await orderStatus(req,res,url);
    if(req.method==="POST"&&url.pathname==="/api/admin/request-balance")return await requestBalance(req,res);
    if(req.method==="POST"&&url.pathname==="/api/admin/order-status")return await updateFulfilment(req,res);
    if(req.method==="POST"&&url.pathname==="/api/stripe-webhook")return await webhook(req,res);
    if(req.method==="GET"&&url.pathname==="/api/preorder-progress")return send(res,200,{campaigns:campaignProgress(await store.read(),catalog)});
    if(["GET","HEAD"].includes(req.method))return staticFile(req,res,url);
    send(res,405,{error:"Method not allowed."},{Allow:"GET, HEAD, POST"});
  }catch(error){console.error(error);send(res,400,{error:error.message||"Unexpected checkout error."})}
});

await store.init();
server.listen(port,host,()=>{
  console.log(`AURA Stripe review server: ${siteUrl}`);
  console.log(`Stripe mode: ${allowLive?"LIVE ENABLED":"sandbox only"}; key configured: ${Boolean(stripeKey)}; webhook configured: ${Boolean(webhookSecret)}`);
  console.log(`Trusted checkout catalogue: ${catalog.variants.length} AP SKUs`);
  console.log(`Order storage: ${store.kind}`);
});
