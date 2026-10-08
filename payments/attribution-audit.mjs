// Read-only diagnostics. This does not send events or reconstruct missing consent.
const touchView=touch=>touch?Object.fromEntries(["source","medium","campaign","landingPath","referrerHost","evidence","capturedAt"].filter(key=>touch[key]).map(key=>[key,touch[key]])):null;

export function orderAttributionAudit(order,state,{configured,serverEventsEnabled,validationMode}={}){
  const attribution=order.attribution||{},consent=attribution.consent||{},entry=state.analyticsOutbox?.[`purchase:${order.orderNumber}`];
  const allowed=consent.analytics===true||consent.marketing===true;
  let status,reason,attention=false;
  if(entry?.status==="sent"){
    status="sent_unverified";reason="HTTP delivery succeeded; GA4 reporting and Ads attribution still require reconciliation.";
  }else if(entry?.status==="validated"){
    status="validation_only";reason="Validated only; no production purchase was sent.";attention=true;
  }else if(entry?.status==="failed"){
    status="failed";reason="Delivery retries exhausted; review server logs before retrying.";attention=true;
  }else if(!allowed){
    status="not_sent_consent";reason="No optional measurement consent was recorded. Do not backfill identifiers or force an Ads conversion.";
  }else if(!attribution.analyticsClientId){
    status="not_sent_missing_client";reason="No Google tag client ID was captured; source cannot be joined reliably.";attention=true;
  }else if(configured===false||serverEventsEnabled===false){
    status="configuration_blocked";reason="Server-side GA4 delivery is disabled or not configured.";attention=true;
  }else if(entry){
    status=["pending","retry","sending"].includes(entry.status)?entry.status:"unknown_delivery_status";
    reason=validationMode?"Queued for validation only; not for production reporting.":"Purchase is awaiting delivery or retry.";
    attention=status!=="pending"||validationMode===true;
  }else if(order.initialPaymentStatus==="paid"){
    status="not_queued";reason="Paid order has consent and a client ID but no purchase queue record. Investigate webhook processing.";attention=true;
  }else{
    status="not_paid";reason="No confirmed initial payment on this order.";
  }
  const last=consent.analytics===true?touchView(attribution.last):null;
  return {
    first:consent.analytics===true?touchView(attribution.first):null,last,
    consent:{analytics:consent.analytics===true,marketing:consent.marketing===true},
    sourceStatus:!allowed?"unknown_no_consent":last?.source==="direct"?"direct_or_unknown":last?.source?"recorded_source":"unknown",
    googleClickIdPresent:consent.marketing===true&&Boolean(attribution.last?.clickId),
    clientIdPresent:allowed&&Boolean(attribution.analyticsClientId),sessionIdPresent:allowed&&Boolean(attribution.analyticsSessionId),
    purchase:{status,reason,attention,attempts:Number(entry?.attempts||0),sentAt:Number(entry?.sentAt||0),validatedAt:Number(entry?.validatedAt||0)},
    adsAttribution:"unverified"
  };
}

export function markAnalyticsDelivery(entry,{validationMode=false,now=Math.floor(Date.now()/1000)}={}){
  if(!entry)return;
  entry.status=validationMode?"validated":"sent";
  if(validationMode){entry.validatedAt=now;delete entry.sentAt}
  else{entry.sentAt=now;delete entry.validatedAt}
  delete entry.lastError;delete entry.claimedAt;
}
