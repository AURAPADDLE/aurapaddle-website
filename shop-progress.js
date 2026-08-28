(()=>{
  const campaignByProduct={
    yoga:{id:"paddle-launch-batch-01",target:50,label:"Glacier confirmed · Shared batch"},
    angler:{id:"paddle-launch-batch-01",target:50,label:"Paddle batch"},
    touring:{id:"paddle-launch-batch-01",target:50,label:"Paddle batch"},
    vela:{id:"vela-wakeboard-launch-batch",target:5,label:"Product batch"},
    foil:{id:"inflatable-hydrofoil-launch-batch",target:5,label:"Product batch"},
    hydrofoilset:{id:"hydrofoil-set-launch-batch",target:5,label:"Product batch"},
    gannet:{id:"gannet-launch-batch",target:10,label:"Product batch"},
    current:{id:"current-launch-batch",target:10,label:"Product batch"},
    meridian:{id:"meridian-launch-batch",target:10,label:"Product batch"},
    wayfinder:{id:"wayfinder-launch-batch",target:10,label:"Product batch"}
  };
  const companyAllocationByCampaign={
    "paddle-launch-batch-01":20,
    "gannet-launch-batch":5,
    "current-launch-batch":5,
    "meridian-launch-batch":5,
    "wayfinder-launch-batch":5
  };
  const productIdByPath={
    "products/yoga-cruiser.html":"yoga",
    "products/angler-fishing.html":"angler",
    "products/touring-performance.html":"touring",
    "products/vela-wakeboard.html":"vela",
    "products/inflatable-hydrofoil.html":"foil",
    "products/hydrofoil-set.html":"hydrofoilset",
    "products/gannet.html":"gannet",
    "products/current.html":"current",
    "products/meridian.html":"meridian",
    "products/wayfinder.html":"wayfinder"
  };
  let liveCampaigns=new Map();
  let refreshInFlight=false;

  function stateFor(productId){
    const config=campaignByProduct[productId];
    if(!config)return null;
    const live=liveCampaigns.get(config.id),target=Number(live?.target||config.target||0);
    const committed=Math.min(target,Number(companyAllocationByCampaign[config.id]||0)+Number(live?.reserved||0));
    return {...config,target,committed,percent:target?Math.min(100,Math.round(committed/target*100)):0};
  }

  function apply(){
    document.querySelectorAll(".product-card").forEach(card=>{
      const productId=card.dataset.productId||productIdByPath[card.dataset.productUrl];
      if(productId&&!card.dataset.productId)card.dataset.productId=productId;
      const state=stateFor(productId),media=card.querySelector(".product-media"),status=card.querySelector(".status");
      if(!state||!media||!status)return;
      status.textContent=`${state.label} · ${state.committed}/${state.target}`;
      let track=media.querySelector(".card-progress");
      if(!track){
        track=document.createElement("span");
        track.className="card-progress";
        track.setAttribute("role","progressbar");
        track.innerHTML="<i></i>";
        status.insertAdjacentElement("afterend",track);
      }
      track.setAttribute("aria-label",`${state.label} committed production progress`);
      track.setAttribute("aria-valuemin","0");
      track.setAttribute("aria-valuemax",String(state.target));
      track.setAttribute("aria-valuenow",String(state.committed));
      track.firstElementChild.style.width=`${state.percent}%`;
    });
  }

  async function refresh(){
    apply();
    if(refreshInFlight||location.protocol==="file:")return;
    refreshInFlight=true;
    try{
      const response=await fetch("/api/preorder-progress",{cache:"no-store",headers:{Accept:"application/json"}});
      if(!response.ok)return;
      const payload=await response.json();
      liveCampaigns=new Map((payload.campaigns||[]).map(item=>[item.id,item]));
      apply();
    }catch{}finally{refreshInFlight=false}
  }

  window.AURAShopProgress={apply,refresh};
  apply();refresh();
  window.setInterval(refresh,60000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh()});
})();
