import crypto from "node:crypto";

export const CHECKOUT_BLOCK_RETENTION_SECONDS=14*24*60*60;
export const CHECKOUT_BLOCK_DEDUPE_SECONDS=10*60;
const reasons=new Set(["invalid_email","invalid_items","mixed_payment_modes","price_changed","invalid_address","manual_quote","region_mismatch","shipping_changed","invalid_promo","stock_unavailable","stripe_rejected"]);
const stages=new Set(["input","cart","delivery","stock","stripe"]);

export function checkoutAttemptToken(requestId){
  const value=String(requestId||"");
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(value))return "";
  return crypto.createHash("sha256").update(`aura-checkout-block:${value}`).digest("hex").slice(0,24);
}

export function checkoutBlockReason(error){
  const message=String(error?.message||error||"");
  if(/in-stock and pre-order/i.test(message))return "mixed_payment_modes";
  if(/stock|inventory|campaign has closed/i.test(message))return "stock_unavailable";
  return "invalid_items";
}

function ensure(state){state.checkoutBlocks??={};return state.checkoutBlocks}
function prune(state,now){const cutoff=now-CHECKOUT_BLOCK_RETENTION_SECONDS;for(const [key,item] of Object.entries(ensure(state)))if(Number(item?.lastAt||item?.createdAt||0)<cutoff)delete state.checkoutBlocks[key]}

export function recordCheckoutBlock(state,input={},now=Math.floor(Date.now()/1000)){
  const attemptToken=String(input.attemptToken||"");
  if(!/^[a-f0-9]{24}$/.test(attemptToken)||!reasons.has(input.reason)||!stages.has(input.stage)||input.internalTest===true)return null;
  prune(state,now);
  const paymentMode=input.paymentMode==="available"?"available":input.paymentMode==="preorder"?"preorder":"unknown",itemCount=Math.max(0,Math.min(50,Math.trunc(Number(input.itemCount)||0))),key=`${attemptToken}:${paymentMode}:${input.reason}`,previous=state.checkoutBlocks[key];
  if(previous&&!previous.resolvedAt&&now-Number(previous.lastAt||0)<=CHECKOUT_BLOCK_DEDUPE_SECONDS){previous.lastAt=now;previous.repeatCount=Number(previous.repeatCount||1)+1;return previous}
  const record={id:crypto.randomUUID(),attemptToken,stage:input.stage,reason:input.reason,paymentMode,itemCount,createdAt:now,lastAt:now,repeatCount:1,resolvedAt:null};state.checkoutBlocks[key]=record;return record;
}

export function resolveCheckoutBlocks(state,{attemptToken,now=Math.floor(Date.now()/1000)}={}){if(!/^[a-f0-9]{24}$/.test(String(attemptToken||"")))return 0;prune(state,now);let count=0;for(const item of Object.values(ensure(state)))if(item.attemptToken===attemptToken&&!item.resolvedAt){item.resolvedAt=now;count++}return count}

export function checkoutBlockList(state,now=Math.floor(Date.now()/1000)){prune(state,now);return Object.values(ensure(state)).sort((a,b)=>Number(b.lastAt)-Number(a.lastAt)).map(({id,stage,reason,paymentMode,itemCount,createdAt,lastAt,repeatCount,resolvedAt})=>({id,stage,reason,paymentMode,itemCount,createdAt,lastAt,repeatCount,resolvedAt,status:resolvedAt?"resolved":"blocked"}))}
