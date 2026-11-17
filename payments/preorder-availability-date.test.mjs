import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {estimatedDispatchFromPayment,renderRollingPreorderAvailability,withRollingPreorderEstimate} from "./preorder-estimate.mjs";
import {renderCoastGoFeed} from "./coastgo-content.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const candidateNow=Date.parse("2026-11-17T14:00:00Z");
const expected="2027-01-27T00:00:00+10:00";

test("rolling estimate uses the Australia/Brisbane calendar date",()=>{
  assert.deepEqual(estimatedDispatchFromPayment("2026-11-17T13:59:59Z"),{iso:"2027-01-26",display:"26 January 2027",merchantTimestamp:"2027-01-26T00:00:00+10:00",timeZone:"Australia/Brisbane",leadTimeWeeks:10});
  assert.deepEqual(estimatedDispatchFromPayment("2026-11-17T14:00:00Z"),{iso:"2027-01-27",display:"27 January 2027",merchantTimestamp:expected,timeZone:"Australia/Brisbane",leadTimeWeeks:10});
});

test("request-time feed rendering crosses Brisbane midnight without a deployment",()=>{
  const raw='<item><g:id>AP505002</g:id><g:availability>preorder</g:availability><g:availability_date>2027-01-26T00:00:00+10:00</g:availability_date></item><item><g:id>AP734955</g:id><g:availability>in_stock</g:availability></item>';
  assert.match(renderRollingPreorderAvailability(raw,{feed:true,now:"2026-11-17T13:59:59Z"}),/2027-01-26T00:00:00\+10:00/);
  const after=renderRollingPreorderAvailability(raw,{feed:true,now:"2026-11-17T14:00:00Z"});
  assert.match(after,/2027-01-27T00:00:00\+10:00/);
  assert.equal((after.match(/availability_date/g)||[]).length,2);
  assert.doesNotMatch(after,/<g:id>AP734955<\/g:id>[\s\S]*?<g:availability_date>/);
});

test("checkout snapshots the estimate from the successful-payment calendar day",()=>{
  const source={sku:"AP505002",orderMode:"preorder",campaign:{leadTimeWeeks:10,estimatedDispatchBasis:"initial_payment_received",estimatedDelivery:"stale"}};
  const before=withRollingPreorderEstimate(source,"2026-11-17T13:59:59Z"),after=withRollingPreorderEstimate(source,"2026-11-17T14:00:00Z");
  assert.equal(before.campaign.estimatedDispatchDate,"2027-01-26");
  assert.equal(after.campaign.estimatedDispatchDate,"2027-01-27");
  assert.match(after.campaign.estimatedDelivery,/If the initial payment is completed today, estimated dispatch is 27 January 2027/);
});

test("feed and landing-page structured offers publish one estimate for every preorder",()=>{
  const feed=renderRollingPreorderAvailability(renderCoastGoFeed(fs.readFileSync(path.join(root,"merchant-feed.xml"),"utf8"),candidateNow),{feed:true,now:candidateNow});
  const items=[...feed.matchAll(/<item>[\s\S]*?<\/item>/g)].map(match=>match[0]);
  const preorder=items.filter(item=>item.includes("<g:availability>preorder</g:availability>"));
  const inStock=items.filter(item=>item.includes("<g:availability>in_stock</g:availability>"));
  assert.equal(items.length,77);
  assert.equal(preorder.length,73);
  assert.equal(inStock.length,4);
  assert.ok(preorder.every(item=>item.includes(`<g:availability_date>${expected}</g:availability_date>`)));
  assert.ok(inStock.every(item=>!item.includes("<g:availability_date>")));
  for(const sku of ["AP505002","AP233694","AP587273","AP881762","AP020612","AP912342"]){
    const item=items.find(value=>value.includes(`<g:id>${sku}</g:id>`));
    assert.ok(item,`missing ${sku}`);
    assert.ok(item.includes(`<g:availability_date>${expected}</g:availability_date>`),sku);
  }

  let structuredPreorders=0,structuredInStock=0;
  for(const file of fs.readdirSync(path.join(root,"products")).filter(file=>file.endsWith(".html"))){
    const html=renderRollingPreorderAvailability(fs.readFileSync(path.join(root,"products",file),"utf8"),{now:candidateNow});
    const raw=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    if(!raw)continue;
    const json=JSON.parse(raw),group=json["@graph"]?.find(node=>node["@type"]==="ProductGroup");
    for(const variant of group?.hasVariant||[]){
      if(variant.offers?.availability==="https://schema.org/PreOrder"){
        structuredPreorders++;
        assert.equal(variant.offers.availabilityStarts,expected,variant.sku);
      }else if(variant.offers?.availability==="https://schema.org/InStock"){
        structuredInStock++;
        assert.notEqual(variant.offers.availabilityStarts,expected,variant.sku);
      }
    }
  }
  assert.equal(structuredPreorders,73);
  assert.equal(structuredInStock,4);
});

test("representative preorder landing pages show the estimate without retired batch copy",()=>{
  const expectedCopy=/Approximately 10 weeks after successful initial payment · If the initial payment is completed today, estimated dispatch is 27 January 2027/;
  for(const file of ["yoga-cruiser.html","touring-performance.html","wayfinder.html","angler-fishing.html"]){
    const html=renderRollingPreorderAvailability(fs.readFileSync(path.join(root,"products",file),"utf8"),{now:candidateNow});
    assert.match(html,expectedCopy,file);
    assert.doesNotMatch(html,/shared 50|50-board|50 boards|30 January 2027/i,file);
  }
});
