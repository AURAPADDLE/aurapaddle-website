import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const collection=fs.readFileSync(new URL("../inflatable-paddle-boards/index.html",import.meta.url),"utf8");
const shop=fs.readFileSync(new URL("../shop/index.html",import.meta.url),"utf8");

test("inflatable SUP collection keeps its established search identity",()=>{
  assert.match(collection,/<title>Inflatable Paddle Boards Australia \| AURA PADDLE<\/title>/);
  assert.match(collection,/<h1>Inflatable Stand Up Paddle Boards<\/h1>/);
  assert.match(collection,/rel="canonical" href="https:\/\/www\.aurapaddle\.com\/inflatable-paddle-boards\/"/);
});

test("near-hero choices link the four verified use cases to their product pages",()=>{
  const choices={
    "products/coast-go.html":"all-round option",
    "products/yoga-cruiser.html":"widest deck here",
    "products/angler-fishing.html":"dedicated equipment mounts",
    "products/touring-performance.html":"tracking and distance",
  };
  for(const [path,description] of Object.entries(choices)){
    assert.match(collection,new RegExp(`href="\\.\\.\\/${path.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&")}"`));
    assert.match(collection,new RegExp(description));
  }
  assert.equal((collection.match(/<article class="card" data-product-card/g)||[]).length,4);
});

test("shop copy links directly to the inflatable comparison",()=>{
  assert.match(shop,/href="\.\.\/inflatable-paddle-boards\/#compare">compare AURA inflatable paddle boards by intended use and specifications<\/a>/);
});

test("new-order copy does not revive retired shared-batch claims",()=>{
  assert.doesNotMatch(shop,/committed production allocation|relevant production batch|count successfully paid board quantities/i);
  assert.match(shop,/without a shared production minimum/i);
  assert.match(collection,/<h3>Pre-order payments<\/h3>/);
  assert.doesNotMatch(collection,/<h3>Conditional pre-orders<\/h3>/);
});
