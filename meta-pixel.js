(()=>{
  const pixelId="972813395892993",consentKey="aura-cookie-consent-v1",sentPrefix="aura-meta-sent-v1:";
  const allowedEvents=new Map([["view_item","ViewContent"],["add_to_cart","AddToCart"],["begin_checkout","InitiateCheckout"]]);
  let initialised=false,enabled=false;
  const savedChoice=()=>{try{return localStorage.getItem(consentKey)!==null}catch{return true}};
  const explicitMarketing=()=>{try{return JSON.parse(localStorage.getItem(consentKey)||"null")?.marketing===true}catch{return false}};
  const trustedAustralianDefault=()=>!savedChoice()&&window.AURA_TRUSTED_REGION?.source==="trusted-server"&&String(window.AURA_TRUSTED_REGION.country||"").toUpperCase()==="AU";
  const allowedPath=()=>["/","/shop/","/cart/","/policies/","/pre-order/","/our-story/","/contact/","/inflatable-paddle-boards/","/purchase-confirmed.html"].includes(location.pathname)||/^\/(products\/[a-z0-9-]+\.html|guides\/[a-z0-9-]+\/?|support(?:\/[a-z0-9-]+)?\/?)$/.test(location.pathname);
  const safeQuery=()=>[...new URL(location.href).searchParams].every(([key,value])=>["size","colour","category"].includes(key)||key==="fbclid"&&/^[A-Za-z0-9._~-]{1,160}$/.test(value));
  const eligible=()=>allowedPath()&&safeQuery()&&(explicitMarketing()||trustedAustralianDefault());
  const deleteMetaCookies=()=>{for(const name of ["_fbp","_fbc"]){document.cookie=`${name}=; Max-Age=0; Path=/; SameSite=Lax`;document.cookie=`${name}=; Max-Age=0; Path=/; Domain=.aurapaddle.com; SameSite=Lax`}};
  const disable=()=>{enabled=false;deleteMetaCookies();try{sessionStorage.removeItem("aura-meta-purchase-receipt-v1")}catch{}};
  const init=()=>{
    if(initialised||!eligible())return false;
    initialised=true;enabled=true;
    const fbq=window.fbq=function(){fbq.callMethod?fbq.callMethod.apply(fbq,arguments):fbq.queue.push(arguments)};
    if(!window._fbq)window._fbq=fbq;fbq.push=fbq;fbq.loaded=true;fbq.version="2.0";fbq.queue=[];
    fbq("set","autoConfig",false,pixelId);fbq("init",pixelId);
    const script=document.createElement("script");script.async=true;script.src="https://connect.facebook.net/en_US/fbevents.js";document.head.append(script);
    fbq("track","PageView");return true;
  };
  const send=(name,parameters={})=>{
    if(!enabled&&!init())return false;if(!eligible()){disable();return false}
    const metaName=allowedEvents.get(String(name));if(!metaName)return false;
    const item=Array.isArray(parameters.items)?parameters.items[0]||{}:{};
    const payload={content_ids:[String(item.item_id||"").slice(0,32)].filter(Boolean),content_name:String(item.item_name||"").slice(0,100),content_type:"product",value:Number.isFinite(Number(parameters.value))?Number(parameters.value):Number(item.price||0)*Math.max(1,Number(item.quantity||1)),currency:"AUD"};
    window.fbq("track",metaName,payload);return true;
  };
  const sendPurchase=payload=>{
    if(!enabled&&!init())return false;
    if(!eligible()||payload?.verified!==true)return false;
    const eventID=String(payload.eventId||"");if(!/^[a-f0-9]{32}$/.test(eventID))return false;
    const marker=`${sentPrefix}${eventID}`;try{if(localStorage.getItem(marker))return false;localStorage.setItem(marker,"claimed")}catch{return false}
    window.fbq("track","Purchase",{currency:"AUD",value:Number(payload.value||0),content_type:"product",content_ids:(payload.items||[]).map(item=>String(item.sku||"").slice(0,32)).filter(Boolean),num_items:(payload.items||[]).reduce((sum,item)=>sum+Number(item.quantity||0),0)},{eventID});
    try{localStorage.setItem(marker,"sent")}catch{}return true;
  };
  const consume=event=>send(event?.name,event?.parameters);
  window.addEventListener("aura:measurement-event",event=>consume(event.detail));
  window.addEventListener("aura:consent",event=>{if(event.detail?.marketing===true)init();else disable()});
  for(const event of window.AURAMeasurementQueue||[])consume(event);
  window.AURAMeta={init,event:send,purchase:sendPurchase,eligible,defaultMarketing:trustedAustralianDefault,disable};if(window.AURA_META_DEFERRED!==true)init();window.dispatchEvent(new CustomEvent("aura:meta-ready"));
})();
