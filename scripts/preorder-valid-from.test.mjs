import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const siteDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");

function productOffers(){
  return fs.readdirSync(path.join(siteDir,"products"))
    .filter(file=>file.endsWith(".html")&&!file.includes(" 2"))
    .flatMap(file=>{
      const html=fs.readFileSync(path.join(siteDir,"products",file),"utf8");
      const match=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if(!match)return [];
      const graph=JSON.parse(match[1])["@graph"]||[];
      const group=graph.find(node=>node["@type"]==="ProductGroup");
      return (group?.hasVariant||[]).filter(variant=>variant.offers).map(variant=>({file,variant}));
    });
}

test("all current pre-order offers start on the owner-confirmed date",()=>{
  const offers=productOffers();
  const preorders=offers.filter(({variant})=>variant.offers.availability==="https://schema.org/PreOrder");
  assert.equal(preorders.length,73,"expected the complete current pre-order offer catalogue");
  for(const {file,variant} of preorders){
    assert.equal(variant.offers.validFrom,"2026-10-01",`${file} ${variant.sku}`);
  }
});

test("in-stock offers remain without validFrom",()=>{
  const inStock=productOffers().filter(({variant})=>variant.offers.availability==="https://schema.org/InStock");
  assert.equal(inStock.length,4,"expected the complete current in-stock offer catalogue");
  for(const {file,variant} of inStock){
    assert.equal("validFrom" in variant.offers,false,`${file} ${variant.sku}`);
  }
});
