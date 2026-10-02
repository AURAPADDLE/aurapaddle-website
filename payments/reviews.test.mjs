import assert from "node:assert/strict";
import test from "node:test";
import {adminReviewData,attachReviewEmail,ensureReviewState,moderateReview,publicReviewData,renderReviews,submitReview} from "./reviews.mjs";

const catalog={bySku:new Map([["AP734955",{slug:"yoga-cruiser"}],["AP081165",{slug:"coast-go"}]])};
const input={slug:"coast-go",product_sku:"AP081165",reviewer_name:"Alex",reviewer_email:"alex@example.com",rating:"4",review_title:"Great first board",review_body:"Stable and easy to paddle on our weekend trip.",publication_consent:"yes"};

test("new reviews are private until moderated; the public view excludes emails",()=>{
  const state={};ensureReviewState(state);
  const {id}=submitReview(state,input,catalog);
  assert.equal(state.reviews[id].status,"pending");
  assert.equal(state.reviewNotificationOutbox[id].status,"pending");
  assert.equal(publicReviewData(state,"coast-go").count,0);
  moderateReview(state,{id,status:"published"});
  const result=publicReviewData(state,"coast-go");
  assert.equal(result.count,1);assert.equal(result.average,4);
  assert.equal(result.reviews[0].email,undefined);
  moderateReview(state,{id,status:"rejected"});
  assert.equal(publicReviewData(state,"coast-go").count,0);
});

test("ratings are calculated from all published reviews, never hardcoded",()=>{
  const state={};ensureReviewState(state);
  const id=submitReview(state,{...input,slug:"yoga-cruiser",product_sku:"AP734955",rating:"3"},catalog).id;
  moderateReview(state,{id,status:"published"});
  const data=publicReviewData(state,"yoga-cruiser");
  assert.equal(data.count,2);assert.equal(data.average,4);
});

test("invalid product and unconsented reviews are not stored",()=>{
  const state={};
  assert.throws(()=>submitReview(state,{...input,slug:"yoga-cruiser"},catalog));
  assert.throws(()=>submitReview(state,{...input,publication_consent:""},catalog));
  assert.equal(Object.keys(state.reviews||{}).length,0);
});

test("admin queue links only a paid matching email, SKU and supplied order number",()=>{
  const state={orders:{paid:{orderNumber:"APO12345",customerEmail:"ALEX@example.com",customerName:"Alex Buyer",customerPhone:"0400000000",items:[{sku:"AP081165"}],initialPaymentStatus:"paid",amountTotal:29900,amountRefunded:0,fulfilmentStatus:"dispatched"},other:{orderNumber:"APO99999",customerEmail:"alex@example.com",items:[{sku:"AP734955"}],initialPaymentStatus:"paid",amountTotal:74900}}};
  const id=submitReview(state,{...input,order_number:"apo12345"},catalog).id;
  const [review]=adminReviewData(state).filter(item=>item.id===id);
  assert.equal(review.orderNumber,"APO12345");
  assert.equal(review.orderVerification,"matched");
  assert.deepEqual(review.orderMatches.map(order=>order.orderNumber),["APO12345"]);
  assert.equal(review.orderMatches[0].customerPhone,"0400000000");
  moderateReview(state,{id,status:"published"});
  const publicData=publicReviewData(state,"coast-go");
  assert.equal(publicData.reviews[0].orderNumber,undefined);
  assert.equal(publicData.reviews[0].email,undefined);
  assert.equal(publicData.reviews[0].customerPhone,undefined);
});

test("unmatched and legacy reviews are not claimed as verified purchases",()=>{
  const state={orders:{one:{orderNumber:"APO12345",customerEmail:"other@example.com",items:[{sku:"AP081165"}],initialPaymentStatus:"paid",amountTotal:29900}}};
  const id=submitReview(state,{...input,order_number:"APO12345"},catalog).id;
  assert.equal(adminReviewData(state).find(item=>item.id===id).orderVerification,"not_matched");
  assert.equal(adminReviewData(state).find(item=>item.id==="legacy-yoga-oscar-20261002").orderVerification,"no_email");
  assert.throws(()=>submitReview(state,{...input,order_number:"12345"},catalog));
});

test("original contact can be added to a legacy review without exposing it publicly",()=>{
  const state={orders:{one:{orderNumber:"APO94961",customerEmail:"oscar@example.com",items:[{sku:"AP734955"}],initialPaymentStatus:"paid",paymentStage:"initial_50_percent",balancePaymentStatus:"not_requested",amountTotal:37450}}};
  const review=attachReviewEmail(state,{id:"legacy-yoga-oscar-20261002",email:"Oscar@Example.com"});
  assert.equal(review.email,"oscar@example.com");
  assert.equal(adminReviewData(state).find(item=>item.id===review.id).orderMatches[0].orderNumber,"APO94961");
  assert.equal(publicReviewData(state,"yoga-cruiser").reviews[0].email,undefined);
  assert.throws(()=>attachReviewEmail(state,{id:review.id,email:"another@example.com"}));
});

test("review markup escapes customer text",()=>{
  const state={};ensureReviewState(state);
  const id=submitReview(state,{...input,review_title:"<script>bad</script>"},catalog).id;
  moderateReview(state,{id,status:"published"});
  const template='<!-- AURA_REVIEW_RATING_START --><!-- AURA_REVIEW_RATING_END --><!-- AURA_REVIEW_SUMMARY_START --><!-- AURA_REVIEW_SUMMARY_END --><!-- AURA_REVIEW_LIST_START --><!-- AURA_REVIEW_LIST_END -->';
  const html=renderReviews(template,publicReviewData(state,"coast-go"));
  assert.match(html,/&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/4\.0/);
});
