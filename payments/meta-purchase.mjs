import crypto from "node:crypto";

const receiptLifetime=10*60;
const tokenHash=value=>crypto.createHash("sha256").update(String(value||"")).digest("hex");
const safeEqual=(left,right)=>{const a=Buffer.from(String(left||"")),b=Buffer.from(String(right||""));return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b)};

export function verifiedMetaPurchase(state,sessionId){
  if(!/^cs_(test|live)_[A-Za-z0-9]+$/.test(String(sessionId||"")))return null;
  const order=state.orders?.[sessionId];
  if(!order||order.initialPaymentStatus!=="paid"||(order.attribution?.consent?.marketing!==true&&order.attribution?.metaMeasurement!==true))return null;
  if(String(order.currency||"").toLowerCase()!=="aud"||!Number.isInteger(order.amountTotal)||order.amountTotal<=0)return null;
  const items=(order.items||[]).map(item=>({sku:/^AP\d{6}$/.test(String(item.sku||""))?item.sku:"",quantity:Math.max(1,Math.min(20,Number(item.quantity)||1))})).filter(item=>item.sku);
  if(!items.length||!/^APO\d{5}$/.test(String(order.orderNumber||"")))return null;
  return {verified:true,eventId:crypto.createHash("sha256").update(`aura-meta-purchase:${order.orderNumber}`).digest("hex").slice(0,32),value:Number((order.amountTotal/100).toFixed(2)),currency:"AUD",items,metaChoice:order.attribution?.metaChoice||"none"};
}

export function issueMetaPurchaseReceipt(state,{sessionId,bindingToken,now=Math.floor(Date.now()/1000),randomBytes=crypto.randomBytes}={}){
  const purchase=verifiedMetaPurchase(state,sessionId),order=state.orders?.[sessionId];
  if(!purchase||!order?.metaCheckoutBindingHash||!safeEqual(order.metaCheckoutBindingHash,tokenHash(bindingToken)))return null;
  state.metaPurchaseReceipts??={};
  for(const [key,value] of Object.entries(state.metaPurchaseReceipts))if(Number(value.expiresAt||0)<=now||value.redeemedAt)delete state.metaPurchaseReceipts[key];
  const receipt=randomBytes(32).toString("base64url"),hash=tokenHash(receipt);
  state.metaPurchaseReceipts[hash]={sessionId,createdAt:now,expiresAt:now+receiptLifetime};
  return {receipt,expiresIn:receiptLifetime};
}

export function redeemMetaPurchaseReceipt(state,{receipt,now=Math.floor(Date.now()/1000)}={}){
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(String(receipt||"")))return null;
  state.metaPurchaseReceipts??={};
  const key=tokenHash(receipt),entry=state.metaPurchaseReceipts[key];
  if(!entry||entry.redeemedAt||Number(entry.expiresAt||0)<=now)return null;
  const purchase=verifiedMetaPurchase(state,entry.sessionId);if(!purchase)return null;
  entry.redeemedAt=now;return purchase;
}
