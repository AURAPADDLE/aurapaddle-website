import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {publicReviewData,renderReviews} from "../payments/reviews.mjs";

// Update checked-in generated pages without rebuilding unrelated prices, feeds or product copy.
const siteDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const productsDir=path.join(siteDir,"products");
for(const filename of fs.readdirSync(productsDir).filter(name=>/^[a-z0-9-]+\.html$/.test(name))){
  const file=path.join(productsDir,filename),slug=path.basename(filename,".html");
  let html=fs.readFileSync(file,"utf8");
  if(html.includes("<!-- AURA_REVIEW_RATING_START -->")){
    fs.writeFileSync(file,renderReviews(html.replace('product-page.css?v=20260920-gallery-zoom','product-page.css?v=20261002-reviews'),publicReviewData({},slug)));
    continue;
  }
  html=html.replace(/<a class="product-rating-link"[\s\S]*?<\/a>\s*/,"")
    .replace(/<div class="review-score-summary"[\s\S]*?<\/div>\s*/,"")
    .replace(/<article class="reviews-summary(?: published-review)?"[\s\S]*?<\/article>/,'<!-- AURA_REVIEW_LIST_START --><!-- AURA_REVIEW_LIST_END -->')
    .replace('<p class="price-note" id="priceNote">','<!-- AURA_REVIEW_RATING_START --><!-- AURA_REVIEW_RATING_END --><p class="price-note" id="priceNote">')
    .replace('<div class="reviews-grid">','<!-- AURA_REVIEW_SUMMARY_START --><!-- AURA_REVIEW_SUMMARY_END --><div class="reviews-grid">')
    .replace('action="https://formspree.io/f/xaqrowoy"','action="/api/reviews"')
    .replace('product-page.css?v=20260920-gallery-zoom','product-page.css?v=20261002-reviews')
    .replace('product-page.js?v=20260917-instock','product-page.js?v=20261002-reviews');
  for(const key of ["RATING","SUMMARY","LIST"]){
    if(!html.includes(`<!-- AURA_REVIEW_${key}_START -->`))throw new Error(`${filename} has no ${key} slot`);
  }
  fs.writeFileSync(file,renderReviews(html,publicReviewData({},slug)));
}
