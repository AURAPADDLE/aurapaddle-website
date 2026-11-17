(()=>{
  const menuButton=document.getElementById("siteMenuButton"),mobileMenu=document.getElementById("siteMobileMenu");
  const desktopTriggers=[...document.querySelectorAll(".site-nav-trigger")],mobileToggles=[...document.querySelectorAll(".site-mobile-toggle")];
  const closeDesktop=(returnFocus=false)=>{const active=desktopTriggers.find(button=>button.getAttribute("aria-expanded")==="true");desktopTriggers.forEach(button=>{button.setAttribute("aria-expanded","false");document.getElementById(button.getAttribute("aria-controls"))?.classList.remove("open")});if(returnFocus)active?.focus()};
  desktopTriggers.forEach(button=>button.addEventListener("click",event=>{event.stopPropagation();const opening=button.getAttribute("aria-expanded")!=="true";closeDesktop();button.setAttribute("aria-expanded",String(opening));document.getElementById(button.getAttribute("aria-controls"))?.classList.toggle("open",opening)}));
  document.addEventListener("click",event=>{if(!event.target.closest(".site-nav-group"))closeDesktop()});
  const closePanels=except=>mobileToggles.forEach(button=>{if(button===except)return;button.setAttribute("aria-expanded","false");document.getElementById(button.getAttribute("aria-controls"))?.classList.remove("open")});
  mobileToggles.forEach(button=>button.addEventListener("click",()=>{const opening=button.getAttribute("aria-expanded")!=="true";closePanels(button);button.setAttribute("aria-expanded",String(opening));document.getElementById(button.getAttribute("aria-controls"))?.classList.toggle("open",opening)}));
  const closeMobile=(returnFocus=false)=>{if(!menuButton||!mobileMenu)return;mobileMenu.classList.remove("open");document.body.classList.remove("site-menu-open");menuButton.setAttribute("aria-expanded","false");menuButton.setAttribute("aria-label","Open navigation menu");menuButton.textContent="☰";closePanels();if(returnFocus)menuButton.focus()};
  menuButton?.addEventListener("click",()=>{const opening=!mobileMenu.classList.contains("open");if(opening){mobileMenu.classList.add("open");document.body.classList.add("site-menu-open");menuButton.setAttribute("aria-expanded","true");menuButton.setAttribute("aria-label","Close navigation menu");menuButton.textContent="×"}else closeMobile(true)});
  mobileMenu?.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>closeMobile()));
  document.addEventListener("keydown",event=>{if(event.key!=="Escape")return;if(mobileMenu?.classList.contains("open"))closeMobile(true);else closeDesktop(true)});
})();
