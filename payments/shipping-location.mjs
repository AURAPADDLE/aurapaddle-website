const AU_STATES=new Set(["ACT","NSW","NT","QLD","SA","TAS","VIC","WA"]);

const cleanText=value=>String(value||"").trim().replace(/\s+/g," ");
const keyText=value=>cleanText(value).toUpperCase().replace(/[^A-Z0-9 ]/g,"");

export function normaliseDeliveryLocation(input={}){
  const suburb=cleanText(input.suburb||input.city).slice(0,80);
  const state=keyText(input.state).slice(0,3);
  const postcode=cleanText(input.postcode||input.postalCode).replace(/\s/g,"");
  if(!suburb)throw new Error("Enter the delivery suburb.");
  if(!AU_STATES.has(state))throw new Error("Select a valid Australian state or territory.");
  if(!/^\d{4}$/.test(postcode))throw new Error("Enter a valid 4-digit Australian postcode.");
  return {suburb,state,postcode,country:"AU"};
}

export function deliveryLocationKey(input){
  const value=normaliseDeliveryLocation(input);
  return `${value.postcode}|${value.state}|${keyText(value.suburb)}`;
}

export function validateCoverageTable(table,rates){
  if(!table||!["draft","approved"].includes(table.status)||!Array.isArray(table.locations))throw new Error("Shipping coverage table must declare draft or approved status.");
  const seen=new Set();
  for(const entry of table.locations){
    const key=deliveryLocationKey(entry);
    if(seen.has(key))throw new Error(`Duplicate shipping coverage location: ${key}`);
    seen.add(key);
    if(entry.reviewed!==true||!entry.source||!entry.effectiveFrom)throw new Error(`Unreviewed AURA shipping geography entry: ${key}`);
    for(const field of ["yogaRegionId","coastGoRegionId"]){
      const region=rates.byId.get(entry[field]);
      if(!region||region.aliasTo)throw new Error(`Unknown ${field} for ${key}: ${entry[field]}`);
    }
    if(typeof entry.freeShippingEligible!=="boolean"||typeof entry.coastGoExpressEligible!=="boolean")throw new Error(`Incomplete AURA shipping classification: ${key}`);
  }
  return table;
}

export function assertShippingValidationConfiguration(mode,table){
  if(!["off","draft","enforced"].includes(mode))throw new Error("SHIPPING_LOCATION_VALIDATION_MODE must be off, draft or enforced.");
  if(mode==="enforced"&&(table?.status!=="approved"||!table?.locations?.length))throw new Error("Enforced shipping validation requires a non-empty approved carrier coverage table.");
  return {mode,coverageStatus:table?.status||"missing",reviewedLocations:table?.locations?.length||0};
}

export function resolveDeliveryLocation(input,table,rates){
  let location;
  try{location=normaliseDeliveryLocation(input)}catch(error){return {status:"invalid",quoteRequired:true,error:error.message,location:null,coverageVersion:table?.version||"draft-unversioned"}}
  const key=deliveryLocationKey(location);
  const matches=(table?.locations||[]).filter(entry=>deliveryLocationKey(entry)===key&&entry.reviewed===true);
  if(matches.length!==1)return {status:matches.length?"ambiguous":"manual_quote",quoteRequired:true,location,coverageVersion:table?.version||"draft-unversioned"};
  const match=matches[0];
  if(!rates.byId.get(match.yogaRegionId)||!rates.byId.get(match.coastGoRegionId))return {status:"manual_quote",quoteRequired:true,location,coverageVersion:table?.version||"draft-unversioned"};
  return {status:"verified",quoteRequired:false,location,coverageVersion:table.version,source:match.source,effectiveFrom:match.effectiveFrom,auraArea:match.auraArea,auraAreaLabel:match.auraAreaLabel,yogaRegionId:match.yogaRegionId,coastGoRegionId:match.coastGoRegionId,coastGoExpressEligible:match.coastGoExpressEligible===true,freeShippingEligible:match.freeShippingEligible===true};
}

export function shippingRegionForItems(resolution,items,{deliveryService="standard"}={}){
  if(resolution?.status!=="verified")return null;
  const coastGo=items.filter(item=>item.variant?.slug==="coast-go").length;
  const yoga=items.filter(item=>item.variant?.slug==="yoga-cruiser").length;
  if(deliveryService==="express")return coastGo===items.length&&resolution.coastGoExpressEligible?"coastgo-express":null;
  if(deliveryService==="standard"&&coastGo+yoga===items.length&&resolution.coastGoRegionId===resolution.yogaRegionId)return resolution.yogaRegionId;
  return null;
}

export function compareDeliveryLocation(expected,actual){
  try{return deliveryLocationKey(expected)===deliveryLocationKey(actual)}catch{return false}
}
