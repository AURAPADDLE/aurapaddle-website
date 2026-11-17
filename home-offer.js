(()=>{
  const offer=document.getElementById("preorderOffer"),policy=window.AURACoastGo;
  if(!offer||!policy)return;
  const storageKey="aura-home-free-shipping-coastgo-yoga-20261112",menuOpen=()=>document.body.classList.contains("menu-open");
  const promotion={promotion_id:policy.shippingPromotionId,promotion_name:"CoastGo & Yoga Cruiser — free shipping",creative_slot:"homepage_modal",coupon:policy.shippingCode,currency:"AUD",items:[...policy.skus.map(item_id=>({item_id,item_name:"AURA PADDLE CoastGo",price:299,quantity:1})),...policy.yogaSkus.map(item_id=>({item_id,item_name:"AURA PADDLE Yoga Cruiser",price:749,quantity:1}))]};
  const track=(name,params={})=>window.AURATracking?.event(name,{...promotion,...params});
  const copyButton=offer.querySelector('[data-promo-code-copy]'),coastLink=offer.querySelector('[data-preorder-offer-shop]'),yogaLink=offer.querySelector('[data-preorder-offer-yoga]');
  const seen=()=>{try{return sessionStorage.getItem(storageKey)==="seen"}catch{return false}};
  const privacyNoticeOpen=()=>Boolean(document.querySelector(".cookie-consent.is-visible"));
  let autoReady=false,lastManualTrigger=null;
  const open=(source,manual=false)=>{
    if(!policy.freeShippingActive()){if(offer.open)offer.close();return false}
    if(offer.open||document.querySelector("dialog[open]")||privacyNoticeOpen()||menuOpen()||(!manual&&seen()))return false;
    offer.showModal();
    try{sessionStorage.setItem(storageKey,"seen")}catch{}
    track("view_promotion",{promotion_source:source});
    return true;
  };
  document.querySelectorAll('[data-preorder-offer-open]').forEach(button=>button.addEventListener("click",()=>{lastManualTrigger=button;open("manual",true)}));
  const dismiss=method=>{if(!offer.open)return;offer.close();track("dismiss_promotion",{dismiss_method:method});if(lastManualTrigger){lastManualTrigger.focus();lastManualTrigger=null}};
  offer.querySelectorAll('[data-preorder-offer-close]').forEach(button=>button.addEventListener("click",()=>dismiss("button")));
  coastLink?.addEventListener("click",()=>track("select_promotion",{selected_product:"coast-go"}));
  yogaLink?.addEventListener("click",()=>track("select_promotion",{selected_product:"yoga-cruiser"}));
  copyButton?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(policy.shippingCode);copyButton.querySelector("span").textContent="Copied";setTimeout(()=>copyButton.querySelector("span").textContent="Copy code",1800);track("copy_promotion_code")}catch{copyButton.querySelector("span").textContent="AURAFREESHIP"}});
  offer.addEventListener("click",event=>{if(event.target===offer)dismiss("backdrop")});
  offer.addEventListener("cancel",event=>{event.preventDefault();dismiss("escape")});
  const retryAuto=source=>{if(autoReady)open(source)};
  window.addEventListener("pageshow",()=>{if(!policy.freeShippingActive()&&offer.open)offer.close()});
  window.addEventListener("aura:coastgo-change",()=>{if(!policy.freeShippingActive()&&offer.open)offer.close();else retryAuto("promotion_transition")});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)retryAuto("return_visit")});
  new MutationObserver(()=>{if(!privacyNoticeOpen()&&!menuOpen())retryAuto("after_blocker_closed")}).observe(document.body,{subtree:true,attributes:true,attributeFilter:["class","open"]});
  if(policy.freeShippingActive())setTimeout(()=>{autoReady=true;open("automatic")},3000);
})();
