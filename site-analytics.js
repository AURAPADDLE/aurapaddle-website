(()=>{
  const allowedErrorCodes=new Set(["offline","http_400","http_401","http_403","http_404","http_409","http_422","http_429","http_500","http_502","http_503","http_504","request_failed","invalid_response"]);
  const event=(name,parameters={})=>{
    const send=()=>window.AURAAnalytics?.event(String(name),parameters);
    if(window.AURAAnalytics)return send();
    window.addEventListener("aura:analytics-ready",send,{once:true});
    return false;
  };
  const errorCode=(response=null)=>{
    if(typeof navigator!=="undefined"&&navigator.onLine===false)return "offline";
    const status=Number(response?.status||0),code=status?`http_${status}`:"request_failed";
    return allowedErrorCodes.has(code)?code:"request_failed";
  };
  const locationType=element=>element.closest("header")?"header":element.closest("footer")?"footer":element.closest("main")?"main":"body";

  window.AURATracking={event,errorCode};

  document.addEventListener("click",click=>{
    const link=click.target.closest("a[href]");
    if(!link)return;
    const href=String(link.getAttribute("href")||"").toLowerCase();
    let contactChannel="";
    if(href.startsWith("mailto:"))contactChannel="email";
    else if(href.startsWith("tel:"))contactChannel="phone";
    else if(href.includes("instagram.com"))contactChannel="instagram";
    else if(href.includes("tiktok.com"))contactChannel="tiktok";
    if(contactChannel)event("contact_click",{contact_channel:contactChannel,link_location:locationType(link)});
  });
})();
