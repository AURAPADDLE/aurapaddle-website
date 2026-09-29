/* Shared, deterministic CoastGo pricing and dispatch rules (browser and server). */
(function(root){
  const skus=["AP081165","AP730047","AP388238"];
  const launchAt="2026-10-08T00:00:00+10:00",endsAt="2026-10-09T00:00:00+10:00";
  const isCoastGo=sku=>skus.includes(String(sku||"").toUpperCase());
  const discounted=(now=Date.now())=>now<Date.parse(endsAt);
  const price=(now=Date.now())=>discounted(now)?28900:29900;
  const code="COASTGO10";
  const codeFor=(items,now=Date.now())=>discounted(now)&&items.some(item=>isCoastGo(item.variant?.sku||item.sku))?code:"";
  const beforeLaunch=(now=Date.now())=>now<Date.parse(launchAt);
  const dispatch=(now=Date.now())=>beforeLaunch(now)?"Official release 8 October 2026. Advance orders dispatch within 2 days from release; subsequent orders dispatch within 2 days of order confirmation.":"Dispatch within 2 days of order confirmation.";
  const offer=(now=Date.now())=>discounted(now)?"RRP AUD $349 → new-product price AUD $299. Order through 8 October 2026 inclusive (Queensland time) for an extra AUD $10 off per board, automatically applied at checkout. Product total after discount: AUD $289. From 9 October: AUD $299. Pay in full; shipping is additional.":"RRP AUD $349 → new-product price AUD $299. Pay in full; shipping is additional.";
  const variant=(value,now=Date.now())=>isCoastGo(value.sku)?{...value,retailAUD:349,saleAUD:price(now)/100,retailAmount:34900,checkoutAmount:price(now),depositAmount:price(now),available:true,orderMode:"available",preorder:null,campaign:null,launchAt,dispatchLeadDays:2}:value;
  const policy={skus,launchAt,endsAt,isCoastGo,discounted,price,code,codeFor,beforeLaunch,dispatch,offer,variant};
  if(typeof module!=="undefined"&&module.exports)module.exports=policy;
  else {
    root.AURACoastGo=policy;
    let previous=`${price()}:${beforeLaunch()}`;
    const refresh=()=>{const next=`${price()}:${beforeLaunch()}`;if(next!==previous){previous=next;root.dispatchEvent(new Event("aura:coastgo-change"))}};
    for(const date of [launchAt,endsAt]){const delay=Date.parse(date)-Date.now();if(delay>0&&delay<2147483647)root.setTimeout(refresh,delay+10)}
    root.addEventListener("pageshow",refresh);
    root.document.addEventListener("visibilitychange",refresh);
  }
})(typeof window!=="undefined"?window:globalThis);
