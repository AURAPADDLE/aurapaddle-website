(()=>{
  const productIdByPath={"products/yoga-cruiser.html":"yoga","products/angler-fishing.html":"angler","products/touring-performance.html":"touring","products/vela-wakeboard.html":"vela","products/inflatable-hydrofoil.html":"foil","products/hydrofoil-set.html":"hydrofoilset","products/gannet.html":"gannet","products/current.html":"current","products/meridian.html":"meridian","products/wayfinder.html":"wayfinder"};

  function apply(){
    document.querySelectorAll(".product-card").forEach(card=>{
      const productId=card.dataset.productId||productIdByPath[card.dataset.productUrl];
      if(productId&&!card.dataset.productId)card.dataset.productId=productId;
      const media=card.querySelector(".product-media"),status=card.querySelector(".status");
      media?.querySelector(".card-progress")?.remove();
      if(productId==="yoga"&&status){
        status.textContent="Glacier Blue · In stock · Other colours · No-minimum pre-order";
        let note=card.querySelector(".variant-availability-note");
        if(!note){note=document.createElement("p");note.className="variant-availability-note";card.querySelector(".product-body")?.append(note)}
        note.textContent="Glacier Blue is in stock. Other colours use a 50% initial payment with estimated dispatch approximately 10 weeks after successful payment.";
      }else if(status&&productId){
        status.textContent="Pre-order · No minimum quantity · 50% due today";
      }
    });
  }

  window.AURAShopProgress={apply,refresh:apply};
  apply();
})();
