(()=>{
  const storageKey="aura-cookie-consent-v1";
  const measurementId="G-0DJKT6VHVL";
  const defaults={necessary:true,analytics:false,marketing:false};
  const read=()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(storageKey)||"null")}}catch{return {...defaults}}};
  const saved=()=>localStorage.getItem(storageKey)!==null;
  let tagRequested=false;
  const pendingAnalytics=[];

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
    window.gtag("config",measurementId,{send_page_view:true});
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
  const analyticsAllowed=()=>Boolean(window.auraConsent?.analytics||window.auraConsent?.marketing);
  const sendAnalyticsEvent=(name,parameters={})=>{
    if(!analyticsAllowed()||typeof window.gtag!=="function")return false;
    loadGoogleTag();
    window.gtag("event",String(name),parameters);
    return true;
  };
  window.AURAAnalytics={
    event(name,parameters={}){
      if(sendAnalyticsEvent(name,parameters))return true;
      if(!saved())pendingAnalytics.push([name,parameters]);
      return false;
    }
  };
  const apply=preferences=>{
    window.auraConsent={...defaults,...preferences};
    updateGoogleConsent(window.auraConsent);
    if(analyticsAllowed())while(pendingAnalytics.length)sendAnalyticsEvent(...pendingAnalytics.shift());
    else if(saved())pendingAnalytics.length=0;
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
  dialog.innerHTML=`<form method="dialog" class="cookie-settings__body"><div class="cookie-settings__top"><h2>Privacy settings</h2><button class="cookie-settings__close" value="cancel" aria-label="Close">×</button></div><p>Choose whether AURA PADDLE may use optional analytics and advertising technologies. These remain off unless you allow them.</p><label class="cookie-option"><span><strong>Necessary</strong><span>Required for core features and to remember your privacy choice.</span></span><input type="checkbox" checked disabled></label><label class="cookie-option"><span><strong>Analytics</strong><span>Helps us understand aggregate visits, purchases and website performance.</span></span><input id="cookieAnalytics" type="checkbox"></label><label class="cookie-option"><span><strong>Marketing</strong><span>Supports campaign measurement and relevant advertising.</span></span><input id="cookieMarketing" type="checkbox"></label><div class="cookie-settings__actions"><button class="cookie-consent__secondary" value="cancel">Cancel</button><button class="save" value="save">Save choices</button></div></form>`;
  document.body.append(banner,dialog);

  const openSettings=()=>{const p=read();dialog.querySelector("#cookieAnalytics").checked=Boolean(p.analytics);dialog.querySelector("#cookieMarketing").checked=Boolean(p.marketing);dialog.showModal()};
  banner.querySelector("[data-cookie-settings]").addEventListener("click",openSettings);
  banner.querySelector("[data-cookie-reject]").addEventListener("click",()=>{save(defaults);banner.classList.remove("is-visible")});
  banner.querySelector("[data-cookie-accept]").addEventListener("click",()=>{save({necessary:true,analytics:true,marketing:true});banner.classList.remove("is-visible")});
  dialog.addEventListener("close",()=>{if(dialog.returnValue!=="save")return;save({necessary:true,analytics:dialog.querySelector("#cookieAnalytics").checked,marketing:dialog.querySelector("#cookieMarketing").checked});banner.classList.remove("is-visible")});
  document.addEventListener("click",event=>{if(event.target.closest("[data-open-cookie-settings]"))openSettings()});
  apply(read());
  window.dispatchEvent(new CustomEvent("aura:analytics-ready"));
  if(!saved())banner.classList.add("is-visible");
})();
