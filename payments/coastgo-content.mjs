import offer from "../coastgo-offer.js";

export function renderCoastGoFeed(xml,now=Date.now()){
  return xml.replace(/<item>[\s\S]*?<\/item>/g,item=>{
    if(!offer.isCoastGo(item.match(/<g:id>(.*?)<\/g:id>/)?.[1]))return item;
    return item.replace(/<g:availability>.*?<\/g:availability>/,`<g:availability>${offer.beforeLaunch(now)?"preorder":"in_stock"}</g:availability>`)
      .replace(/<g:availability_date>.*?<\/g:availability_date>/g,"")
      .replace("</g:availability>",`</g:availability>${offer.beforeLaunch(now)?`<g:availability_date>${offer.launchAt}</g:availability_date>`:""}`)
      .replace(/<g:price>.*?<\/g:price>/,"<g:price>299.00 AUD</g:price>")
      .replace(/<g:sale_price>.*?<\/g:sale_price>/,"<g:sale_price>289.00 AUD</g:sale_price>")
      .replace(/<g:sale_price_effective_date>.*?<\/g:sale_price_effective_date>/,"<g:sale_price_effective_date>2026-09-29T00:00:00+10:00/2026-10-08T23:59:59+10:00</g:sale_price_effective_date>");
  });
}

export function renderCoastGoPage(html,now=Date.now()){
  if(!html.includes('"slug":"coast-go"'))return html;
  const status=offer.beforeLaunch(now)?"Advance orders open · Official release 8 October":"Available to order";
  html=html.replace(/(<script id="product-data" type="application\/json">)([\s\S]*?)(<\/script>)/,(_,a,json,b)=>{
    const data=JSON.parse(json);data.variants=data.variants.map(v=>offer.variant(v,now));data.stock=offer.dispatch(now);data.status=status;return a+JSON.stringify(data)+b;
  }).replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g,(_,a,json,b)=>{
    const data=JSON.parse(json);
    function walk(value){if(!value||typeof value!=="object")return;if(offer.isCoastGo(value.sku)&&value.offers){value.offers.price=offer.price(now)/100;value.offers.availability=`https://schema.org/${offer.beforeLaunch(now)?"PreOrder":"InStock"}`;value.offers.availabilityStarts=offer.launchAt;}Object.values(value).forEach(child=>typeof child==="object"&&walk(child));}
    walk(data);return a+JSON.stringify(data)+b;
  });
  const copy={availabilityText:status,productPrice:"AUD $299",originalPrice:"RRP AUD $349",priceNote:"New-product price · Pay in full · Shipping additional",stockCopy:offer.dispatch(now),preorderTermsBody:`${offer.offer(now)} ${offer.dispatch(now)} New orders are paid in full, including shipping; no remaining product balance is due. See the returns policy. Australian Consumer Law rights are not limited.`};
  for(const [id,text] of Object.entries(copy))html=html.replace(new RegExp(`(<[^>]+id="${id}"[^>]*>)[^<]*(<)`),(_,a,b)=>a+text+b);
  return html.replace("Pre-order terms <span>","Order & release terms <span>")
    .replace("Australia-wide shipping is confirmed and included with the remaining-balance request before dispatch.","Published shipping is paid in full at checkout. Standard transit: 21–40 days; eligible-region express: 7–11 days, excluding preparation.");
}
