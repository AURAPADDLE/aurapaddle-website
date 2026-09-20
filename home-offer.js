(()=>{
  const offer=document.getElementById("preorderOffer");
  if(!offer)return;
  const promotion={promotion_id:"yoga_glacier_free_shipping_202609",promotion_name:"Yoga Cruiser Glacier Blue free shipping",creative_slot:"homepage_modal"};
  const promotionStarts=Date.parse("2026-09-20T00:00:00+10:00");
  const promotionEnds=Date.parse("2026-09-27T00:00:00+10:00");
  const storageKey="aura-home-promo-yoga-glacier-202609";
  const track=(name,params={})=>window.AURATracking?.event(name,{...promotion,...params});
  const isActive=()=>Date.now()>=promotionStarts&&Date.now()<promotionEnds;
  const hasSeen=()=>{try{return sessionStorage.getItem(storageKey)==="seen"}catch{return false}};
  const markSeen=()=>{try{sessionStorage.setItem(storageKey,"seen")}catch{}};
  const openOffer=source=>{
    if(!isActive()||hasSeen()||offer.open||document.querySelector("dialog[open]"))return;
    markSeen();
    offer.showModal();
    track("view_promotion",{promotion_source:source});
  };
  document.querySelectorAll("[data-preorder-offer-open]").forEach(button=>button.addEventListener("click",()=>{
    if(offer.open||document.querySelector("dialog[open]"))return;
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
    try{
      await navigator.clipboard.writeText("YOGAFREESHIP");
      const label=copyButton.querySelector("span");
      label.textContent="Copied";
      window.setTimeout(()=>{label.textContent="Copy code"},1800);
      track("copy_promotion_code");
    }catch{copyButton.querySelector("span").textContent="YOGAFREESHIP"}
  });
  offer.addEventListener("click",event=>{if(event.target===offer)dismiss("backdrop")});
  offer.addEventListener("cancel",event=>{event.preventDefault();dismiss("escape")});
  if(isActive()&&!hasSeen())window.setTimeout(()=>openOffer("automatic"),850);
})();
