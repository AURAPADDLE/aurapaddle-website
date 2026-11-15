const clean=(value,limit=100)=>String(value||"").replace(/[^a-zA-Z0-9_.:-]/g,"-").slice(0,limit);

// Intentionally dependency-injected and not wired into server.mjs. The caller must
// provide a Stripe client already authenticated to the approved isolated sandbox.
export function createStripeSandboxAdapter({client,successUrl="http://127.0.0.1:4242/success",cancelUrl="http://127.0.0.1:4242/cancel"}={}){
  if(!client?.checkout?.sessions?.create||!client?.checkout?.sessions?.retrieve)throw Error("An authenticated sandbox Stripe client is required.");
  return {
    async createCheckoutSession(request){
      if(String(request.currency||"").toLowerCase()!=="aud")throw Error("Sandbox fixture only permits AUD.");
      const groups=Array.isArray(request.groups)?request.groups:[];
      if(groups.length<2||groups.some(group=>!Number.isSafeInteger(group.amount)||group.amount<=0))throw Error("A valid mixed-cart group breakdown is required.");
      if(groups.reduce((sum,group)=>sum+group.amount,0)!==request.amountTotal)throw Error("Group amounts must equal the combined amount due today.");
      const params={
        mode:"payment",
        success_url:successUrl,
        cancel_url:cancelUrl,
        client_reference_id:clean(request.metadata?.aura_parent_order),
        integration_identifier:"aura_combined_sandbox_qa_qmtzplrx",
        line_items:groups.map((group,index)=>({
          quantity:1,
          price_data:{
            currency:"aud",
            unit_amount:group.amount,
            product_data:{name:`AURA synthetic mixed-cart group ${index+1}`,metadata:{aura_group:clean(group.id)}}
          }
        })),
        metadata:{
          aura_combined_request:clean(request.metadata?.aura_combined_request),
          aura_parent_order:clean(request.metadata?.aura_parent_order),
          aura_environment:"isolated_sandbox",
          aura_synthetic:"true"
        },
        payment_intent_data:{metadata:{aura_synthetic:"true"}},
        allow_promotion_codes:false,
        customer_creation:"if_required",
        expires_at:Math.floor(Date.now()/1000)+1800,
        after_expiration:{recovery:{enabled:false}}
      };
      // No customer/customer_email/receipt_email or payment-method allowlist is sent.
      return client.checkout.sessions.create(params,{idempotencyKey:request.idempotencyKey});
    },
    retrieveCheckoutSession(id){return client.checkout.sessions.retrieve(String(id||""))}
  };
}
