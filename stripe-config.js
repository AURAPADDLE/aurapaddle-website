(()=>{
  const liveAt=Date.parse("2026-08-18T01:18:00+10:00");
  const productionReady=false;
  window.AURA_STRIPE={checkoutEndpoint:"/api/checkout",liveAt,productionReady,enabled:location.protocol!=="file:"&&productionReady&&Date.now()>=liveAt,mode:productionReady&&Date.now()>=liveAt?"live":"scheduled"};
})();
