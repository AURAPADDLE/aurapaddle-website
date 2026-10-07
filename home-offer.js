(()=>{
  const offer=document.getElementById("preorderOffer");
  if(!offer)return;
  let promotion={promotion_id:"yoga_glacier_free_shipping_202609",promotion_name:"Yoga Cruiser Glacier Blue free shipping",creative_slot:"homepage_modal"};
  const promotionStarts=Date.parse("2026-09-20T00:00:00+10:00");
  const promotionEnds=Date.parse("2026-09-30T00:00:00+10:00");
  let storageKey="aura-home-promo-yoga-glacier-202609";
  const coastEnds=Date.parse("2026-10-09T00:00:00+10:00");
  const shippingEnds=Date.parse(window.AURACoastGo.shippingEndsAt);
  let coastMode=false;
  let shippingMode=false;
  function refreshPromotion(){
    if(Date.now()>=promotionEnds&&!coastMode){
      coastMode=true;
      if(offer.open)offer.close();
      promotion={promotion_id:"coastgo_launch_extra10_202610",promotion_name:"CoastGo launch — extra AUD $10 off",creative_slot:"homepage_modal"};
      storageKey="aura-home-promo-coastgo-extra10-202610";
      offer.querySelector('.preorder-offer__eyebrow').textContent="CoastGo · Official release 8 October";
      offer.querySelector('#preorderOfferTitle').innerHTML="CoastGo<br><span>SAVE $10!</span>";
      offer.querySelector('.preorder-offer__price').innerHTML='New-product price AUD $299 <del>RRP AUD $349</del>';
      offer.querySelector('.preorder-offer__value').textContent="Order by 8 October. Extra $10 off each CoastGo.";
      offer.querySelector('[data-promo-code-copy]').hidden=false;
      offer.querySelector('[data-promo-code-copy]').style.display="";
      offer.querySelector('[data-promo-code-copy]').innerHTML='<strong>COASTGO10</strong><span>Automatically applied</span>';
      offer.querySelector('[data-promo-code-copy]').setAttribute("aria-label","Copy promo code COASTGO10");
      offer.querySelector('.preorder-offer__copy').textContent="Automatically applied at checkout. Includes 8 October 2026, Queensland time. Shipping additional. Official release: 8 October.";
      const img=offer.querySelector('.preorder-offer__visual img');
      img.src="assets/products/coast-go/blue-orange/amazon-20260929/AP081165-01-main.webp";
      img.alt="CoastGo Blue Orange complete paddleboard kit";
      const link=offer.querySelector('[data-preorder-offer-shop]');link.href="products/coast-go.html";link.textContent="Shop CoastGo";
    }
    if(window.AURACoastGo.freeShippingActive()&&!shippingMode){
      shippingMode=true;
      if(offer.open)offer.close();
      promotion={promotion_id:window.AURACoastGo.shippingPromotionId,promotion_name:"CoastGo — free standard shipping",creative_slot:"homepage_modal",currency:"AUD",items:window.AURACoastGo.skus.map(item_id=>({item_id,item_name:"AURA PADDLE CoastGo",price:299,quantity:1,promotion_id:window.AURACoastGo.shippingPromotionId,promotion_name:"CoastGo — free standard shipping",creative_slot:"homepage_modal"}))};
      storageKey="aura-home-promo-coastgo-free-standard-202610";
      offer.querySelector('.preorder-offer__eyebrow').textContent="CoastGo · 9–21 October · Queensland time";
      offer.querySelector('#preorderOfferTitle').innerHTML="CoastGo<br><span>FREE STANDARD SHIPPING*</span>";
      offer.querySelector('.preorder-offer__value').textContent="AUD $299. Free standard delivery to eligible regions.";
      offer.querySelector('[data-promo-code-copy]').hidden=true;
      offer.querySelector('[data-promo-code-copy]').style.display="none";
      offer.querySelector('.preorder-offer__copy').textContent="Automatically applied through 21 October 2026 inclusive, Queensland time. Express shipping extra; remote destinations require a quote. Standard transit: 21–40 days after dispatch.";
    }
    if(!isActive()&&offer.open)offer.close();
  }
  const track=(name,params={})=>window.AURATracking?.event(name,{...promotion,...params});
  const isActive=()=>Date.now()>=promotionStarts&&Date.now()<shippingEnds;
  const hasSeen=()=>{try{return sessionStorage.getItem(storageKey)==="seen"}catch{return false}};
  const markSeen=()=>{try{sessionStorage.setItem(storageKey,"seen")}catch{}};
  const openOffer=source=>{
    refreshPromotion();
    if(!isActive()||hasSeen()||offer.open||document.querySelector("dialog[open]"))return;
    markSeen();
    offer.showModal();
    track("view_promotion",{promotion_source:source});
  };
  document.querySelectorAll("[data-preorder-offer-open]").forEach(button=>button.addEventListener("click",()=>{
    refreshPromotion();
    if(!isActive()||offer.open||document.querySelector("dialog[open]"))return;
    offer.showModal();
    track("view_promotion",{promotion_source:"manual"});
  }));
  const dismiss=method=>{
    if(!offer.open)return;
    offer.close();
    track("dismiss_promotion",{dismiss_method:method});
  };
  offer.querySelectorAll("[data-preorder-offer-close]").forEach(button=>button.addEventListener("click",()=>dismiss(button.classList.contains("preorder-offer__close")?"close_button":"not_now")));
  offer.querySelector("[data-preorder-offer-shop]").addEventListener("click",()=>track("select_promotion"));
  const copyButton=offer.querySelector("[data-promo-code-copy]");
  copyButton?.addEventListener("click",async()=>{
    if(shippingMode)return;
    try{
      await navigator.clipboard.writeText(coastMode?"COASTGO10":"YOGAFREESHIP");
      const label=copyButton.querySelector("span");
      label.textContent="Copied";
      window.setTimeout(()=>{label.textContent=coastMode?"Automatically applied":"Copy code"},1800);
      track("copy_promotion_code");
    }catch{copyButton.querySelector("span").textContent=coastMode?"COASTGO10":"YOGAFREESHIP"}
  });
  offer.addEventListener("click",event=>{if(event.target===offer)dismiss("backdrop")});
  offer.addEventListener("cancel",event=>{event.preventDefault();dismiss("escape")});
  refreshPromotion();
  for(const boundary of [promotionEnds,coastEnds,shippingEnds]){
    const delay=boundary-Date.now();
    if(delay>0&&delay<2147483647)window.setTimeout(()=>{refreshPromotion();openOffer("promotion_transition")},delay+10);
  }
  window.addEventListener("pageshow",()=>{refreshPromotion();openOffer("return_visit")});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){refreshPromotion();openOffer("return_visit")}});
  if(isActive()&&!hasSeen())window.setTimeout(()=>openOffer("automatic"),850);
})();
