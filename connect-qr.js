(()=>{
  const cards=[...document.querySelectorAll("[data-social-qr-card]")];
  if(!cards.length)return;
  let activeToggle=null;
  const closeCard=(card,returnFocus=false)=>{
    const toggle=card.querySelector("[data-social-qr-toggle]"),panel=document.getElementById(toggle?.getAttribute("aria-controls"));
    if(!toggle||!panel)return;
    toggle.setAttribute("aria-expanded","false");
    panel.hidden=true;
    card.classList.remove("is-open");
    if(activeToggle===toggle)activeToggle=null;
    if(returnFocus)toggle.focus();
  };
  const closeAll=(except=null)=>cards.forEach(card=>{if(card!==except)closeCard(card)});
  cards.forEach(card=>{
    const toggle=card.querySelector("[data-social-qr-toggle]"),panel=document.getElementById(toggle?.getAttribute("aria-controls")),close=card.querySelector("[data-social-qr-close]");
    if(!toggle||!panel)return;
    toggle.addEventListener("click",()=>{
      const opening=toggle.getAttribute("aria-expanded")!=="true";
      closeAll(card);
      if(!opening){closeCard(card,true);return}
      toggle.setAttribute("aria-expanded","true");
      panel.hidden=false;
      card.classList.add("is-open");
      activeToggle=toggle;
      panel.querySelector("[data-social-qr-close]")?.focus();
    });
    close?.addEventListener("click",()=>closeCard(card,true));
  });
  document.addEventListener("keydown",event=>{
    if(event.key!=="Escape"||!activeToggle)return;
    const card=activeToggle.closest("[data-social-qr-card]");
    if(card)closeCard(card,true);
  });
})();
