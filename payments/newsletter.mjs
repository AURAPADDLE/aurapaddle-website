// Private review-only newsletter ledger. Deliberately has no mail provider or outbox.
import crypto from 'node:crypto';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function text(value,max=500,label='Text'){
  if(value===undefined)value='';
  if(typeof value!=='string')throw new Error(`${label} must be a string.`);
  if(value.length>max)throw new Error(`${label} exceeds ${max} characters; shorten it explicitly or use an evidence reference. Nothing was saved.`);
  return value;
}
function flag(value,label){if(value!==undefined&&typeof value!=='boolean')throw new Error(`${label} must be a boolean.`);return value===true}
const present=value=>value.trim().length>0;
export function emailKey(value){const email=text(value,254,'Email').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('A valid email is required.');return email}
function ledger(state){return state.newsletter??={contacts:{},events:{},drafts:{}}}
export function newsletterTimestamp(value){
  const raw=text(value,40,'Timestamp'),parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(raw),date=new Date(raw);
  if(!parts||Number.isNaN(date.valueOf()))throw new Error('A valid evidence timestamp is required.');
  const [year,month,day,hour,minute,second]=parts.slice(1).map(Number),calendar=new Date(Date.UTC(year,month-1,day));
  if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day||hour>23||minute>59||second>59)throw new Error('A valid evidence timestamp is required.');
  return date.toISOString();
}
function internal(email,state,contact){return contact?.internal===true||/@(aurapaddle\.com|example\.(com|org|net))$/.test(email)||Object.values(state.orders||{}).some(o=>o.internalTest===true&&String(o.customerEmail||'').trim().toLowerCase()===email)}
export function recordNewsletterEvidence(state,input,now=new Date().toISOString()){
  const email=emailKey(input.email),source=text(input.source,100),sourceId=text(input.sourceId,200),evidence=text(input.evidence,2000),consentText=text(input.consentText,2000),at=newsletterTimestamp(input.at);
  if(!present(source)||!present(sourceId)||!present(evidence))throw new Error('Source, source record ID and evidence are required.');
  const status=text(input.status,30);if(!['subscribed','unsubscribed','unknown','pending_review'].includes(status))throw new Error('Invalid consent status.');
  if(status==='subscribed'&&(input.purpose!=='newsletter'||input.verified!==true||!present(consentText)||!present(text(input.textVersion,100))))throw new Error('Newsletter consent must be verified with exact consent text and version.');
  const data=ledger(state),id=hash(JSON.stringify([source,sourceId])),payload={email,originalEmail:input.email,source,sourceId,evidence,consentText,at,originalAt:input.at,status,purpose:text(input.purpose,60),verified:flag(input.verified,'Verified'),textVersion:text(input.textVersion,100),internal:flag(input.internal,'Internal')};
  if(data.events[id]){if(data.events[id].fingerprint!==hash(JSON.stringify(payload)))throw new Error('Source record already exists with different evidence.');return {duplicate:true,contact:data.contacts[hash(email)]}}
  const key=hash(email),contact=data.contacts[key]??={id:key,email,status:'unknown',internal:false,eventIds:[],createdAt:now};
  const event={...payload,id,recordedAt:now,fingerprint:hash(JSON.stringify(payload))};data.events[id]=event;contact.eventIds.push(id);contact.internal||=payload.internal;contact.updatedAt=now;
  // A historical import can never remove suppression. Re-subscription is a separate future workflow.
  if(status==='unsubscribed'){contact.status='unsubscribed';contact.suppressedAt=at}
  else if(contact.status!=='unsubscribed'&&!(status==='pending_review'&&contact.status==='subscribed')&&(!contact.consentAt||at>=contact.consentAt)){contact.status=status;contact.consentAt=at;contact.consentEventId=id}
  data.contacts[key]=contact;return {duplicate:false,contact};
}
export function newsletterAudience(state){const data=ledger(state),candidates=[],excluded=[];for(const contact of Object.values(data.contacts)){
  const event=data.events[contact.consentEventId];let reason='';
  if(internal(contact.email,state,contact))reason='internal_or_test';else if(contact.status==='unsubscribed')reason='unsubscribed';else if(contact.status!=='subscribed'||event?.purpose!=='newsletter'||!event?.verified)reason='newsletter_consent_not_verified';
  const entry={id:contact.id,email:contact.email,consentEventId:contact.consentEventId||null};if(reason)excluded.push({...entry,reason});else candidates.push(entry);
}return {candidates:candidates.sort((a,b)=>a.email.localeCompare(b.email)),excluded:excluded.sort((a,b)=>a.email.localeCompare(b.email))}}
export function createNewsletterDraft(state,input,now=new Date().toISOString()){
  const sourceId=text(input.sourceId,200),version=text(input.version,100),title=text(input.title,200),summary=text(input.summary,5000),kind=text(input.kind,40);
  if(!present(sourceId)||!present(version)||!present(title)||!present(summary)||!['website_update','promotion'].includes(kind))throw new Error('Publishable update requires source ID, version, kind, title and approved facts.');
  const originalUrl=text(input.url,2048,'URL');if(/[\r\n]/.test(originalUrl)||/[\r\n]/.test(title))throw new Error('Title and URL must each be a single line.');const url=new URL(originalUrl);if(url.protocol!=='https:'||!['www.aurapaddle.com','aurapaddle.com'].includes(url.hostname)||url.username||url.password)throw new Error('Use an HTTPS AURA website URL.');
  const data=ledger(state),id=hash(JSON.stringify([sourceId,version])),source={sourceId,version,title,summary,kind,url:url.href,originalUrl};
  if(data.drafts[id]){if(data.drafts[id].sourceFingerprint!==hash(JSON.stringify(source)))throw new Error('Source version already exists. Use a new version for changed content.');return {duplicate:true,draft:data.drafts[id]}}
  const audience=newsletterAudience(state),draft={id,...source,subject:title,body:`Hi there,\n\n${summary}\n\nFind out more: ${url.href}\n\nThe AURA PADDLE team\n\n[Sender postal address and newsletter unsubscribe link required before sending]`,status:'awaiting_review',sendingEnabled:false,createdAt:now,sourceFingerprint:hash(JSON.stringify(source)),audience,audienceFingerprint:hash(JSON.stringify(audience)),warning:'Draft only. Recipient consent must be rechecked at sending. Sender identity and unsubscribe must be configured. No sending is implemented.'};
  data.drafts[id]=draft;return {duplicate:false,draft};
}
export function newsletterDraftStatus(draft,now=new Date().toISOString()){
  if(draft.trigger!=='published_update_manifest')return draft.status;
  let current,published,expires;try{current=Date.parse(newsletterTimestamp(now));published=Date.parse(newsletterTimestamp(draft.publishedAt));if(draft.kind==='promotion')expires=Date.parse(newsletterTimestamp(draft.expiresAt))}catch{return 'publication_metadata_invalid'}
  if(draft.kind==='promotion'){
    if(!Number.isFinite(expires)||expires<=published)return 'publication_metadata_invalid';
    if(expires<=current)return 'expired';
  }
  if(published>current)return 'not_yet_published';
  return draft.status;
}
export function newsletterView(state,now=new Date().toISOString()){
  const data=ledger(state),audience=newsletterAudience(state),audienceFingerprint=hash(JSON.stringify(audience));
  return {sendingEnabled:false,contacts:Object.values(data.contacts),events:Object.values(data.events),drafts:Object.values(data.drafts).map(d=>({...d,recordedStatus:d.status,status:newsletterDraftStatus(d,now),currentAudience:audience,audienceChanged:d.audienceFingerprint!==audienceFingerprint})),audience};
}
