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
  if(!table||table.status!=="draft"||!Array.isArray(table.locations))throw new Error("Shipping coverage table must remain a reviewed draft until carrier data is approved.");
  const seen=new Set();
  for(const entry of table.locations){
    const key=deliveryLocationKey(entry);
    if(seen.has(key))throw new Error(`Duplicate shipping coverage location: ${key}`);
    seen.add(key);
    const region=rates.byId.get(entry.regionId);
    if(!region||region.aliasTo)throw new Error(`Unknown shipping region for ${key}: ${entry.regionId}`);
    if(entry.reviewed!==true||!entry.source||!entry.effectiveFrom)throw new Error(`Unreviewed carrier coverage entry: ${key}`);
  }
  return table;
}

export function resolveDeliveryLocation(input,table,rates){
  let location;
  try{location=normaliseDeliveryLocation(input)}catch(error){return {status:"invalid",quoteRequired:true,error:error.message,location:null,coverageVersion:table?.version||"draft-unversioned"}}
  const key=deliveryLocationKey(location);
  const matches=(table?.locations||[]).filter(entry=>deliveryLocationKey(entry)===key&&entry.reviewed===true);
  if(matches.length!==1)return {status:matches.length?"ambiguous":"manual_quote",quoteRequired:true,location,coverageVersion:table?.version||"draft-unversioned"};
  const match=matches[0],region=rates.byId.get(match.regionId);
  if(!region)return {status:"manual_quote",quoteRequired:true,location,coverageVersion:table?.version||"draft-unversioned"};
  return {status:"verified",quoteRequired:false,location,regionId:region.id,coverageVersion:table.version,source:match.source,effectiveFrom:match.effectiveFrom};
}

export function compareDeliveryLocation(expected,actual){
  try{return deliveryLocationKey(expected)===deliveryLocationKey(actual)}catch{return false}
}
