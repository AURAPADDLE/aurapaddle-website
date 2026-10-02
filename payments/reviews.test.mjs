import assert from "node:assert/strict";
import test from "node:test";
import {ensureReviewState,moderateReview,publicReviewData,renderReviews,submitReview} from "./reviews.mjs";

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
