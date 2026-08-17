(()=>{
  const storageKey="aura-cookie-consent-v1";
  const defaults={necessary:true,analytics:false,marketing:false};
  const read=()=>{try{return {...defaults,...JSON.parse(localStorage.getItem(storageKey)||"null")}}catch{return {...defaults}}};
  const saved=()=>localStorage.getItem(storageKey)!==null;
  const apply=preferences=>{
    window.auraConsent={...defaults,...preferences};
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
  banner.innerHTML=`<div class="cookie-consent__inner"><div><h2>Your privacy choices</h2><p>We use necessary browser storage for features such as your cart. Optional analytics and marketing technologies stay off unless you choose them. <a href="${location.pathname.includes('/products/')?'../':''}policy-preview.html#privacy">Privacy Policy</a></p></div><div class="cookie-consent__actions"><button class="cookie-consent__secondary" data-cookie-settings>Settings</button><button class="cookie-consent__secondary" data-cookie-reject>Necessary only</button><button class="cookie-consent__primary" data-cookie-accept>Accept optional</button></div></div>`;

  const dialog=document.createElement("dialog");
  dialog.className="cookie-settings";
  dialog.innerHTML=`<form method="dialog" class="cookie-settings__body"><div class="cookie-settings__top"><h2>Privacy settings</h2><button class="cookie-settings__close" value="cancel" aria-label="Close">×</button></div><p>Choose whether AURA PADDLE may use optional technologies. No analytics or advertising tracker is currently active; these choices will control them if they are added later.</p><label class="cookie-option"><span><strong>Necessary</strong><span>Required for core features and to remember your privacy choice.</span></span><input type="checkbox" checked disabled></label><label class="cookie-option"><span><strong>Analytics</strong><span>Would help us understand aggregate visits and improve the website.</span></span><input id="cookieAnalytics" type="checkbox"></label><label class="cookie-option"><span><strong>Marketing</strong><span>Would support campaign measurement and relevant advertising.</span></span><input id="cookieMarketing" type="checkbox"></label><div class="cookie-settings__actions"><button class="cookie-consent__secondary" value="cancel">Cancel</button><button class="save" value="save">Save choices</button></div></form>`;
  document.body.append(banner,dialog);

  const openSettings=()=>{const p=read();dialog.querySelector("#cookieAnalytics").checked=Boolean(p.analytics);dialog.querySelector("#cookieMarketing").checked=Boolean(p.marketing);dialog.showModal()};
  banner.querySelector("[data-cookie-settings]").addEventListener("click",openSettings);
  banner.querySelector("[data-cookie-reject]").addEventListener("click",()=>{save(defaults);banner.classList.remove("is-visible")});
  banner.querySelector("[data-cookie-accept]").addEventListener("click",()=>{save({necessary:true,analytics:true,marketing:true});banner.classList.remove("is-visible")});
  dialog.addEventListener("close",()=>{if(dialog.returnValue!=="save")return;save({necessary:true,analytics:dialog.querySelector("#cookieAnalytics").checked,marketing:dialog.querySelector("#cookieMarketing").checked});banner.classList.remove("is-visible")});
  document.addEventListener("click",event=>{if(event.target.closest("[data-open-cookie-settings]"))openSettings()});
  apply(read());
  if(!saved())banner.classList.add("is-visible");
})();
