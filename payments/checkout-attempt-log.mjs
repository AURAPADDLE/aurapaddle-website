const stages=new Set(["received","blocked","stripe_requested","stripe_created","failed"]);
const reasons=new Set(["invalid_email","mixed_payment_modes","price_changed","invalid_address","manual_quote","region_mismatch","shipping_changed","invalid_promo","stock_unavailable","stripe_error","unexpected"]);

export function checkoutAttemptLog(input={},write=console.info){
  const stage=stages.has(input.stage)?input.stage:"failed";
  const reason=stage==="blocked"||stage==="failed"?(reasons.has(input.reason)?input.reason:"unexpected"):undefined;
  const entry={event:"aura_checkout_attempt",version:1,stage,paymentMode:input.paymentMode==="available"?"available":input.paymentMode==="preorder"?"preorder":"unknown",itemCount:Math.max(0,Math.min(50,Math.trunc(Number(input.itemCount)||0))),at:new Date(input.now||Date.now()).toISOString()};
  if(reason)entry.reason=reason;
  write(JSON.stringify(entry));
  return entry;
}
