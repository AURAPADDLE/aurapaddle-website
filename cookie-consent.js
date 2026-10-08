(()=>{
  const storageKey="aura-cookie-consent-v1";
  const measurementId="G-0DJKT6VHVL";
  const defaults={necessary:true,analytics:false,marketing:false};
  const attributionKey="aura-attribution-v1";
  const attributionMaxAge=90*24*60*60*1000;
  const debugMode=new URL(location.href).searchParams.get("aura_debug")==="1";
  const read=()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(storageKey)||"null")}}catch{return {...defaults}}};
  const saved=()=>localStorage.getItem(storageKey)!==null;
  let tagRequested=false;

  const clean=(value,max=160)=>String(value||"").trim().replace(/[\u0000-\u001f\u007f]/g,"").slice(0,max);
  const readAttribution=()=>{try{const value=JSON.parse(localStorage.getItem(attributionKey)||"null"),expiresAt=Date.parse(value?.expiresAt||"");if(!value||!Number.isFinite(expiresAt)||Date.now()>=expiresAt)return null;return value}catch{return null}};
  const writeAttribution=value=>{try{const now=new Date();localStorage.setItem(attributionKey,JSON.stringify({...value,updatedAt:now.toISOString(),expiresAt:value.expiresAt||new Date(now.getTime()+attributionMaxAge).toISOString()}))}catch{}};
  const removeAttribution=()=>{try{localStorage.removeItem(attributionKey)}catch{}};
  const normalHost=value=>String(value||"").toLowerCase().replace(/^www\./,"");
  const externalReferrer=()=>{try{const host=normalHost(new URL(document.referrer).hostname);return host===normalHost(location.hostname)||host==="stripe.com"||host.endsWith(".stripe.com")||host==="link.com"||host.endsWith(".link.com")?"":clean(host,160)}catch{return ""}};
  const searchSource=host=>/^(www\.)?google\.(com|com\.au|co\.nz|co\.uk)$/.test(host)?"google":host==="bing.com"?"bing":host==="duckduckgo.com"?"duckduckgo":"";
  const trimTouch=(touch,preferences)=>{
    if(!touch||typeof touch!=="object")return null;
    const next={capturedAt:touch.capturedAt};
    if(preferences.analytics)for(const key of ["source","medium","campaign","campaignId","content","term","landingPath","referrerHost","evidence"])if(touch[key])next[key]=touch[key];
    if(preferences.marketing)for(const key of ["clickType","clickId","gadSource"])if(touch[key])next[key]=touch[key];
    return Object.keys(next).length>1?next:null;
  };
  const captureAttribution=preferences=>{
    const analytics=Boolean(preferences.analytics),marketing=Boolean(preferences.marketing);
    if(!analytics&&!marketing){removeAttribution();return null}
    const params=new URL(location.href).searchParams,referrerHost=externalReferrer();
    const touch={capturedAt:new Date().toISOString()};
    if(analytics){
      const tagged=["utm_source","utm_medium","utm_campaign","utm_id","utm_content","utm_term"].some(key=>Boolean(params.get(key)));
      const adClick=marketing&&["gclid","gbraid","wbraid"].some(key=>Boolean(params.get(key))),search=searchSource(referrerHost);
      touch.source=clean(params.get("utm_source")||(adClick?"google":search||referrerHost||"direct"),100);
      touch.medium=clean(params.get("utm_medium")||(adClick?"cpc":search?"organic":referrerHost?"referral":"none"),100);
      touch.evidence=tagged?"utm":adClick?"google_click_id":referrerHost?"referrer":"no_referrer";
      touch.campaign=clean(params.get("utm_campaign"),160);
      touch.campaignId=clean(params.get("utm_id"),100);
      touch.content=clean(params.get("utm_content"),160);
      touch.term=clean(params.get("utm_term"),160);
      touch.landingPath=clean(location.pathname,240);
      touch.referrerHost=referrerHost;
    }
    if(marketing){
      for(const type of ["gclid","gbraid","wbraid"]){const id=clean(params.get(type),240).replace(/[^A-Za-z0-9._~-]/g,"");if(id){touch.clickType=type;touch.clickId=id;break}}
      touch.gadSource=clean(params.get("gad_source"),40).replace(/[^A-Za-z0-9._~-]/g,"");
    }
    for(const key of Object.keys(touch))if(!touch[key])delete touch[key];
    const explicitCampaign=Boolean(touch.campaign||touch.campaignId||touch.content||touch.term||touch.clickId||touch.evidence==="utm");
    const current=readAttribution()||{version:1,expiresAt:new Date(Date.now()+attributionMaxAge).toISOString()};
    current.first=trimTouch(current.first,preferences)||touch;
    const previousLast=trimTouch(current.last,preferences),newNonDirect=explicitCampaign||(analytics&&Boolean(referrerHost));
    current.last=newNonDirect||!previousLast?touch:previousLast;
    if(newNonDirect)current.expiresAt=new Date(Date.now()+attributionMaxAge).toISOString();
    current.consent={analytics,marketing,updatedAt:preferences.updatedAt||new Date().toISOString()};
    if(!analytics&&!marketing){delete current.analyticsClientId;delete current.analyticsSessionId}
    writeAttribution(current);
    return current;
  };

  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};
  window.gtag("consent","default",{
    analytics_storage:"denied",
    ad_storage:"denied",
    ad_user_data:"denied",
    ad_personalization:"denied",
    wait_for_update:500
  });

  const loadGoogleTag=()=>{
    if(tagRequested)return;
    tagRequested=true;
    const script=document.createElement("script");
    script.async=true;
    script.src=`https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.append(script);
    window.gtag("js",new Date());
    window.gtag("config",measurementId,{send_page_view:true,...(debugMode?{debug_mode:true,traffic_type:"internal_test"}:{})});
  };
  // Advanced Consent Mode: load the tag after the denied default so Google can
  // receive cookieless measurement pings while optional storage remains off.
  loadGoogleTag();
  const getGoogleTagValue=name=>new Promise(resolve=>{
    let finished=false;
    const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value)};
    const timer=setTimeout(()=>finish(""),2500);
    try{window.gtag("get",measurementId,name,finish)}catch{finish("")}
  });
  const refreshAnalyticsIds=async preferences=>{
    if(!preferences.analytics&&!preferences.marketing)return captureAttribution(preferences);
    loadGoogleTag();
    const [clientId,sessionId]=await Promise.all([getGoogleTagValue("client_id"),getGoogleTagValue("session_id")]);
    // Respect a withdrawal made while the asynchronous Google tag lookup ran.
    preferences=window.auraConsent||preferences;
    if(!preferences.analytics&&!preferences.marketing)return captureAttribution(preferences);
    const current=captureAttribution(preferences)||{version:1,consent:{analytics:Boolean(preferences.analytics),marketing:Boolean(preferences.marketing)}};
    // Never manufacture a GA identity or reuse a potentially stale session.
    // Missing tag IDs must remain visible as missing, not create false stitching.
    delete current.analyticsClientId;delete current.analyticsSessionId;
    if(/^\d+\.\d+$/.test(String(clientId||"")))current.analyticsClientId=String(clientId);
    if(/^\d+$/.test(String(sessionId||"")))current.analyticsSessionId=String(sessionId);
    writeAttribution(current);
    return current;
  };
  window.AURAAttribution={
    async snapshot(){
      const preferences=window.auraConsent||read(),current=await refreshAnalyticsIds(preferences);
      return current?JSON.parse(JSON.stringify(current)):{version:1,consent:{analytics:false,marketing:false,updatedAt:preferences.updatedAt||new Date().toISOString()}};
    }
  };
  const updateGoogleConsent=preferences=>{
    const analytics=Boolean(preferences.analytics),marketing=Boolean(preferences.marketing);
    window.gtag("consent","update",{
      analytics_storage:analytics?"granted":"denied",
      ad_storage:marketing?"granted":"denied",
      ad_user_data:marketing?"granted":"denied",
      ad_personalization:marketing?"granted":"denied"
    });
    if(analytics||marketing)loadGoogleTag();
  };
  const sendAnalyticsEvent=(name,parameters={})=>{
    if(typeof window.gtag!=="function")return false;
    loadGoogleTag();
    window.gtag("event",String(name),debugMode?{...parameters,debug_mode:true,traffic_type:"internal_test"}:parameters);
    return true;
  };
  window.AURAAnalytics={
    event(name,parameters={}){
      return sendAnalyticsEvent(name,parameters);
    }
  };
  const apply=preferences=>{
    window.auraConsent={...defaults,...preferences};
    updateGoogleConsent(window.auraConsent);
    captureAttribution(window.auraConsent);
    window.dispatchEvent(new CustomEvent("aura:consent",{detail:window.auraConsent}));
  };
  const save=preferences=>{
    const value={...defaults,...preferences,updatedAt:new Date().toISOString()};
    localStorage.setItem(storageKey,JSON.stringify(value));
    apply(value);
  };

  const banner=document.createElement("section");
  banner.className="cookie-consent";
  banner.setAttribute("aria-label","Cookie preferences");
  banner.innerHTML=`<div class="cookie-consent__inner"><div><h2>Your privacy choices</h2><p>We use necessary browser storage for features such as your cart. Optional analytics and marketing technologies stay off unless you choose them. <a href="/policies/#privacy">Privacy Policy</a></p></div><div class="cookie-consent__actions"><button class="cookie-consent__secondary" data-cookie-settings>Settings</button><button class="cookie-consent__secondary" data-cookie-reject>Necessary only</button><button class="cookie-consent__primary" data-cookie-accept>Accept optional</button></div></div>`;

  const dialog=document.createElement("dialog");
  dialog.className="cookie-settings";
  dialog.innerHTML=`<div class="cookie-settings__body"><div class="cookie-settings__top"><h2>Privacy settings</h2><button class="cookie-settings__close" type="button" data-cookie-dialog-cancel aria-label="Close">×</button></div><p>Choose whether AURA PADDLE may use optional analytics and advertising technologies. These remain off unless you allow them.</p><label class="cookie-option"><span><strong>Necessary</strong><span>Required for core features and to remember your privacy choice.</span></span><input type="checkbox" checked disabled></label><label class="cookie-option"><span><strong>Analytics</strong><span>Helps us understand aggregate visits, purchases, referral sources and website performance.</span></span><input id="cookieAnalytics" type="checkbox"></label><label class="cookie-option"><span><strong>Marketing</strong><span>Supports advertising campaign measurement, including approved ad-click identifiers.</span></span><input id="cookieMarketing" type="checkbox"></label><div class="cookie-settings__actions"><button class="cookie-consent__secondary" type="button" data-cookie-dialog-cancel>Cancel</button><button class="save" type="button" data-cookie-dialog-save>Save choices</button></div></div>`;
  document.body.append(banner,dialog);

  const openSettings=()=>{const p=read();dialog.returnValue="";dialog.querySelector("#cookieAnalytics").checked=Boolean(p.analytics);dialog.querySelector("#cookieMarketing").checked=Boolean(p.marketing);dialog.showModal()};
  banner.querySelector("[data-cookie-settings]").addEventListener("click",openSettings);
  banner.querySelector("[data-cookie-reject]").addEventListener("click",()=>{save(defaults);banner.classList.remove("is-visible")});
  banner.querySelector("[data-cookie-accept]").addEventListener("click",()=>{save({necessary:true,analytics:true,marketing:true});banner.classList.remove("is-visible")});
  dialog.querySelectorAll("[data-cookie-dialog-cancel]").forEach(button=>button.addEventListener("click",()=>dialog.close("cancel")));
  dialog.querySelector("[data-cookie-dialog-save]").addEventListener("click",()=>dialog.close("save"));
  dialog.addEventListener("close",()=>{if(dialog.returnValue!=="save")return;save({necessary:true,analytics:dialog.querySelector("#cookieAnalytics").checked,marketing:dialog.querySelector("#cookieMarketing").checked});banner.classList.remove("is-visible")});
  document.addEventListener("click",event=>{if(event.target.closest("[data-open-cookie-settings]"))openSettings()});
  apply(read());
  window.dispatchEvent(new CustomEvent("aura:analytics-ready"));
  if(!saved())banner.classList.add("is-visible");
})();
