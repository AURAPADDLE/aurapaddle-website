import {ensureRecoveryInbox,sendAgentMailMessage} from "./recovery-email.mjs";

const money=(amount,currency="AUD")=>{const code=String(currency||"AUD").toUpperCase(),value=new Intl.NumberFormat("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(amount||0)/100);return code==="AUD"?`AUD $${value}`:`${code} ${value}`};
const escapeHtml=value=>String(value||"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const firstName=name=>String(name||"").trim().split(/\s+/)[0]||"there";

function orderDetails(entry,catalog){
  return (entry.items||[]).map(item=>{
    const variant=catalog.bySku.get(item.sku);
    return {
      sku:item.sku,
      quantity:Number(item.quantity||1),
      name:variant?.productName||item.sku,
      size:variant?.size||"",
      colour:variant?.colour||"",
      estimatedDispatch:variant?.campaign?.estimatedDelivery||""
    };
  });
}

function shippingCopy(entry){
  if(entry.shippingQuoteRequired)return `${entry.shippingLabel||"Selected delivery region"} — shipping will be confirmed by AURA PADDLE before dispatch.`;
  if(Number(entry.shippingAmount||0)===0)return `${entry.shippingLabel||"Local pickup"} — free.`;
  return `${entry.shippingLabel||"Selected delivery region"} — ${money(entry.shippingAmount,entry.currency)}, payable with the remaining product balance before dispatch.`;
}

function dispatchCopy(details){
  const dates=[...new Set(details.map(item=>item.estimatedDispatch).filter(Boolean))];
  return dates.length?dates.join("; "):"Shown on the applicable product page and confirmed in order updates.";
}

function itemText(details){
  return details.map(item=>`• ${item.name}${item.size?` · ${item.size}`:""}${item.colour?` · ${item.colour}`:""} · ${item.sku} × ${item.quantity}`);
}

function itemHtml(details){
  return details.map(item=>`<li style="margin:7px 0"><strong>${escapeHtml(item.name)}</strong>${item.size?` · ${escapeHtml(item.size)}`:""}${item.colour?` · ${escapeHtml(item.colour)}`:""}<br><span style="color:#647982">${escapeHtml(item.sku)} × ${item.quantity}</span></li>`).join("");
}

function emailFrame(title,body){
  return `<!doctype html><html><body style="margin:0;background:#f3f7f8;font-family:Arial,sans-serif;color:#122936"><div style="max-width:620px;margin:0 auto;padding:32px 20px"><div style="background:#102b38;color:#fff;padding:22px 28px;font-size:20px;letter-spacing:2px;font-weight:700">AURA PADDLE</div><div style="background:#fff;padding:30px 28px"><h1 style="font-size:27px;line-height:1.2;margin:0 0 18px">${escapeHtml(title)}</h1>${body}</div><div style="padding:20px 28px;font-size:12px;line-height:1.6;color:#647982">Aura Paddle Pty Ltd · ABN 46 697 865 759 · Australia<br>Questions? Reply to this email or contact <a href="mailto:admin@aurapaddle.com" style="color:#647982">admin@aurapaddle.com</a>.</div></div></body></html>`;
}

export function customerOrderEmailContent(entry,{catalog,siteUrl}){
  const details=orderDetails(entry,catalog),statusUrl=new URL(`/order/?order=${encodeURIComponent(entry.orderNumber)}&token=${encodeURIComponent(entry.trackingToken)}`,siteUrl).toString();
  const remaining=entry.paymentStage==="initial_50_percent"?Number(entry.amountTotal||0):0,dispatch=dispatchCopy(details),shipping=shippingCopy(entry);
  const subject=`Order confirmed — ${entry.orderNumber} | AURA PADDLE`;
  const text=[`Hi ${firstName(entry.customerName)},`,"",`Your initial payment for AURA PADDLE order ${entry.orderNumber} has been received and your order is confirmed.`,"",...itemText(details),"",`Initial payment received: ${money(entry.amountTotal,entry.currency)}`,`Remaining product balance: ${money(remaining,entry.currency)}`,`Delivery: ${shipping}`,`Estimated dispatch: ${dispatch}`,"","View your secure order status:",statusUrl,"","The remaining product balance and confirmed shipping charge are payable before dispatch. For change-of-mind cancellation, email us within 48 hours of the initial payment. Australian Consumer Law rights are not limited.","","Aura Paddle Pty Ltd · ABN 46 697 865 759 · Australia"].join("\n");
  const body=`<p>Hi ${escapeHtml(firstName(entry.customerName))},</p><p>Your initial payment has been received and your order is confirmed.</p><div style="background:#eef5f5;padding:18px 20px;border-radius:8px;margin:22px 0"><strong>${escapeHtml(entry.orderNumber)}</strong><ul style="padding-left:22px;margin:12px 0">${itemHtml(details)}</ul><p style="margin:8px 0"><strong>Initial payment received:</strong> ${escapeHtml(money(entry.amountTotal,entry.currency))}</p><p style="margin:8px 0"><strong>Remaining product balance:</strong> ${escapeHtml(money(remaining,entry.currency))}</p><p style="margin:8px 0"><strong>Delivery:</strong> ${escapeHtml(shipping)}</p><p style="margin:8px 0"><strong>Estimated dispatch:</strong> ${escapeHtml(dispatch)}</p></div><p style="margin:26px 0"><a href="${escapeHtml(statusUrl)}" style="display:inline-block;background:#f15b45;color:#fff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:700">View order status</a></p><p style="font-size:14px;line-height:1.6;color:#526771">The remaining product balance and confirmed shipping charge are payable before dispatch. For change-of-mind cancellation, email us within 48 hours of the initial payment. Australian Consumer Law rights are not limited.</p>`;
  return {subject,text,html:emailFrame(`Order ${entry.orderNumber} confirmed`,body)};
}

export function adminOrderEmailContent(entry,{catalog,siteUrl}){
  const details=orderDetails(entry,catalog),statusUrl=new URL(`/order/?order=${encodeURIComponent(entry.orderNumber)}&token=${encodeURIComponent(entry.trackingToken)}`,siteUrl).toString();
  const remaining=entry.paymentStage==="initial_50_percent"?Number(entry.amountTotal||0):0,dispatch=dispatchCopy(details),shipping=shippingCopy(entry);
  const stripeUrl=entry.paymentIntentId?`https://dashboard.stripe.com/payments/${encodeURIComponent(entry.paymentIntentId)}`:"https://dashboard.stripe.com/payments";
  const subject=`New order ${entry.orderNumber} — ${money(entry.amountTotal,entry.currency)} received`;
  const text=["New paid AURA PADDLE order", "",`Order: ${entry.orderNumber}`,`Customer: ${entry.customerName||"Not provided"}`,`Email: ${entry.customerEmail||"Not provided"}`,`Phone: ${entry.customerPhone||"Not provided"}`,"",...itemText(details),"",`Initial payment: ${money(entry.amountTotal,entry.currency)}`,`Remaining product balance: ${money(remaining,entry.currency)}`,`Delivery: ${shipping}`,`Estimated dispatch: ${dispatch}`,"",`Order status: ${statusUrl}`,`Stripe payment: ${stripeUrl}`].join("\n");
  const body=`<div style="background:#eef5f5;padding:18px 20px;border-radius:8px;margin:0 0 22px"><p style="margin:6px 0"><strong>Customer:</strong> ${escapeHtml(entry.customerName||"Not provided")}</p><p style="margin:6px 0"><strong>Email:</strong> ${escapeHtml(entry.customerEmail||"Not provided")}</p><p style="margin:6px 0"><strong>Phone:</strong> ${escapeHtml(entry.customerPhone||"Not provided")}</p></div><ul style="padding-left:22px">${itemHtml(details)}</ul><p><strong>Initial payment received:</strong> ${escapeHtml(money(entry.amountTotal,entry.currency))}</p><p><strong>Remaining product balance:</strong> ${escapeHtml(money(remaining,entry.currency))}</p><p><strong>Delivery:</strong> ${escapeHtml(shipping)}</p><p><strong>Estimated dispatch:</strong> ${escapeHtml(dispatch)}</p><p style="margin:26px 0"><a href="${escapeHtml(stripeUrl)}" style="display:inline-block;background:#102b38;color:#fff;text-decoration:none;padding:13px 20px;border-radius:6px;font-weight:700;margin-right:8px">Open Stripe payment</a> <a href="${escapeHtml(statusUrl)}" style="display:inline-block;color:#102b38;text-decoration:none;padding:12px 18px;border:1px solid #b8c7cc;border-radius:6px;font-weight:700">View order status</a></p>`;
  return {subject,text,html:emailFrame(`New order ${entry.orderNumber}`,body)};
}

export async function sendOrderEmail(entry,{apiKey,catalog,siteUrl}){
  const inbox=await ensureRecoveryInbox(apiKey);
  const content=entry.kind==="admin_notification"?adminOrderEmailContent(entry,{catalog,siteUrl}):customerOrderEmailContent(entry,{catalog,siteUrl});
  return sendAgentMailMessage(apiKey,inbox.inbox_id,{idempotencyKey:`aura-order-${entry.sessionId}-${entry.kind}`,body:{to:[entry.recipient],reply_to:["admin@aurapaddle.com"],subject:content.subject,text:content.text,html:content.html,labels:[entry.kind]}});
}
