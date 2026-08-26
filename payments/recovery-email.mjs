const money=(amount,currency="AUD")=>new Intl.NumberFormat("en-AU",{style:"currency",currency:String(currency||"AUD").toUpperCase()}).format(Number(amount||0)/100);
const escapeHtml=value=>String(value||"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);

async function agentMailRequest(apiKey,path,{method="GET",body,idempotencyKey}={}){
  const response=await fetch(`https://api.agentmail.to${path}`,{method,headers:{Authorization:`Bearer ${apiKey}`,...(body?{"Content-Type":"application/json"}:{}),...(idempotencyKey?{"Idempotency-Key":idempotencyKey}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload?.message||payload?.detail||`AgentMail returned HTTP ${response.status}.`);
  return payload;
}

let inboxPromise;
export function ensureRecoveryInbox(apiKey){
  if(!inboxPromise)inboxPromise=agentMailRequest(apiKey,"/v0/inboxes",{method:"POST",body:{username:"aurapaddle-recovery-2026",display_name:"AURA PADDLE",client_id:"aura-paddle-checkout-recovery-v1",metadata:{purpose:"consented_checkout_recovery"}}}).catch(error=>{inboxPromise=null;throw error});
  return inboxPromise;
}

export function recoveryEmailContent(entry,{catalog,siteUrl}){
  const items=(entry.items||[]).map(item=>`${catalog.bySku.get(item.sku)?.productName||item.sku} × ${item.quantity}`),unsubscribeUrl=new URL(`/api/recovery/unsubscribe?token=${encodeURIComponent(entry.unsubscribeToken)}`,siteUrl).toString();
  const subject="Your AURA PADDLE checkout is ready when you are";
  const text=["Hi,","","You left items in your AURA PADDLE checkout:",...items.map(item=>`• ${item}`),`Total initial payment: ${money(entry.amountTotal,entry.currency)}`,"","If you would still like to complete your order, use this secure Stripe link:",entry.recoveryUrl,"","This recovery link is provided by Stripe and remains available for up to 30 days.","","Questions? Reply to this email or contact admin@aurapaddle.com.","","Aura Paddle Pty Ltd · ABN 46 697 865 759 · Australia",`Stop receiving checkout recovery emails: ${unsubscribeUrl}`].join("\n");
  const itemHtml=items.map(item=>`<li style="margin:6px 0">${escapeHtml(item)}</li>`).join("");
  const html=`<!doctype html><html><body style="margin:0;background:#f3f7f8;font-family:Arial,sans-serif;color:#122936"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="background:#102b38;color:#fff;padding:22px 28px;font-size:20px;letter-spacing:2px;font-weight:700">AURA PADDLE</div><div style="background:#fff;padding:30px 28px"><h1 style="font-size:26px;margin:0 0 18px">Your checkout is ready when you are</h1><p>Hi,</p><p>You left these items in your AURA PADDLE checkout:</p><ul style="padding-left:22px">${itemHtml}</ul><p><strong>Total initial payment: ${escapeHtml(money(entry.amountTotal,entry.currency))}</strong></p><p style="margin:26px 0"><a href="${escapeHtml(entry.recoveryUrl)}" style="display:inline-block;background:#f15b45;color:#fff;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:700">Return to secure checkout</a></p><p style="font-size:14px;color:#526771">This secure Stripe recovery link remains available for up to 30 days. If you no longer want the items, no action is required.</p><p>Questions? Reply to this email or contact <a href="mailto:admin@aurapaddle.com">admin@aurapaddle.com</a>.</p></div><div style="padding:20px 28px;font-size:12px;color:#647982">Aura Paddle Pty Ltd · ABN 46 697 865 759 · Australia<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#647982">Stop receiving checkout recovery emails</a></div></div></body></html>`;
  return {subject,text,html};
}

export async function sendRecoveryEmail(entry,{apiKey,catalog,siteUrl}){
  const inbox=await ensureRecoveryInbox(apiKey),content=recoveryEmailContent(entry,{catalog,siteUrl});
  return agentMailRequest(apiKey,`/v0/inboxes/${encodeURIComponent(inbox.inbox_id)}/messages/send`,{method:"POST",idempotencyKey:`aura-recovery-${entry.sessionId}`,body:{to:[entry.recipient],reply_to:["admin@aurapaddle.com"],subject:content.subject,text:content.text,html:content.html,labels:["checkout-recovery"]}});
}
