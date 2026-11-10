import crypto from 'node:crypto';
import {emailKey,recordNewsletterEvidence,createNewsletterDraft,newsletterTimestamp,newsletterDraftStatus} from './newsletter.mjs';
export const NEWSLETTER_CONSENT_VERSION='homepage-marketing-2026-11-v1';
export const NEWSLETTER_CONSENT_TEXT='I agree to receive marketing emails from AURA PADDLE. I can unsubscribe at any time. See the Privacy Policy.';
export const SIGNUP_RESPONSE={received:true,message:'Thank you. Your signup request has been recorded for review.'};
export function captureNewsletterSignup(state,input,now=new Date().toISOString()){
  if(!input||typeof input!=='object')throw new Error('Invalid signup.');
  const email=emailKey(input.email);
  if(input.marketing_consent!=='yes'||input.consent_version!==NEWSLETTER_CONSENT_VERSION)throw new Error('Please confirm the current newsletter consent choice.');
  if(typeof input.request_id!=='string'||!/^[a-f0-9-]{36}$/.test(input.request_id))throw new Error('Please reload the form before submitting.');
  if(typeof input._gotcha!=='string')throw new Error('Invalid signup.');
  if(input._gotcha)return SIGNUP_RESPONSE;
  const source='AURA homepage newsletter',sourceId=`web:${input.request_id}`,id=crypto.createHash('sha256').update(JSON.stringify([source,sourceId])).digest('hex'),existing=state.newsletter?.events?.[id];
  // Retry after an uncertain response must not create new evidence or update original timestamps.
  if(existing){if(existing.email!==email)throw new Error('Please reload the form before changing the signup.');return SIGNUP_RESPONSE}
  recordNewsletterEvidence(state,{email:input.email,source,sourceId,at:now,status:'pending_review',purpose:'newsletter',verified:false,consentText:NEWSLETTER_CONSENT_TEXT,textVersion:NEWSLETTER_CONSENT_VERSION,evidence:'Explicit marketing checkbox submitted on the first-party homepage form. Email ownership is unverified; pending review, not eligible for sending.',internal:false},now);
  return SIGNUP_RESPONSE;
}
export function renderNewsletterCapture(html,requestId){
  return html.replace(/(<form class="newsletter-form" id="newsletterForm" action=")https:\/\/formspree\.io\/f\/xaqrowoy(" method="post">)/,`$1/api/newsletter/subscribe$2<input type="hidden" name="request_id" value="${requestId}"><input type="hidden" name="consent_version" value="${NEWSLETTER_CONSENT_VERSION}">`);
}
// Only explicitly authored, published newsletter updates create drafts. Ordinary code deploys do not.
export function syncNewsletterUpdates(state,manifest,now=new Date().toISOString()){
  if(!manifest||manifest.schemaVersion!==1||!Array.isArray(manifest.updates)||manifest.updates.length>100)throw new Error('Invalid newsletter updates manifest.');
  const nowTime=Date.parse(newsletterTimestamp(now));
  const eligible=manifest.updates.filter(update=>update.newsletter===true&&update.status==='published');
  const staged=structuredClone(state),results=[],active=new Set();
  for(const update of eligible){
    const published=Date.parse(newsletterTimestamp(update.publishedAt));let expires;
    if(update.kind==='promotion'){
      expires=Date.parse(newsletterTimestamp(update.expiresAt));if(expires<=published)throw new Error('Promotions require a valid expiry after publication.');
    }
    if(published>nowTime||(expires!==undefined&&expires<=nowTime))continue;
    const result=createNewsletterDraft(staged,update,now),publicationFingerprint=crypto.createHash('sha256').update(JSON.stringify([update.publishedAt,update.expiresAt||null])).digest('hex');
    if(result.duplicate&&result.draft.publicationFingerprint!==publicationFingerprint)throw new Error('Publication timing changed without a new update version.');
    if(!result.duplicate){result.draft.trigger='published_update_manifest';result.draft.publishedAt=update.publishedAt;result.draft.expiresAt=update.expiresAt||null;result.draft.publicationFingerprint=publicationFingerprint}
    result.draft.status='awaiting_review';active.add(result.draft.id);results.push({id:result.draft.id,duplicate:result.duplicate});
  }
  for(const draft of Object.values(staged.newsletter?.drafts||{}))if(draft.trigger==='published_update_manifest'&&!active.has(draft.id)){
    const effective=newsletterDraftStatus(draft,now);draft.status=['expired','publication_metadata_invalid','not_yet_published'].includes(effective)?effective:'withdrawn_or_superseded';
  }
  // Validate the whole batch before committing any draft to the caller's transaction.
  if(staged.newsletter)state.newsletter=staged.newsletter;return results;
}
export function createSignupLimiter({now=()=>Date.now(),secret=crypto.randomBytes(32)}={}){
  const buckets=new Map();let lastCleanup=0;
  return {allow(address,email){const time=now();if(time-lastCleanup>60000){for(const [key,value] of buckets)if(value.until<=time)buckets.delete(key);lastCleanup=time}
    const digest=value=>crypto.createHmac('sha256',secret).update(value).digest('hex');
    const rules=[['global',500,3600000],[`ip:${digest(address)}`,30,3600000],[`email:${digest(email)}`,5,3600000]];
    if(buckets.size>10000)return false;
    for(const [key,limit] of rules){const bucket=buckets.get(key);if(bucket&&bucket.until>time&&bucket.count>=limit)return false}
    for(const [key,,duration] of rules){const bucket=buckets.get(key);if(!bucket||bucket.until<=time)buckets.set(key,{count:1,until:time+duration});else bucket.count++}return true;
  }};
}
