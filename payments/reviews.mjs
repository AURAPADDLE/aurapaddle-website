import crypto from "node:crypto";

// This review was already moderated and published before the shared review system existed.
export const initialReviews=[{
  id:"legacy-yoga-oscar-20261002",slug:"yoga-cruiser",sku:"AP734955",name:"Oscar",rating:5,
  title:"Yoga cruiser ISUP review",body:"The Aura Paddle Yoga iSUP is an absolute game-changer for anyone looking for maximum stability and family fun on the water. Here is why this inflatable stand-up paddleboard stands out:\n\n• Unmatched Stability: The board is super stable, making it incredibly easy to balance. Whether you are holding complex yoga poses or navigating choppy water, it feels rock-solid underfoot.\n\n• Perfectly Family Friendly: Thanks to its generous width and weight capacity, it easily fits multiple kids or a family pet onboard without tipping. It has quickly become our go-to board for family weekend adventures.\n\n• Premium Build & Comfort: The deck pad is incredibly soft and grippy, which is perfect for extended yoga sessions or when the kids are sitting down catching rides.\n\n• Easy Setup: It inflates quickly, feels as rigid as a hardboard once at full PSI, and packs down effortlessly into its carry bag. Highly recommended.",
  consent:true,status:"published",createdAt:"2026-10-02T00:19:00.000Z",publishedAt:"2026-10-02T00:19:00.000Z"
}];

const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const trim=(value,max)=>String(value??"").trim().slice(0,max);

export function ensureReviewState(state){
  state.reviews??={};
  for(const review of initialReviews)state.reviews[review.id]??={...review};
  return state.reviews;
}

export function submitReview(state,input,catalog){
  const slug=trim(input.slug,80),sku=trim(input.product_sku,32);
  const variant=catalog.bySku.get(sku);
  if(!variant||variant.slug!==slug)throw new Error("Choose a valid product before submitting a review.");
  const rating=Number(input.rating),name=trim(input.reviewer_name,80),email=trim(input.reviewer_email,254).toLowerCase(),title=trim(input.review_title,80),body=trim(input.review_body,1500);
  if(!Number.isInteger(rating)||rating<1||rating>5||name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||title.length<3||body.length<20||input.publication_consent!=="yes")throw new Error("Complete all review fields and publication consent.");
  // Honeypot is deliberately accepted without storing anything to avoid helping bots tune submissions.
  if(trim(input._gotcha,200))return {received:true};
  const now=new Date().toISOString(),id=crypto.randomUUID();
  ensureReviewState(state)[id]={id,slug,sku,name,email,rating,title,body,consent:true,status:"pending",createdAt:now};
  state.reviewNotificationOutbox??={};
  state.reviewNotificationOutbox[id]={key:id,status:"pending",attempts:0,nextAttemptAt:0};
  return {received:true,id};
}

export function moderateReview(state,{id,status}){
  const reviews=ensureReviewState(state),review=reviews[String(id||"")];
  if(!review)throw new Error("Review not found.");
  if(!["published","rejected"].includes(status))throw new Error("Invalid moderation action.");
  review.status=status;
  review.updatedAt=new Date().toISOString();
  if(status==="published")review.publishedAt??=review.updatedAt;
  return review;
}

export function publicReviewData(state,slug){
  const reviews=Object.values(ensureReviewState(state)).filter(review=>review.slug===slug&&review.status==="published"&&review.consent===true).sort((a,b)=>String(b.publishedAt||b.createdAt).localeCompare(String(a.publishedAt||a.createdAt)));
  const count=reviews.length,average=count?reviews.reduce((sum,review)=>sum+review.rating,0)/count:null;
  return {slug,count,average:average===null?null:Number(average.toFixed(1)),reviews:reviews.map(({id,name,rating,title,body,publishedAt,createdAt})=>({id,name,rating,title,body,publishedAt:publishedAt||createdAt}))};
}

function stars(rating){const rounded=Math.round(rating);return "★".repeat(rounded)+"☆".repeat(5-rounded)}
function date(value){return new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"long",year:"numeric",timeZone:"Australia/Brisbane"}).format(new Date(value))}
function reviewCard(review){
  return `<article class="reviews-summary published-review"><div class="individual-rating" aria-label="${review.rating} out of 5 stars"><span class="reviews-stars" aria-hidden="true">${stars(review.rating)}</span><strong>${review.rating}.0 <small>/ 5</small></strong></div><h3>${esc(review.title)}</h3><p class="review-meta">${esc(review.name)} · ${esc(date(review.publishedAt))}</p><blockquote>${esc(review.body).split(/\n\s*\n/).map(paragraph=>`<p>${paragraph.replaceAll("\n","<br>")}</p>`).join("")}</blockquote></article>`;
}
function replaceSlot(html,key,content){
  const open=`<!-- AURA_REVIEW_${key}_START -->`,close=`<!-- AURA_REVIEW_${key}_END -->`;
  const start=html.indexOf(open),end=html.indexOf(close,start+open.length);
  if(start<0||end<0)return html;
  return html.slice(0,start+open.length)+content+html.slice(end);
}

export function renderReviews(html,data){
  const {count,average,reviews}=data,plural=count===1?"review":"reviews",score=average?.toFixed(1);
  const rating=count?`<a class="product-rating-link" href="#reviews" aria-label="Rated ${score} out of 5 from ${count} customer ${plural}. Read reviews"><span class="rating-stars" aria-hidden="true">${stars(average)}</span><strong>${score} <span>/ 5</span></strong><span>${count} ${plural}</span><span class="rating-read">Read ${plural} →</span></a>`:"";
  const summary=count?`<div class="review-score-summary" aria-label="Overall rating: ${score} out of 5, based on ${count} customer ${plural}"><span class="review-score-label">Overall rating</span><strong>${score} <small>/ 5</small></strong><span class="rating-stars" aria-hidden="true">${stars(average)}</span><span class="review-score-count">${count} customer ${plural}</span></div>`:"";
  const cards=count?reviews.map(reviewCard).join(""):'<article class="reviews-summary"><div class="reviews-stars" aria-hidden="true">☆☆☆☆☆</div><h3>No published reviews yet</h3><p>Have you used this product? Be the first to submit a review for the AURA PADDLE team to moderate.</p><small>Submitting a review does not guarantee publication. AURA PADDLE may contact you to verify your experience.</small></article>';
  const list=`<div class="reviews-list">${cards}</div>`;
  return replaceSlot(replaceSlot(replaceSlot(html,"RATING",rating),"SUMMARY",summary),"LIST",list);
}
