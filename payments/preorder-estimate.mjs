const BRISBANE_TIME_ZONE="Australia/Brisbane";
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];

function dateParts(now){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:BRISBANE_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(now));
  return Object.fromEntries(parts.filter(part=>part.type!=="literal").map(part=>[part.type,Number(part.value)]));
}

export function estimatedDispatchFromPayment(now=Date.now(),leadTimeWeeks=10){
  const {year,month,day}=dateParts(now);
  const date=new Date(Date.UTC(year,month-1,day+Number(leadTimeWeeks)*7));
  const iso=date.toISOString().slice(0,10);
  const display=`${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return {iso,display,merchantTimestamp:`${iso}T00:00:00+10:00`,timeZone:BRISBANE_TIME_ZONE,leadTimeWeeks:Number(leadTimeWeeks)};
}

export function estimatedDispatchCopy(estimate){
  return `Approximately ${estimate.leadTimeWeeks} weeks after successful initial payment · If the initial payment is completed today, estimated dispatch is ${estimate.display}`;
}

export function withRollingPreorderEstimate(variant,now=Date.now()){
  const campaign=variant?.campaign||variant?.preorder;
  if(variant?.orderMode!=="preorder"||campaign?.estimatedDispatchBasis!=="initial_payment_received"||!campaign?.leadTimeWeeks)return variant;
  const estimate=estimatedDispatchFromPayment(now,campaign.leadTimeWeeks);
  const key=variant.campaign?"campaign":"preorder";
  return {...variant,[key]:{...campaign,estimatedDelivery:estimatedDispatchCopy(estimate),estimatedDispatchDate:estimate.iso,availabilityDate:estimate.merchantTimestamp}};
}

export function renderRollingPreorderAvailability(markup,{feed=false,now=Date.now()}={}){
  const estimate=estimatedDispatchFromPayment(now,10),copy=estimatedDispatchCopy(estimate);
  if(feed)return markup.replace(/<item>[\s\S]*?<\/item>/g,item=>{
    if(!/<g:availability>preorder<\/g:availability>/.test(item))return item.replace(/<g:availability_date>.*?<\/g:availability_date>/g,"");
    return item.replace(/<g:availability_date>.*?<\/g:availability_date>/g,"").replace("</g:availability>",`</g:availability><g:availability_date>${estimate.merchantTimestamp}</g:availability_date>`);
  });
  let result=markup.replace(/(<span id="preorderDelivery">)[^<]*(<\/span>)/,`$1${copy}$2`);
  result=result.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/,(_all,raw)=>{
    const json=JSON.parse(raw);
    const walk=value=>{if(!value||typeof value!=="object")return;if(value["@type"]==="Offer"&&value.availability==="https://schema.org/PreOrder")value.availabilityStarts=estimate.merchantTimestamp;for(const child of Object.values(value))walk(child)};
    walk(json);
    return `<script type="application/ld+json">${JSON.stringify(json)}</script>`;
  });
  result=result.replace(/<script id="product-data" type="application\/json">([\s\S]*?)<\/script>/,(_all,raw)=>{
    const data=JSON.parse(raw);
    data.variants=(data.variants||[]).map(variant=>withRollingPreorderEstimate(variant,now));
    return `<script id="product-data" type="application/json">${JSON.stringify(data).replaceAll("<","\\u003c")}</script>`;
  });
  return result;
}
