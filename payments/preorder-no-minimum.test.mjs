import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {applyStripeEvent,loadCatalog,normaliseCheckoutItems,reserveCheckoutIdentity} from "./lib.mjs";

const siteDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const catalog=loadCatalog(new URL("catalog.json",import.meta.url));

test("all current preorders use the versioned no-minimum terms",()=>{
  const preorders=catalog.variants.filter(item=>item.orderMode==="preorder");
  assert.equal(preorders.length,74);
  const campaignPreorders=preorders.filter(item=>item.campaign);
  assert.equal(campaignPreorders.length,73);
  for(const variant of campaignPreorders){
    assert.equal(variant.campaign.thresholdRequired,false,variant.sku);
    assert.equal(variant.campaign.target,0,variant.sku);
    assert.equal(variant.campaign.deadlineISO,"",variant.sku);
    assert.equal(variant.campaign.termsVersion,"preorder-no-minimum-v1",variant.sku);
    assert.equal(variant.campaign.leadTimeWeeks,10,variant.sku);
    assert.equal(variant.campaign.estimatedDispatchBasis,"initial_payment_received",variant.sku);
  }
});

test("regular checkout freezes terms before payment and the paid order keeps that snapshot",()=>{
  const state={},items=normaliseCheckoutItems([{sku:"AP505002",quantity:1}],catalog,Date.parse("2026-11-16T00:00:00Z"));
  const identity=reserveCheckoutIdentity(state,{requestId:"terms-snapshot-1",items,now:1773619200,randomInt:()=>12345,randomBytes:size=>Buffer.alloc(size,1)});
  assert.equal(state.checkoutRequests["terms-snapshot-1"].cartItems[0].preorderTerms.version,"preorder-no-minimum-v1");
  catalog.bySku.get("AP505002").campaign.estimatedDelivery="MUTATED CATALOGUE VALUE";
  applyStripeEvent(state,{id:"evt_terms",type:"checkout.session.completed",created:1773619300,data:{object:{id:"cs_terms",created:1773619250,payment_status:"paid",amount_total:37450,currency:"aud",metadata:{aura_order_number:identity.orderNumber,aura_tracking_token:identity.trackingToken,aura_items:"AP505002:1",aura_invoice_lines:"AP505002:1:74900",aura_order_mode:"preorder",aura_payment_stage:"initial_50_percent"}}}});
  const terms=state.orders.cs_terms.items[0].preorderTerms;
  assert.equal(terms.estimatedDispatch,"Approximately 10 weeks after successful initial payment");
  assert.equal(terms.capturedAt,1773619200);
});

test("public pages no longer expose production counters while support preserves historical terms",()=>{
  const homepage=fs.readFileSync(path.join(siteDir,"index.html"),"utf8");
  const shopScript=fs.readFileSync(path.join(siteDir,"shop-progress.js"),"utf8");
  const preorderGuide=fs.readFileSync(path.join(siteDir,"pre-order/index.html"),"utf8");
  const support=fs.readFileSync(path.join(siteDir,"support/index.html"),"utf8");
  const policies=fs.readFileSync(path.join(siteDir,"policies/index.html"),"utf8");
  const yoga=fs.readFileSync(path.join(siteDir,"products/yoga-cruiser.html"),"utf8");
  assert.doesNotMatch(homepage,/data-hero-batch|\/api\/preorder-progress/);
  assert.doesNotMatch(shopScript,/\/api\/preorder-progress|progressbar/);
  assert.match(preorderGuide,/no shared minimum quantity/i);
  assert.doesNotMatch(support,/production thresholds/i);
  assert.match(support,/approximately 10-week dispatch estimate/i);
  assert.match(policies,/Existing paid orders and confirmed quotes/);
  assert.match(policies,/approximately 10 weeks after successful initial payment/i);
  assert.match(yoga,/No shared production target\./);
  assert.doesNotMatch(yoga,/shared batch reaches 50 boards|50 boards unlock/i);
  assert.match(support,/50% initial payment/);
  assert.match(fs.readFileSync(path.join(siteDir,"product-page.js"),"utf8"),/Other colours: no-minimum pre-order/);
  assert.doesNotMatch(fs.readFileSync(path.join(siteDir,"product-page.js"),"utf8"),/conditional shared production batch/);
  assert.match(support,/no-minimum production allocation/i);
  assert.match(preorderGuide,/meta property="og:description"[^>]*no shared minimum/i);
});
