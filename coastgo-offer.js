/* Shared, deterministic CoastGo pricing and dispatch rules (browser and server). */
(function(root){
  const skus=["AP081165","AP730047","AP388238"];
  const launchAt="2026-10-08T00:00:00+10:00",endsAt="2026-10-08T06:00:00+10:00";
  const isCoastGo=sku=>skus.includes(String(sku||"").toUpperCase());
  const discounted=(now=Date.now())=>now<Date.parse(endsAt);
  const price=(now=Date.now())=>discounted(now)?28900:29900;
  const code="COASTGO10";
  const shippingEndsAt="2026-10-22T00:00:00+10:00";
  const shippingPromotionId="aura_free_shipping_202610";
  const shippingCode="AURAFREESHIP";
  const yogaSkus=["AP734955","AP505002","AP233694","AP587273"];
  const yogaRegionIds=["gold-coast-brisbane","qld-nsw-main","canberra-melbourne"];
  const isYoga=sku=>yogaSkus.includes(String(sku||"").toUpperCase());
  const standardRegionIds=["coastgo-metro","coastgo-standard","coastgo-country"];
  const remoteRegionIds=["coastgo-remote-north","coastgo-remote-west"];
  const freeShippingActive=(now=Date.now())=>now>=Date.parse(endsAt)&&now<Date.parse(shippingEndsAt);
  const freeShippingFor=(regionId,now=Date.now())=>freeShippingActive(now)&&standardRegionIds.includes(regionId);
  const yogaFreeShippingFor=(sku,regionId,now=Date.now())=>freeShippingActive(now)&&isYoga(sku)&&yogaRegionIds.includes(regionId);
  const remoteQuoteFor=(regionId,now=Date.now())=>freeShippingActive(now)&&remoteRegionIds.includes(regionId);
  const shippingTerms="AURAFREESHIP: free standard shipping to eligible Australian delivery regions through 21 October 2026 inclusive (Queensland time), automatically applied. Express shipping is charged separately; remote destinations require a quote. Standard transit: 21–40 days after dispatch.";
  const yogaShippingTerms="AURAFREESHIP: free shipping to Gold Coast / Brisbane Metro and QLD / NSW / ACT major cities, coastal areas & Melbourne Metro through 21 October 2026 inclusive (Queensland time), automatically applied. Other regions retain their published rates; remote destinations require a quote.";
  const priceNote=(now=Date.now())=>freeShippingActive(now)?"AUD $299 · FREE standard shipping to eligible regions · Express extra · Remote quote":"New-product price · Pay in full · Shipping additional";
  const codeFor=(items,now=Date.now())=>discounted(now)&&items.some(item=>isCoastGo(item.variant?.sku||item.sku))?code:"";
  const beforeLaunch=(now=Date.now())=>now<Date.parse(launchAt);
  const dispatch=(now=Date.now())=>beforeLaunch(now)?"Official release 8 October 2026. Advance orders dispatch within 2 days from release; subsequent orders dispatch within 2 days of order confirmation.":"Dispatch within 2 days of order confirmation.";
  const offer=(now=Date.now())=>discounted(now)?"RRP AUD $349 → new-product price AUD $299. Order through 8 October 2026 inclusive (Queensland time) for an extra AUD $10 off per board, automatically applied at checkout. Product total after discount: AUD $289. From 9 October: AUD $299. Pay in full; shipping is additional.":`RRP AUD $349 → new-product price AUD $299. Pay in full. ${freeShippingActive(now)?shippingTerms:"Shipping is additional."}`;
  const variant=(value,now=Date.now())=>isCoastGo(value.sku)?{...value,retailAUD:349,saleAUD:price(now)/100,retailAmount:34900,checkoutAmount:price(now),depositAmount:price(now),available:true,orderMode:"available",preorder:null,campaign:null,launchAt,dispatchLeadDays:2}:value;
  const policy={skus,launchAt,endsAt,shippingEndsAt,shippingPromotionId,shippingCode,yogaSkus,yogaRegionIds,isYoga,yogaFreeShippingFor,yogaShippingTerms,standardRegionIds,remoteRegionIds,freeShippingActive,freeShippingFor,remoteQuoteFor,shippingTerms,priceNote,isCoastGo,discounted,price,code,codeFor,beforeLaunch,dispatch,offer,variant};
  if(typeof module!=="undefined"&&module.exports)module.exports=policy;
  else {
    root.AURACoastGo=policy;
    let previous=`${price()}:${beforeLaunch()}:${freeShippingActive()}`;
    const refresh=()=>{const next=`${price()}:${beforeLaunch()}:${freeShippingActive()}`;if(next!==previous){previous=next;root.dispatchEvent(new Event("aura:coastgo-change"))}};
    for(const date of [launchAt,endsAt,shippingEndsAt]){const delay=Date.parse(date)-Date.now();if(delay>0&&delay<2147483647)root.setTimeout(refresh,delay+10)}
    root.addEventListener("pageshow",refresh);
    root.document.addEventListener("visibilitychange",refresh);
  }
})(typeof window!=="undefined"?window:globalThis);
