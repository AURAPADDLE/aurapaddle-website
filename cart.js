(()=>{
  const storageKey="aura-cart-v2";
  const listeners=new Set();
  const clamp=value=>Math.max(1,Math.min(20,Math.round(Number(value)||1)));
  const clean=item=>{
    const sku=String(item.sku||"").toUpperCase();
    return {sku,quantity:clamp(item.quantity),productName:String(item.productName||"AURA PADDLE product"),shortName:String(item.shortName||item.productName||"Product"),size:String(item.size||""),colour:sku==="AP667703"?"White":String(item.colour||""),colourKey:sku==="AP667703"?"white":String(item.colourKey||""),unitAmount:Math.max(0,Math.round(Number(item.unitAmount)||0)),retailAmount:Math.max(0,Math.round(Number(item.retailAmount)||0)),orderMode:sku==="AP667703"||item.orderMode==="preorder"?"preorder":"available",productUrl:String(item.productUrl||"shop-preview.html"),campaign:item.campaign||null,image:sku==="AP667703"?"assets/products/angler-fishing/accessories/AP667703_fishing-rack-cart.png":String(item.image||"")};
  };
  function read(){
    try{const value=JSON.parse(localStorage.getItem(storageKey)||"[]");return Array.isArray(value)?value.map(clean).filter(item=>/^AP\d{6}$/.test(item.sku)&&item.unitAmount>0):[]}catch{return []}
  }
  function write(items){
    const safe=items.map(clean).filter(item=>/^AP\d{6}$/.test(item.sku)&&item.unitAmount>0).slice(0,20);
    localStorage.setItem(storageKey,JSON.stringify(safe));updateBadges(safe);listeners.forEach(listener=>listener(safe));return safe;
  }
  function updateBadges(items=read()){
    const count=items.reduce((sum,item)=>sum+item.quantity,0);
    document.querySelectorAll("[data-cart-count]").forEach(node=>{node.textContent=String(count);node.hidden=count===0});
    document.querySelectorAll("[data-cart-label]").forEach(node=>node.setAttribute("aria-label",`Cart with ${count} ${count===1?"item":"items"}`));
  }
  function add(item,quantity=1){
    const safe=clean({...item,quantity}),items=read(),existing=items.find(entry=>entry.sku===safe.sku);
    if(existing)Object.assign(existing,safe,{quantity:clamp(existing.quantity+clamp(quantity))});else items.push({...safe,quantity:clamp(quantity)});
    return write(items);
  }
  function update(sku,quantity){const items=read(),item=items.find(entry=>entry.sku===sku);if(item)item.quantity=clamp(quantity);return write(items)}
  function remove(sku){return write(read().filter(item=>item.sku!==sku))}
  function clear(){return write([])}
  function count(items=read()){return items.reduce((sum,item)=>sum+item.quantity,0)}
  function subtotal(items=read()){return items.reduce((sum,item)=>sum+item.unitAmount*item.quantity,0)}
  function subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)}
  window.AURACart={read,write,add,update,remove,clear,count,subtotal,subscribe,updateBadges};
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>updateBadges(),{once:true}):updateBadges();
})();
