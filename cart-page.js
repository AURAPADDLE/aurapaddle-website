(()=>{
  const cartImageStyle=document.createElement("style");
  cartImageStyle.textContent=".cart-image img{width:auto!important;height:auto!important;max-width:calc(100% - 12px)!important;max-height:calc(100% - 12px)!important;object-fit:contain!important;object-position:center!important}";
  document.head.append(cartImageStyle);

  const cart=window.AURACart;
  const config=window.AURA_STRIPE||{};
  let checkoutPending=false;
  let checkoutRedirected=false;
  const list=document.getElementById("cartList");
  const summary=document.getElementById("cartSummary");
  const empty=document.getElementById("emptyCart");
  const checkout=document.getElementById("checkoutCart");
  const checkoutLabel=checkout.textContent;
  const error=document.getElementById("checkoutError");
  const regionSelect=document.getElementById("shippingRegion");
  const legacyRegionOption=regionSelect.querySelector('option[value="canberra-melbourne"]');
  if(legacyRegionOption)legacyRegionOption.remove();
  const mergedRegionOption=regionSelect.querySelector('option[value="qld-nsw-main"]');
  if(mergedRegionOption)mergedRegionOption.textContent="QLD / NSW / ACT major cities, coastal areas & Melbourne Metro";
  const recoveryEmailConsent=document.getElementById("recoveryEmailConsent");
  const checkoutEmail=document.createElement("input");
  checkoutEmail.id="checkoutEmail";
  checkoutEmail.name="email";
  checkoutEmail.type="email";
  checkoutEmail.autocomplete="email";
  checkoutEmail.inputMode="email";
  checkoutEmail.maxLength=254;
  checkoutEmail.placeholder="name@example.com";
  checkoutEmail.required=true;
  checkoutEmail.setAttribute("aria-describedby","checkoutEmailHelp");
  const checkoutEmailBlock=document.createElement("div");
  checkoutEmailBlock.className="checkout-email";
  checkoutEmailBlock.innerHTML='<label for="checkoutEmail">Email address</label><p id="checkoutEmailHelp">Used for your payment receipt, order updates and secure checkout recovery.</p>';
  checkoutEmailBlock.querySelector("label").after(checkoutEmail);
  recoveryEmailConsent?.closest(".recovery-consent")?.before(checkoutEmailBlock);
  const recoveryCopy=document.querySelector(".recovery-consent-copy");
  if(recoveryCopy)recoveryCopy.textContent="If I don’t finish payment, email me one secure link to continue checkout.";
  if(recoveryEmailConsent){
    recoveryEmailConsent.defaultChecked=true;
    recoveryEmailConsent.checked=true;
  }
  const regionStorageKey="aura-shipping-region-v1";
  const totalRow=document.createElement("div");totalRow.className="summary-row order-total";totalRow.innerHTML='<span>Total including shipping</span><strong id="orderTotal">Select region</strong>';
  document.getElementById("beforeDispatch").parentElement.after(totalRow);
  const promoBlock=document.createElement("div");
  promoBlock.className="promo-code";
  promoBlock.innerHTML='<label for="promoCode">Promo code</label><div class="promo-code-controls"><input id="promoCode" name="promoCode" autocomplete="off" maxlength="32" placeholder="Enter promo code"><button id="applyPromoCode" type="button">Apply</button></div><p id="promoHelp">Yoga Cruiser Glacier Blue: use YOGAFREESHIP for eligible free shipping through 26 September.</p>';
  document.querySelector(".shipping-choice").after(promoBlock);
  const promoInput=document.getElementById("promoCode"),applyPromoButton=document.getElementById("applyPromoCode"),promoHelp=document.getElementById("promoHelp");
  let appliedPromoCode="";
  const regions={
    "local-pickup":{label:"Local pickup — Gold Coast, QLD",isup:0,yogaCruiser:0,surfboard:0},
    "gold-coast-brisbane":{label:"Gold Coast / Brisbane Metro",isup:4900,yogaCruiser:2500,surfboard:7900},
    "qld-nsw-main":{label:"QLD / NSW / ACT major cities, coastal areas & Melbourne Metro",isup:9900,yogaCruiser:4500,surfboard:14900},
    "canberra-melbourne":{aliasTo:"qld-nsw-main"},
    adelaide:{label:"Adelaide Metro",isup:12900,yogaCruiser:12900,surfboard:17900},
    perth:{label:"Perth Metro",isup:17900,yogaCruiser:17900,surfboard:22900},
    tasmania:{label:"Tasmania",isup:14900,yogaCruiser:14900,surfboard:22900},
    remote:{label:"NT, regional, remote and island destinations",quoteRequired:true}
  };
  const isupSlugs=new Set(["yoga-cruiser","angler-fishing","touring-performance","coast-go"]);
  const surfboardSlugs=new Set(["gannet","current","meridian"]);
  const yogaLaunchPromotion={code:"YOGAFREESHIP",sku:"AP734955",startsAt:Date.parse("2026-09-20T00:00:00+10:00"),endsAt:Date.parse("2026-09-27T00:00:00+10:00"),regionIds:new Set(["gold-coast-brisbane","qld-nsw-main"])};

  document.querySelector(".intro").textContent="Review each SKU, quantity, delivery region and payment amount before continuing to Stripe’s secure checkout.";
  empty.querySelector("p").textContent="Choose a board to start your order.";
  const money=cents=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD",minimumFractionDigits:cents%100?2:0,maximumFractionDigits:cents%100?2:0}).format(cents/100);
  const escape=value=>String(value).replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const analyticsItem=(item,price=Number(item.unitAmount||0)/100)=>({item_id:item.sku,item_name:item.productName,item_brand:"AURA PADDLE",item_category:item.sku==="AP667703"?"Accessory":item.shortName,item_variant:[item.size,item.colour].filter(Boolean).join(" · "),price,quantity:Number(item.quantity||1)});
  const track=(eventName,parameters)=>{
    const send=()=>window.AURAAnalytics?.event(eventName,parameters);
    if(window.AURAAnalytics)send();else window.addEventListener("aura:analytics-ready",send,{once:true});
  };

  function bundlePricing(items){
    const anglerQuantity=items.filter(item=>item.shortName==="Angler Fishing").reduce((sum,item)=>sum+item.quantity,0);
    const rack=items.find(item=>item.sku==="AP667703");
    const paired=Math.min(anglerQuantity,rack?.quantity||0);
    return {paired,lineTotal:item=>item.sku!=="AP667703"?item.unitAmount*item.quantity:paired*6900+(item.quantity-paired)*12900};
  }

  function slugFor(item){
    return String(item.productUrl||"").match(/products\/([^/?]+)\.html/)?.[1]||"";
  }

  function shippingFor(items,regionId,promoCode=appliedPromoCode){
    const requestedRegion=regions[regionId];
    const resolvedRegionId=requestedRegion?.aliasTo||regionId;
    const region=regions[resolvedRegionId];
    if(!region)return {selected:false,total:null,quoteRequired:false};
    if(resolvedRegionId==="local-pickup")return {selected:true,total:0,quoteRequired:false,label:region.label,pickup:true,regionId:resolvedRegionId};
    if(region.quoteRequired)return {selected:true,total:null,quoteRequired:true,label:region.label};
    const hasAngler=items.some(item=>slugFor(item)==="angler-fishing");
    let total=0,surfboardQuantity=0,quoteRequired=false,promotionApplied=false;
    for(const item of items){
      const slug=slugFor(item);
      if(item.sku==="AP667703"){
        if(!hasAngler)quoteRequired=true;
        continue;
      }
      const promotionActive=item.sku===yogaLaunchPromotion.sku&&String(promoCode||"").trim().toUpperCase()===yogaLaunchPromotion.code&&yogaLaunchPromotion.regionIds.has(resolvedRegionId)&&Date.now()>=yogaLaunchPromotion.startsAt&&Date.now()<yogaLaunchPromotion.endsAt;
      if(promotionActive)promotionApplied=true;
      else if(slug==="yoga-cruiser")total+=region.yogaCruiser*item.quantity;
      else if(isupSlugs.has(slug))total+=region.isup*item.quantity;
      else if(surfboardSlugs.has(slug)){
        surfboardQuantity+=item.quantity;
        total+=region.surfboard*item.quantity;
        if(/^9['’]/.test(item.size))total+=5000*item.quantity;
      }else quoteRequired=true;
    }
    if(surfboardQuantity>1)quoteRequired=true;
    return {selected:true,total:quoteRequired?null:total,quoteRequired,label:region.label,promotionApplied,regionId:resolvedRegionId};
  }

  function render(){
    const items=cart.read();
    const hasPreorder=items.some(item=>item.orderMode==="preorder");
    const hasAvailable=items.some(item=>item.orderMode==="available");
    const pricing=bundlePricing(items);
    const shipping=shippingFor(items,regionSelect.value);
    list.hidden=!items.length;
    summary.hidden=!items.length;
    empty.hidden=Boolean(items.length);
    empty.style.display=items.length?"none":"grid";
    list.innerHTML=items.map(item=>`<article class="cart-item" data-sku="${item.sku}"><a class="cart-image" href="${escape(item.productUrl)}">${item.image?`<img src="${escape(item.image)}" alt="${escape(item.productName)} — ${escape(item.colour)}">`:`<span>AURA PADDLE<br>${escape(item.shortName)}</span>`}</a><div><h2><a href="${escape(item.productUrl)}">${escape(item.productName)}</a></h2><div class="variant">${escape(item.size)} · ${escape(item.colour)} · ${item.sku}</div><span class="mode ${item.orderMode}">${item.orderMode==="preorder"?"Pre-order":"Available now"}</span>${item.sku==="AP667703"&&pricing.paired?`<p class="campaign">Bundle applied · ${pricing.paired} rack${pricing.paired===1?"":"s"} at AUD $69 with Angler Fishing</p>`:item.orderMode==="preorder"&&item.campaign?`<p class="campaign">${item.campaign.thresholdRequired===false?`Confirmed production · no minimum · estimated dispatch ${escape(item.campaign.estimatedDelivery)}`:`${escape(item.campaign.name)} · target ${item.campaign.target} · closes ${escape(item.campaign.deadline)}`}</p>`:""}</div><div class="item-controls"><strong class="line-price">${money(pricing.lineTotal(item))}</strong><span class="each-price">${item.sku==="AP667703"?(pricing.paired?`AUD $34.50 due today · AUD $69 bundle price`:`AUD $64.50 due today · AUD $129 pre-order price`):item.orderMode==="preorder"?`${money(item.unitAmount/2)} due today per board`:`${money(item.unitAmount)} each`}</span><div class="qty"><button type="button" data-action="down" aria-label="Decrease ${escape(item.shortName)} quantity">−</button><span>${item.quantity}</span><button type="button" data-action="up" aria-label="Increase ${escape(item.shortName)} quantity">+</button></div><button class="remove" type="button" data-action="remove">Remove</button></div></article>`).join("");
    const dueProducts=items.reduce((sum,item)=>sum+(item.orderMode==="preorder"?pricing.lineTotal(item)/2:pricing.lineTotal(item)),0);
    const remaining=items.reduce((sum,item)=>sum+(item.orderMode==="preorder"?pricing.lineTotal(item)/2:0),0);
    const subtotal=items.reduce((sum,item)=>sum+pricing.lineTotal(item),0);
    const availableOnly=hasAvailable&&!hasPreorder;
    const dueToday=dueProducts+(availableOnly&&shipping.selected&&!shipping.quoteRequired?Number(shipping.total||0):0);
    document.getElementById("subtotal").previousElementSibling.textContent="Product total";
    document.getElementById("beforeDispatch").previousElementSibling.textContent=availableOnly?"Payment after today":"Total due before dispatch";
    document.getElementById("mixedNotice").textContent="In-stock and pre-order items have different payment and dispatch schedules. Please place separate orders to keep each payment and shipment clear.";
    document.getElementById("mixedNotice").nextElementSibling.textContent=availableOnly?"In-stock products and published shipping are paid in full today. Glacier Blue dispatches within 1 business day after successful payment; delivery transit time is additional. Quote-required regions must contact AURA PADDLE first.":"Pre-orders collect 50% of the product price today. Remaining product balance and shipping are paid before dispatch; conditional orders follow their published terms.";
    document.getElementById("itemCount").textContent=String(cart.count(items));
    document.getElementById("subtotal").textContent=money(subtotal);
    document.getElementById("orderTotal").textContent=!shipping.selected?`${money(subtotal)} + shipping`:shipping.quoteRequired?`${money(subtotal)} + freight quote`:money(subtotal+Number(shipping.total||0));
    document.getElementById("dueToday").textContent=money(dueToday);
    document.getElementById("remainingBalance").textContent=money(remaining);
    document.getElementById("mixedNotice").hidden=!(hasPreorder&&hasAvailable);
    const shippingAmount=document.getElementById("shippingAmount");
    const beforeDispatch=document.getElementById("beforeDispatch");
    const shippingHelp=document.getElementById("shippingHelp");
    if(!shipping.selected){
      shippingAmount.textContent="Select region";
      beforeDispatch.textContent="Select region";
      shippingHelp.textContent="Choose the region matching your delivery address.";
    }else if(shipping.pickup){
      shippingAmount.textContent="Free";
      beforeDispatch.textContent=availableOnly?"Paid today":money(remaining);
      shippingHelp.textContent="Gold Coast, QLD — exact pickup address provided after order confirmation.";
    }else if(shipping.quoteRequired){
      shippingAmount.textContent="Quote required";
      beforeDispatch.textContent=availableOnly?"Request freight quote":`${money(remaining)} + freight quote`;
      shippingHelp.innerHTML=availableOnly?'Please <a href="mailto:admin@aurapaddle.com?subject=Glacier%20Blue%20freight%20quote">contact AURA PADDLE for a freight quote</a> before payment and the dispatch window.':"AURA PADDLE will confirm the best available freight price before dispatch.";
    }else{
      shippingAmount.textContent=shipping.promotionApplied?"Free — promo applied":money(shipping.total);
      beforeDispatch.textContent=availableOnly?"Paid today":money(remaining+shipping.total);
      shippingHelp.textContent=shipping.promotionApplied?"YOGAFREESHIP applied. Free shipping ends 26 September 2026 for eligible regions.":availableOnly?"This shipping amount is included in today's secure payment.":"This shipping amount is recorded now and paid with the remaining product balance before dispatch.";
    }
    const promoValid=appliedPromoCode===yogaLaunchPromotion.code&&shipping.promotionApplied;
    promoHelp.className=promoValid?"success":appliedPromoCode?"error":"";
    promoHelp.textContent=promoValid?"YOGAFREESHIP applied — this order qualifies for free shipping.":appliedPromoCode?"YOGAFREESHIP is not available for the current product, region or date.":"Yoga Cruiser Glacier Blue: use YOGAFREESHIP for eligible free shipping through 26 September.";
    checkout.textContent=availableOnly?"PAY IN FULL SECURELY":"PAY 50% SECURELY";
    checkout.disabled=checkoutPending||location.protocol==="file:"||config.enabled===false||!shipping.selected||(hasPreorder&&hasAvailable)||(availableOnly&&shipping.quoteRequired);
    regionSelect.disabled=checkoutPending;
    checkoutEmail.disabled=checkoutPending;
    promoInput.disabled=checkoutPending;
    applyPromoButton.disabled=checkoutPending;
    if(recoveryEmailConsent)recoveryEmailConsent.disabled=checkoutPending;
    list.querySelectorAll("button").forEach(button=>{button.disabled=checkoutPending;});
    error.style.display="none";
  }

  list.addEventListener("click",event=>{
    if(checkoutPending)return;
    const button=event.target.closest("[data-action]");
    const row=event.target.closest("[data-sku]");
    if(!button||!row)return;
    const item=cart.read().find(entry=>entry.sku===row.dataset.sku);
    if(!item)return;
    const pricing=bundlePricing(cart.read()),unitPrice=pricing.lineTotal(item)/item.quantity/100;
    if(button.dataset.action==="remove"){
      track("remove_from_cart",{currency:"AUD",value:unitPrice*item.quantity,items:[analyticsItem(item,unitPrice)]});
      cart.remove(item.sku);
    }else{
      const previousQuantity=item.quantity,nextQuantity=Math.max(1,Math.min(20,item.quantity+(button.dataset.action==="up"?1:-1)));
      cart.update(item.sku,nextQuantity);
      if(nextQuantity!==previousQuantity)track("update_cart_quantity",{item_id:item.sku,item_name:item.productName,direction:nextQuantity>previousQuantity?"increase":"decrease",previous_quantity:previousQuantity,quantity:nextQuantity});
    }
    render();
  });

  try{const saved=sessionStorage.getItem(regionStorageKey),normalisedSaved=saved==="canberra-melbourne"?"qld-nsw-main":saved;regionSelect.value=regions[normalisedSaved]?normalisedSaved:"";if(saved!==normalisedSaved&&normalisedSaved)sessionStorage.setItem(regionStorageKey,normalisedSaved)}catch{regionSelect.value=""}
  regionSelect.addEventListener("change",()=>{
    try{if(regionSelect.value)sessionStorage.setItem(regionStorageKey,regionSelect.value);
    else sessionStorage.removeItem(regionStorageKey)}catch{}
    if(regionSelect.value){
      const shipping=shippingFor(cart.read(),regionSelect.value);
      track("select_shipping_region",{shipping_region:regionSelect.value,shipping_type:shipping.pickup?"pickup":shipping.quoteRequired?"quote_required":"published_rate"});
    }
    render();
  });

  applyPromoButton.addEventListener("click",()=>{
    const code=promoInput.value.trim().toUpperCase();
    if(!code){appliedPromoCode="";render();return}
    if(code!==yogaLaunchPromotion.code){appliedPromoCode="INVALID";promoHelp.className="error";promoHelp.textContent="Promo code not recognised.";return}
    appliedPromoCode=code;
    const shipping=shippingFor(cart.read(),regionSelect.value,appliedPromoCode);
    track("apply_promotion",{promotion_id:"yoga-glacier-launch-free-shipping",promotion_name:"Yoga Cruiser Glacier Blue free shipping",eligible:shipping.promotionApplied});
    render();
  });
  promoInput.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();applyPromoButton.click()}});

  checkout.addEventListener("click",async()=>{
    if(checkoutPending||checkout.disabled)return;
    const items=cart.read();
    if(!items.length)return;
    const customerEmail=checkoutEmail.value.trim().toLowerCase();
    if(!customerEmail||!checkoutEmail.checkValidity()){
      checkoutEmail.setCustomValidity(customerEmail?"Enter a valid email address.":"Enter your email address before continuing to secure payment.");
      checkoutEmail.reportValidity();
      checkoutEmail.focus();
      track("checkout_email_required",{checkout_stage:"cart"});
      return;
    }
    checkoutEmail.setCustomValidity("");
    const shippingRegion=regionSelect.value;
    const recoveryConsent=recoveryEmailConsent?.checked===true;
    const original=checkout.textContent;
    checkoutPending=true;
    render();
    checkout.textContent="Preparing secure checkout…";
    error.style.display="none";
    let response;
    try{
      const attribution=await window.AURAAttribution?.snapshot?.();
      const currentShipping=shippingFor(items,shippingRegion);
      response=await fetch(config.checkoutEndpoint||"/api/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:items.map(({sku,quantity})=>({sku,quantity})),shippingRegion,promoCode:currentShipping.promotionApplied?appliedPromoCode:"",returnPath:location.pathname,customerEmail,recoveryEmailConsent:recoveryConsent,requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`,attribution})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.url)throw new Error(payload.error||"Stripe Checkout could not be prepared.");
      const pricing=bundlePricing(items);
      const pricedItems=items.map(item=>{
        const fullLine=pricing.lineTotal(item),unitFull=fullLine/item.quantity/100;
        return analyticsItem(item,item.orderMode==="preorder"?unitFull/2:unitFull);
      });
      const dueToday=pricedItems.reduce((sum,item)=>sum+item.price*item.quantity,0);
      const shipping=shippingFor(items,shippingRegion);
      track("add_shipping_info",{currency:"AUD",value:dueToday,shipping_tier:shippingRegion,shipping:Number(shipping.total||0)/100,items:pricedItems});
      track("begin_checkout",{currency:"AUD",value:dueToday,items:pricedItems});
      checkoutRedirected=true;
      location.assign(payload.url);
    }catch(reason){
      checkoutRedirected=false;
      checkoutPending=false;
      render();
      track("checkout_error",{checkout_stage:"cart",error_code:window.AURATracking?.errorCode(response)||"request_failed"});
      error.textContent=`Checkout unavailable: ${reason.message||reason}`;
      error.style.display="block";
      checkout.textContent=original;
    }
  });

  cart.subscribe(render);
  // A cached Back navigation retains the disabled state from the Stripe redirect.
  window.addEventListener("pageshow",event=>{
    if(!event.persisted||!checkoutRedirected)return;
    checkoutRedirected=false;
    checkoutPending=false;
    checkout.textContent=checkoutLabel;
    render();
  });
  checkoutEmail.addEventListener("input",()=>checkoutEmail.setCustomValidity(""));
  render();
  const viewedItems=cart.read();
  if(viewedItems.length){
    const pricing=bundlePricing(viewedItems),items=viewedItems.map(item=>analyticsItem(item,pricing.lineTotal(item)/item.quantity/100));
    track("view_cart",{currency:"AUD",value:items.reduce((sum,item)=>sum+item.price*item.quantity,0),items});
  }
})();
