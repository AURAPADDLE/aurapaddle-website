// Offer details are opened only on request; never interrupt homepage browsing.
(()=>{
  const offer=document.getElementById("preorderOffer");
  if(!offer)return;
  const promotion={promotion_id:"preorder_aud50",promotion_name:"AUD 50 off every pre-order board",creative_slot:"homepage_modal"};
  const track=(name,params={})=>window.AURATracking?.event(name,{...promotion,...params});
  document.querySelectorAll("[data-preorder-offer-open]").forEach(button=>button.addEventListener("click",()=>{
    if(offer.open||document.querySelector("dialog[open]"))return;
    offer.showModal();
    track("view_promotion");
  }));
  const dismiss=method=>{
    if(!offer.open)return;
    offer.close();
    track("dismiss_promotion",{dismiss_method:method});
  };
  offer.querySelectorAll("[data-preorder-offer-close]").forEach(button=>button.addEventListener("click",()=>dismiss(button.classList.contains("preorder-offer__close")?"close_button":"maybe_later")));
  offer.querySelector("[data-preorder-offer-shop]").addEventListener("click",()=>track("select_promotion"));
  offer.addEventListener("cancel",event=>{event.preventDefault();dismiss("escape")});
})();
