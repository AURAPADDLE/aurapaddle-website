(()=>{
  const data=JSON.parse(document.getElementById("product-data").textContent);
  const $=id=>document.getElementById(id);
  if(data.slug==="yoga-cruiser"){
    const galleryOverrides={
      sandstone:[
        "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_hero-01.webp",
        "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_deck-02.webp",
        "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_bottom-03.webp",
        "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_side-04.webp",
        "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_three-quarter-05.webp",
        "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_deck-detail-06.webp",
        "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_full-kit-07.jpg",
        "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_yoga-lifestyle-08.webp",
        "../assets/products/yoga-cruiser/matte-sandstone/AP505002_yoga-cruiser_11ft_matte-sandstone_colour-lineup-09.webp"
      ],
      coral:[
        "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_hero-01.webp",
        "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_deck-02.webp",
        "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_bottom-03.webp",
        "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_side-04.webp",
        "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_three-quarter-05.webp",
        "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_deck-detail-06.webp",
        "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_full-kit-07.jpg",
        "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_yoga-lifestyle-08.webp",
        "../assets/products/yoga-cruiser/coral-white/AP587273_yoga-cruiser_11ft_coral-white_colour-lineup-09.webp"
      ]
    };
    data.colours.forEach(option=>{if(galleryOverrides[option.key])option.images=galleryOverrides[option.key]});
  }
  let selectedSize=new URLSearchParams(location.search).get("size")||data.sizes[0];
  let selectedColour=new URLSearchParams(location.search).get("colour")||data.colours[0].key;
  let quantity=1;
  let checkoutInFlight=false;
  let shippingRates=null;
  const stripeConfig=window.AURA_STRIPE||{};
  const cart=window.AURACart;
  const companyAllocationByCampaign={
    "paddle-launch-batch-01":20,
    "gannet-launch-batch":5,
    "current-launch-batch":5,
    "meridian-launch-batch":5,
    "wayfinder-launch-batch":5
  };
  const surfSizeGuides={
    gannet:{weights:["Under 50 kg","50–60 kg","60–70 kg","70–80 kg","80–90 kg","90–100 kg","100–110 kg"],rows:[["6'0\"","5'8\"","5'8\""],["6'2\"","5'8\"","5'8\""],["6'2\"","5'8\"","5'8\""],["6'2\"","5'8\"","5'8\""],["6'6\"","6'0\"","5'8\""],["6'6\"","6'0\"","6'0\""],["6'6\"","6'2\"","6'0\""]]},
    current:{weights:["Under 50 kg","50–60 kg","60–70 kg","70–80 kg","80–90 kg","90–100 kg","100–110 kg"],rows:[["7'0\"","7'0\"","7'0\""],["7'0\"","7'0\"","7'0\""],["7'6\"","7'0\"","7'0\""],["7'6\"","7'6\"","7'0\""],["8'0\"","7'6\"","7'6\""],["8'0\"","8'0\"","7'6\""],["8'0\"","8'0\"","8'0\""]]},
    meridian:{weights:["Under 60 kg","60–70 kg","70–80 kg","80–90 kg","90–100 kg","100–110 kg"],rows:[["9'3\"","9'0\"","9'0\""],["9'3\"","9'0\"","9'0\""],["9'6\"","9'3\"","9'0\""],["9'6\"","9'3\"","9'3\""],["9'6\"","9'6\"","9'3\""],["9'6\"","9'6\"","9'6\""]]},
    wayfinder:{weights:["Under 45 kg","45–55 kg","55–65 kg","65–75 kg","75–85 kg","85–95 kg","95–110 kg"],rows:[["7'0\"","6'6\"","6'6\""],["7'0\"","6'6\"","6'6\""],["7'6\"","7'0\"","6'6\""],["8'0\"","7'6\"","7'0\""],["8'6\"","8'0\"","7'6\""],["9'0\"","8'6\"","8'0\""],["9'0\"","9'0\"","8'6\""]]}
  };
  if(!data.sizes.includes(selectedSize))selectedSize=data.sizes[0];
  if(!data.colours.some(c=>c.key===selectedColour))selectedColour=data.colours[0].key;

  function variant(){return data.variants.find(v=>v.size===selectedSize&&v.colourKey===selectedColour)||data.variants[0]}
  function colour(){return data.colours.find(c=>c.key===selectedColour)||data.colours[0]}
  function isPreorder(v=variant()){return v.orderMode==="preorder"}
  function numericPrice(v=variant()){return v.retailAUD?(isPreorder(v)?Number(v.retailAUD)-Number(v.preorder?.discountAUD||0):Number(v.retailAUD)):null}
  function displayPrice(v=variant()){const price=numericPrice(v);return price?`AUD $${price}`:data.price}
  function moneyFromCents(value){return value===0?"Free":`AUD $${(Number(value||0)/100).toFixed(0)}`}
  function committedCount(campaign={}){return Math.min(Number(campaign.target||0),Number(companyAllocationByCampaign[campaign.id]||0)+Number(campaign.reserved||0))}
  function cartItem(){
    const v=variant(),c=colour(),unit=numericPrice(v);
    return {sku:v.sku,productName:data.name,shortName:data.short,size:selectedSize,colour:c.name,colourKey:selectedColour,unitAmount:unit*100,retailAmount:Number(v.retailAUD||unit)*100,orderMode:v.orderMode,productUrl:`products/${data.slug}.html?size=${encodeURIComponent(selectedSize)}&colour=${encodeURIComponent(selectedColour)}`,campaign:v.preorder||null,image:(c.images||[])[0]?.replace(/^\.\.\//,"")||""};
  }
  function analyticsItem(item=cartItem(),itemQuantity=quantity){
    return {item_id:item.sku,item_name:item.productName,item_brand:"AURA PADDLE",item_category:data.category,item_variant:[item.size,item.colour].filter(Boolean).join(" · "),price:Number(item.unitAmount||0)/100,quantity:Number(itemQuantity||1)};
  }
  function track(eventName,parameters){
    const send=()=>window.AURAAnalytics?.event(eventName,parameters);
    if(window.AURAAnalytics)send();else window.addEventListener("aura:analytics-ready",send,{once:true});
  }
  function updateUrl(){const url=new URL(location.href);url.searchParams.set("size",selectedSize);url.searchParams.set("colour",selectedColour);history.replaceState({},"",url)}

  function renderGallery(){
    const c=colour(),images=c.images||[],main=$("mainImage"),strip=$("thumbStrip");
    if(images.length){
      strip.innerHTML=images.map((src,index)=>`<button class="thumb${index===0?" active":""}" type="button" data-image="${src}" aria-label="View image ${index+1}"><img src="${src}" alt="${data.name} — ${c.name}, view ${index+1}" width="96" height="96"></button>`).join("");
      main.innerHTML=`<img src="${images[0]}" alt="${data.name} — ${c.name}" width="900" height="900" fetchpriority="high">`;
      strip.querySelectorAll("button").forEach((btn,index)=>btn.addEventListener("click",()=>{strip.querySelectorAll("button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");main.innerHTML=`<img src="${btn.dataset.image}" alt="${data.name} — ${c.name}" width="900" height="900">`;track("view_item_image",{item_id:variant().sku,item_name:data.name,item_variant:[selectedSize,c.name].join(" · "),image_position:index+1})}));
    }else{
      strip.innerHTML=`<button class="thumb active" type="button" aria-label="Photography placeholder"><span class="thumb-placeholder" style="--thumb-bg:${c.swatch}">Photo<br>needed</span></button>`;
      main.innerHTML=`<div class="image-placeholder" style="--placeholder:${c.swatch}"><div class="placeholder-board"></div><strong>${c.name}</strong><span>${data.short} photography is reserved here. The final deck, bottom, detail and on-water images have not yet been supplied.</span></div>`;
    }
  }

  function renderSelection(){
    document.querySelectorAll("[data-size]").forEach(btn=>{const active=btn.dataset.size===selectedSize;btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active))});
    document.querySelectorAll("[data-colour]").forEach(btn=>{
      const active=btn.dataset.colour===selectedColour;
      btn.classList.toggle("active",active);btn.setAttribute("aria-pressed",String(active));
      const optionVariant=data.variants.find(v=>v.size===selectedSize&&v.colourKey===btn.dataset.colour),campaign=optionVariant?.preorder||{},target=campaign.target||1,reserved=committedCount(campaign),percent=Math.min(100,Math.round(reserved/target*100)),available=!!optionVariant?.available,threshold=campaign.thresholdRequired!==false,status=btn.querySelector(".colour-status"),progress=btn.querySelector(".colour-progress");
      if(status)status.textContent=available?"Available":threshold?`${campaign.scopeLabel} · ${reserved}/${target}`:"Confirmed pre-order · No minimum";
      if(progress){progress.hidden=available||!threshold;progress.setAttribute("aria-label",`${campaign.name||colour().name} committed production progress`);progress.setAttribute("aria-valuemax",String(target));progress.setAttribute("aria-valuenow",String(reserved));progress.firstElementChild.style.width=`${percent}%`}
    });
    $("selectedSize").textContent=selectedSize;$("selectedColour").textContent=colour().name;
    const v=variant();$("selectedSku").textContent=v.sku;$("selectedVariant").textContent=`${selectedSize} · ${colour().name}`;
    const reviewSku=document.querySelector('#reviewForm input[name="product_sku"]');if(reviewSku)reviewSku.value=v.sku;
    const selectedSpec=data.sizeGuide?.find(item=>item.size===selectedSize),dimensions=$("selectedDimensions"),volume=$("selectedVolume");
    if(selectedSpec&&dimensions&&volume){dimensions.textContent=`${selectedSpec.size} × ${selectedSpec.width} × ${selectedSpec.thickness}`;volume.textContent=selectedSpec.volume}
    document.querySelectorAll("[data-guide-size]").forEach(row=>row.classList.toggle("selected",row.dataset.guideSize===selectedSize));
    renderGallery();renderPreorder();renderActions();renderPurchaseClarity();updateUrl();
  }

  function enquiryUrl(){const v=variant();return `../redesign-preview.html?interest=${encodeURIComponent(`${data.name} — ${selectedSize} — ${colour().name} — ${v.sku}`)}#contact`}

  function shippingQuoteUrl(){
    const subject=encodeURIComponent(`Shipping quote — ${data.short} — ${variant().sku}`);
    const body=encodeURIComponent(`Hello AURA PADDLE,\n\nPlease confirm shipping for:\nProduct: ${data.name}\nSKU: ${variant().sku}\nSize / colour: ${selectedSize} / ${colour().name}\nQuantity: ${quantity}\nDelivery suburb and postcode: \n\nThank you.`);
    return `mailto:admin@aurapaddle.com?subject=${subject}&body=${body}`;
  }

  function productShippingClass(){
    if(!shippingRates)return null;
    return Object.entries(shippingRates.classes||{}).find(([,slugs])=>slugs.includes(data.slug))?.[0]||"quoteOnly";
  }

  function renderPurchaseClarity(){
    const panel=$("purchaseClarity");
    if(!panel)return;
    const v=variant(),campaign=v.preorder||{},preorder=isPreorder(v),price=numericPrice(v);
    $("clarityDueToday").textContent=price?`AUD $${(price*quantity*(preorder?0.5:1)).toFixed(2)}`:"Not charged — waitlist only";
    $("clarityBalance").textContent=price&&preorder?`AUD $${(price*quantity*.5).toFixed(2)} + shipping`:"Confirmed before payment";
    $("clarityDispatch").textContent=campaign.estimatedDelivery||"Confirmed after ordering";
    $("clarityCancellation").textContent=preorder?(campaign.thresholdRequired===false?"Full refund within 48 hours":"Full refund within 48 hours, or until production is confirmed"):"See returns policy";

    const select=$("shippingRegion"),result=$("shippingEstimate"),quote=$("shippingQuote");
    quote.href=shippingQuoteUrl();
    if(!shippingRates){result.textContent="Loading current delivery rates…";quote.hidden=true;return}
    if(!select.options.length){
      select.innerHTML=`<option value="">Choose delivery region</option>${shippingRates.regions.map(region=>`<option value="${region.id}">${region.label}</option>`).join("")}`;
    }
    const region=shippingRates.regions.find(item=>item.id===select.value),shippingClass=productShippingClass();
    if(!region){result.textContent="Choose a region to see the current GST-inclusive rate.";quote.hidden=true;return}
    const multiSurfboard=shippingClass==="surfboard"&&quantity>1;
    const quoteRequired=region.quoteRequired||shippingClass==="quoteOnly"||multiSurfboard;
    if(quoteRequired){
      const reason=multiSurfboard?"Orders with two or more hard surfboards are quoted for the complete consignment.":"This product or destination needs an individual freight quote.";
      result.innerHTML=`<strong>Quote required</strong><span>${reason}</span>`;
      quote.hidden=false;
      return;
    }
    let amount=Number(region[shippingClass]||0)*quantity;
    const lengthFeet=Number((selectedSize.match(/^(\d+)/)||[])[1]||0);
    if(shippingClass==="surfboard"&&lengthFeet>=9)amount+=Number(shippingRates.longboardSurcharge||0)*quantity;
    result.innerHTML=`<strong>${moneyFromCents(amount)} incl. GST</strong><span>${region.id==="local-pickup"?shippingRates.localPickupNote:"Recorded with your order and paid with the remaining balance before dispatch."}</span>`;
    quote.hidden=true;
  }

  function setupPurchaseClarity(){
    const priceNote=$("priceNote");
    if(!priceNote)return;
    const panel=document.createElement("section");
    panel.id="purchaseClarity";
    panel.className="purchase-clarity";
    panel.setAttribute("aria-labelledby","purchaseClarityTitle");
    panel.innerHTML=`<div class="clarity-heading"><div><p class="section-label">Before you pre-order</p><h2 id="purchaseClarityTitle">What you pay, when it ships, and how delivery works.</h2></div><a href="../preorder-preview.html">Full pre-order guide</a></div><dl class="clarity-facts"><div><dt>Due today</dt><dd id="clarityDueToday">—</dd></div><div><dt>Balance before dispatch</dt><dd id="clarityBalance">—</dd></div><div><dt>Estimated dispatch</dt><dd id="clarityDispatch">—</dd></div><div><dt>Cancellation</dt><dd id="clarityCancellation">—</dd></div></dl><div class="shipping-estimator"><label for="shippingRegion">Check shipping before checkout</label><select id="shippingRegion" aria-describedby="shippingEstimate"></select><div id="shippingEstimate" class="shipping-estimate" aria-live="polite">Loading current delivery rates…</div><a id="shippingQuote" class="btn btn-outline" href="mailto:admin@aurapaddle.com" hidden>Request a shipping quote</a><p>Australia only · Rates include GST · Free Gold Coast pickup is available.</p></div>`;
    priceNote.insertAdjacentElement("afterend",panel);
    $("shippingRegion").addEventListener("change",()=>{renderPurchaseClarity();track("view_shipping_rate",{item_id:variant().sku,item_name:data.name,shipping_region:$("shippingRegion").value,quantity})});
    fetch("../shipping-rates.json",{headers:{Accept:"application/json"}}).then(response=>response.ok?response.json():Promise.reject()).then(payload=>{shippingRates=payload;renderPurchaseClarity()}).catch(()=>{$("shippingEstimate").textContent="Current rates could not be loaded. Please request a shipping quote.";$("shippingQuote").hidden=false});
  }

  function renderPreorder(){
    const v=variant(),preorder=isPreorder(v),campaign=v.preorder||{},target=campaign.target||1,reserved=committedCount(campaign),percent=Math.min(100,Math.round(reserved/target*100)),threshold=campaign.thresholdRequired!==false,remaining=Math.max(0,target-reserved);
    $("availability").classList.toggle("is-preorder",preorder);
    document.querySelector("#availability .status-dot").classList.toggle("preorder",preorder);
    $("availabilityText").textContent=preorder?threshold?`Pre-order · ${campaign.scopeLabel} ${reserved}/${target}`:`Pre-order · Confirmed · ${campaign.scopeLabel}`:"Available now";
    $("productPrice").textContent=displayPrice(v);
    const showOriginal=preorder&&!!v.retailAUD;
    $("originalPrice").hidden=!showOriginal;$("originalPrice").textContent=showOriginal?`Standard AUD $${v.retailAUD}`:"";
    const item=campaign.itemLabel||"board";
    $("priceNote").textContent=preorder?(v.retailAUD?`Eligible ${item} offer · AUD $${campaign.discountAUD} incentive included · 50% due today (AUD $${(numericPrice(v)/2).toFixed(2)})`:`Eligible ${item}s receive an AUD $${campaign.discountAUD} pre-order incentive after the standard retail price is confirmed · 50% initial payment required`):"Australia-only range · Shipping calculated separately · See policy terms";
    $("preorderPanel").hidden=!preorder;
    let guideLink=$("preorderGuide");
    if(!guideLink){guideLink=document.createElement("a");guideLink.id="preorderGuide";guideLink.className="preorder-guide";guideLink.href="../preorder-preview.html";guideLink.textContent="Understand the complete pre-order process →";$("preorderCopy").insertAdjacentElement("afterend",guideLink)}
    guideLink.hidden=!preorder;
    if(!preorder)return;
    $("preorderKicker").textContent=campaign.name;$("preorderTitle").textContent=threshold&&companyAllocationByCampaign[campaign.id]?(remaining?`${remaining} more to production.`:"Production target reached."):campaign.title;$("preorderCount").hidden=!threshold;$("preorderCount").textContent=threshold?`${reserved} / ${target}`:"";
    $("preorderProgress").style.width=`${percent}%`;
    const track=$("preorderProgress").parentElement;track.hidden=!threshold;track.setAttribute("aria-label",`${campaign.name} committed production progress`);track.setAttribute("aria-valuemax",String(target));track.setAttribute("aria-valuenow",String(reserved));
    $("preorderDeadlineLabel").textContent=threshold?"Closing date":"Production condition";$("preorderDeadline").textContent=threshold?campaign.deadline:"No minimum quantity";$("preorderDelivery").textContent=campaign.estimatedDelivery;$("preorderDiscount").textContent=`AUD $${campaign.discountAUD} off each eligible ${item}`;$("preorderPayment").textContent=campaign.payment;
    $("preorderCopy").textContent=threshold?`${campaign.description} If the target is not reached by ${campaign.deadline}, all affected orders will be cancelled and fully refunded to their original payment method.`:campaign.description;
    const cancellation=threshold?" A change-of-mind cancellation receives a full refund if requested within 48 hours of the successful initial payment, or later while the order remains conditional and before AURA PADDLE confirms production in writing. Once production is confirmed or the order is placed with the manufacturer, change-of-mind cancellation is not available.":" As this is a confirmed pre-order with no minimum quantity, change-of-mind cancellation is available for a full refund only within 48 hours of the successful initial payment.";
    const productionTiming=`Once production is confirmed in writing, estimated dispatch is approximately six weeks later. The published date of ${campaign.estimatedDelivery} is the current estimate and may be updated as production and freight progress.`;
    const terms=$("preorderTermsBody");if(terms)terms.textContent=threshold?`${campaign.description} A 50% initial payment reserves the ${item} and counts it towards the target once successfully paid. The remaining 50%, together with the shipping amount selected in the cart or separately quoted where required, is requested through a secure payment link before dispatch. The campaign closes on ${campaign.deadline}. ${productionTiming} Each eligible pre-ordered ${item} receives an AUD $${campaign.discountAUD} incentive. If the target is not reached, affected orders will be cancelled and the initial payment fully refunded.${cancellation} Australian Consumer Law rights are not excluded.`:`${campaign.description} A 50% initial payment reserves the ${item}. The remaining 50%, together with the shipping amount selected in the cart or separately quoted where required, is requested through a secure payment link before dispatch. ${productionTiming} Each eligible pre-ordered ${item} receives an AUD $${campaign.discountAUD} incentive. This order does not depend on a production target.${cancellation} Australian Consumer Law rights are not excluded.`;
  }

  function renderActions(){
    const v=variant(),campaign=v.preorder||{};
    if(v.available){
      $("purchaseActions").innerHTML=`<button class="btn btn-dark" type="button" data-add-cart>Add to cart</button><button class="btn btn-coral" type="button" data-buy-now>Buy now — ${displayPrice(v)}</button>`;
    }else if(v.retailAUD){
      $("purchaseActions").innerHTML=`<button class="btn btn-dark" type="button" data-add-cart>Add pre-order to cart</button><button class="btn btn-coral" type="button" data-buy-now>Buy now — ${displayPrice(v)}</button><a class="btn btn-outline" href="${enquiryUrl()}">Ask about this pre-order</a>`;
    }else $("purchaseActions").innerHTML=`<a class="btn btn-dark" href="${enquiryUrl()}">Join the pre-order waitlist</a><a class="btn btn-outline" href="${enquiryUrl()}">Request confirmed price</a>`;
    $("purchaseActions").querySelector("[data-add-cart]")?.addEventListener("click",addToCart);
    $("purchaseActions").querySelector("[data-buy-now]")?.addEventListener("click",buyNow);
    $("stockCopy").textContent=v.available?data.stock:campaign.thresholdRequired===false?`Confirmed pre-order · Estimated dispatch ${campaign.estimatedDelivery}`:`${campaign.scopeLabel} · ${committedCount(campaign)}/${campaign.target} committed`;
  }

  function renderShippingSupport(){
    const heading=[...document.querySelectorAll(".detail-head")].find(button=>button.textContent.includes("Shipping and support"));
    const body=heading?.parentElement?.querySelector(".detail-body");
    if(body)body.innerHTML=`Choose your delivery region in the cart to see the published iSUP or hard-surfboard rate. Free local pickup is available in Gold Coast, QLD; the exact pickup address is provided after order confirmation. Regional, remote, island, multi-surfboard and other quote-required orders are confirmed individually. Shipping is paid with the remaining product balance before dispatch. See the <a href="../policy-preview.html#shipping">Shipping Policy</a>, <a href="../policy-preview.html#returns">Returns &amp; Refunds</a> and warranty conditions.`;
  }

  function setupSurfSizeFinder(){
    const guide=surfSizeGuides[data.slug],firstSelector=document.querySelector(".selector");
    if(!guide||!firstSelector)return;
    const wrap=document.createElement("div");
    wrap.className="size-finder-callout";
    wrap.innerHTML=`<div><p class="section-label">Not sure which size?</p><p>Use your weight and surfing level to find a starting recommendation.</p></div><button class="btn btn-outline" type="button">Open size guide</button>`;
    firstSelector.insertAdjacentElement("beforebegin",wrap);
    const dialog=document.createElement("dialog");
    dialog.className="size-finder-dialog";
    dialog.innerHTML=`<div class="modal"><div class="modal-top"><div><p class="eyebrow">AURA size finder</p><h2>Find your ${data.short} size.</h2></div><button class="modal-close size-finder-close" type="button" aria-label="Close size guide">×</button></div><form class="size-finder-form"><label><span>Rider weight</span><select name="weight" required><option value="">Choose weight</option>${guide.weights.map((label,index)=>`<option value="${index}">${label}</option>`).join("")}</select></label><label><span>Surfing level</span><select name="level" required><option value="">Choose level</option><option value="0">Beginner</option><option value="1">Intermediate</option><option value="2">Advanced</option></select></label><button class="btn btn-dark" type="submit">Recommend my size</button></form><div class="size-finder-result" aria-live="polite" hidden></div><p class="size-finder-disclaimer">This guide provides a starting recommendation only. Fitness, height, wave conditions and personal preference may affect your ideal size.</p></div>`;
    document.body.append(dialog);
    wrap.querySelector("button").addEventListener("click",()=>dialog.showModal());
    dialog.querySelector(".size-finder-close").addEventListener("click",()=>dialog.close());
    dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close()});
    dialog.querySelector("form").addEventListener("submit",event=>{
      event.preventDefault();
      const form=new FormData(event.currentTarget),weightIndex=Number(form.get("weight")),levelIndex=Number(form.get("level")),recommended=guide.rows[weightIndex]?.[levelIndex];
      if(!recommended)return;
      track("size_finder_complete",{item_name:data.name,weight_band:guide.weights[weightIndex],skill_level:["beginner","intermediate","advanced"][levelIndex],recommended_size:recommended});
      const result=dialog.querySelector(".size-finder-result");
      result.hidden=false;result.innerHTML=`<span>Recommended starting size</span><strong>${recommended}</strong><button class="btn btn-coral" type="button">Select this size</button>`;
      result.querySelector("button").addEventListener("click",()=>{if(data.sizes.includes(recommended)){selectedSize=recommended;renderSelection();track("size_finder_select",{item_id:variant().sku,item_name:data.name,recommended_size:recommended})}dialog.close();document.querySelector(".product-info")?.scrollIntoView({behavior:"smooth",block:"start"})});
    });
  }

  function addToCart(){
    if(!cart)return;
    const item=cartItem();
    cart.add(item,quantity);
    track("add_to_cart",{currency:"AUD",value:Number(item.unitAmount||0)*quantity/100,items:[analyticsItem(item)]});
    let toast=document.getElementById("cartToast");
    if(!toast){toast=document.createElement("div");toast.id="cartToast";toast.className="cart-toast";toast.setAttribute("role","status");document.body.append(toast)}
    toast.innerHTML=`<span><strong>${quantity} × ${data.short}</strong> added to your cart.</span><a href="../cart-preview.html">View cart</a>`;toast.classList.add("show");clearTimeout(addToCart.timer);addToCart.timer=setTimeout(()=>toast.classList.remove("show"),4500);
  }

  function buyNow(){
    if(!cart)return;
    const item=cartItem();
    cart.add(item,quantity);
    track("add_to_cart",{currency:"AUD",value:Number(item.unitAmount||0)*quantity/100,items:[analyticsItem(item)]});
    location.href="../cart-preview.html";
  }

  function addAccessory(sku){
    if(!cart)return;
    const item=(data.accessories||[]).find(accessory=>accessory.sku===sku);
    if(!item)return;
    const cartAccessory={sku:item.sku,productName:`AURA PADDLE ${item.name}`,shortName:item.name,size:"Accessory",colour:"White",colourKey:"white",unitAmount:Number(item.retailAUD)*100,retailAmount:Number(item.retailAUD)*100,orderMode:"preorder",productUrl:"products/angler-fishing.html",campaign:null,image:String(item.cartImage||item.image||"").replace(/^\.\.\//,"")};
    cart.add(cartAccessory,1);
    track("add_to_cart",{currency:"AUD",value:Number(cartAccessory.unitAmount||0)/100,items:[analyticsItem(cartAccessory,1)]});
    let toast=document.getElementById("cartToast");
    if(!toast){toast=document.createElement("div");toast.id="cartToast";toast.className="cart-toast";toast.setAttribute("role","status");document.body.append(toast)}
    toast.innerHTML=`<span><strong>${item.name}</strong> added. It will be AUD $${item.bundleAUD} when paired with an Angler Fishing board in this cart.</span><a href="../cart-preview.html">View cart</a>`;toast.classList.add("show");clearTimeout(addAccessory.timer);addAccessory.timer=setTimeout(()=>toast.classList.remove("show"),4500);
  }

  function openCheckout(){
    const v=variant(),preorder=isPreorder(v),campaign=v.preorder||{},unit=numericPrice(v),total=unit?unit*quantity:null;
    $("checkoutEyebrow").textContent=preorder?(campaign.thresholdRequired===false?"Confirmed pre-order · secure checkout":"Conditional pre-order · secure checkout"):"Secure Stripe checkout";
    $("checkoutTitle").textContent=preorder?"Review your 50% pre-order payment":"Review your order";
    $("checkoutSummary").textContent=`${data.name} · ${selectedSize} · ${colour().name} · ${v.sku} · Quantity ${quantity} · ${total?`AUD $${total} pre-order total · AUD $${preorder?(total/2).toFixed(2):total} due today`:displayPrice(v)}.`;
    const offline=location.protocol==="file:"||stripeConfig.enabled===false;
    const item=campaign.itemLabel||"board",items=item==="set"?"sets":"boards";
    $("checkoutStatus").innerHTML=offline?`<strong>Checkout scheduled:</strong> secure payments open after the production Stripe readiness gate is approved and the launch time is reached.`:preorder?(campaign.thresholdRequired===false?`<strong>Secure Stripe checkout:</strong> the pre-order price is AUD $${unit} per ${item} and today's 50% initial payment is AUD $${(total/2).toFixed(2)}. Production is confirmed with no minimum order condition. The remaining 50% and confirmed shipping are payable before dispatch.`:`<strong>Secure Stripe checkout:</strong> today's 50% initial payment is AUD $${(total/2).toFixed(2)}. Once paid, ${quantity===1?`this ${item}`:`these ${quantity} ${items}`} counts toward ${campaign.name}'s ${campaign.target}-${item} target. If the target is not reached, the initial payment is fully refunded. The remaining 50% and confirmed shipping are payable before dispatch.`):`<strong>Secure Stripe checkout:</strong> the checkout service validates ${v.sku} at AUD $${unit} per product before redirecting to Stripe.`;
    $("checkoutButton").disabled=offline||!unit;
    $("checkoutButton").textContent=preorder?"Pay 50% securely":"Continue to secure checkout";
    $("stripeDialog").showModal();
  }

  async function beginCheckout(){
    if(checkoutInFlight)return;
    const v=variant(),button=$("checkoutButton"),original=button.textContent;
    checkoutInFlight=true;button.disabled=true;button.textContent="Preparing secure checkout…";
    let response;
    try{
      const endpoint=stripeConfig.checkoutEndpoint||"/api/checkout";
      const requestId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const attribution=await window.AURAAttribution?.snapshot?.();
      response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sku:v.sku,quantity,returnPath:`${location.pathname}${location.search}`,requestId,attribution})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||!payload.url)throw new Error(payload.error||"Stripe Checkout could not be prepared.");
      const item=cartItem(),dueToday=isPreorder(v)?Number(item.unitAmount||0)/200:Number(item.unitAmount||0)/100;
      track("begin_checkout",{currency:"AUD",value:dueToday*quantity,items:[{...analyticsItem(item),price:dueToday}]});
      location.assign(payload.url);
    }catch(error){
      track("checkout_error",{checkout_stage:"product",error_code:window.AURATracking?.errorCode(response)||"request_failed",item_id:v.sku});
      $("checkoutStatus").innerHTML=`<strong>Checkout unavailable:</strong> ${String(error.message||error)} Please try again or contact AURA PADDLE.`;
      button.disabled=false;button.textContent=original;checkoutInFlight=false;
    }
  }

  async function refreshPreorderProgress(){
    if(location.protocol==="file:")return;
    try{
      const response=await fetch("/api/preorder-progress",{headers:{Accept:"application/json"}});
      if(!response.ok)return;
      const payload=await response.json(),campaigns=new Map((payload.campaigns||[]).map(item=>[item.id,item]));
      let changed=false;
      for(const item of data.variants){
        if(!item.preorder)continue;
        const live=campaigns.get(item.preorder.id);
        if(live&&Number(item.preorder.reserved||0)!==Number(live.reserved||0)){item.preorder.reserved=Number(live.reserved||0);changed=true}
      }
      if(changed)renderSelection();
    }catch{}
  }

  async function submitReview(event){
    event.preventDefault();
    const form=event.currentTarget,status=$("reviewStatus"),button=form.querySelector('button[type="submit"]'),original=button.textContent;
    const reviewData=new FormData(form);
    button.disabled=true;button.textContent="Submitting…";status.classList.remove("error");status.textContent="";
    let response;
    try{
      response=await fetch(form.action,{method:"POST",body:reviewData,headers:{Accept:"application/json"}});
      if(!response.ok)throw new Error("Your review could not be submitted.");
      track("submit_review",{item_id:variant().sku,item_name:data.name,rating:Number(reviewData.get("rating")||0)});
      form.reset();status.textContent="Thank you. Your review has been received and will be checked before publication.";
    }catch(error){
      track("form_submit_error",{form_type:"product_review",error_code:window.AURATracking?.errorCode(response)||"request_failed"});
      status.classList.add("error");status.textContent=`${String(error.message||error)} Please try again or email admin@aurapaddle.com.`;
    }finally{button.disabled=false;button.textContent=original}
  }

  document.querySelectorAll("[data-size]").forEach(btn=>btn.addEventListener("click",()=>{selectedSize=btn.dataset.size;renderSelection();track("select_product_option",{item_id:variant().sku,item_name:data.name,option_type:"size",option_value:selectedSize})}));
  document.querySelectorAll("[data-colour]").forEach(btn=>btn.addEventListener("click",()=>{selectedColour=btn.dataset.colour;renderSelection();track("select_product_option",{item_id:variant().sku,item_name:data.name,option_type:"colour",option_value:colour().name})}));
  $("qtyDown").addEventListener("click",()=>{const previous=quantity;$("quantity").textContent=quantity=Math.max(1,quantity-1);if(quantity!==previous){renderPurchaseClarity();track("change_item_quantity",{item_id:variant().sku,item_name:data.name,direction:"decrease",quantity})}});$("qtyUp").addEventListener("click",()=>{const previous=quantity;$("quantity").textContent=quantity=Math.min(20,quantity+1);if(quantity!==previous){renderPurchaseClarity();track("change_item_quantity",{item_id:variant().sku,item_name:data.name,direction:"increase",quantity})}});
  document.querySelectorAll(".detail-head").forEach(btn=>btn.addEventListener("click",()=>{const item=btn.parentElement,open=item.classList.toggle("open");btn.setAttribute("aria-expanded",String(open))}));
  document.querySelector(".modal-close").addEventListener("click",()=>$("stripeDialog").close());
  $("checkoutButton").addEventListener("click",beginCheckout);
  $("reviewForm")?.addEventListener("submit",submitReview);
  document.querySelectorAll("[data-add-accessory]").forEach(button=>button.addEventListener("click",()=>addAccessory(button.dataset.addAccessory)));
  const menuButton=$("menuButton"),mobileMenu=$("mobileMenu");menuButton.addEventListener("click",()=>{const open=mobileMenu.classList.toggle("open");menuButton.setAttribute("aria-expanded",String(open));document.body.classList.toggle("menu-open",open)});mobileMenu.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{mobileMenu.classList.remove("open");document.body.classList.remove("menu-open");menuButton.setAttribute("aria-expanded","false")}));
  renderShippingSupport();setupSurfSizeFinder();setupPurchaseClarity();renderSelection();refreshPreorderProgress();
  const viewedItem=cartItem();
  track("view_item",{currency:"AUD",value:Number(viewedItem.unitAmount||0)/100,items:[analyticsItem(viewedItem,1)]});
})();
