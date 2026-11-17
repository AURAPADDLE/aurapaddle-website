import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const product=fs.readFileSync(path.join(site,"product-page.js"),"utf8");
const cart=fs.readFileSync(path.join(site,"cart-page.js"),"utf8");
const css=fs.readFileSync(path.join(site,"conversion-review.css"),"utf8");

test("Yoga mobile buying path uses the authoritative address quote and keeps both purchase actions",()=>{
  assert.match(product,/stripeConfig\.shippingQuoteEndpoint\|\|"\/api\/shipping-quote"/);
  assert.match(product,/items:\[\{sku:v\.sku,quantity:requestedQuantity\}\],deliveryLocation,deliveryService:"standard"/);
  assert.match(product,/Free shipping applies only after this exact address is verified/);
  assert.match(product,/data-buy-now[\s\S]+data-add-cart/);
  assert.match(product,/Complete kit: electric pump \(compatible car power socket required\) · wheeled carry bag · adjustable paddle/);
});

test("verified product address can be rechecked by cart without changing shipping rules",()=>{
  assert.match(product,/aura-delivery-location-v1/);
  assert.match(cart,/aura-delivery-location-v1/);
  assert.match(cart,/savedLocation[\s\S]+requestShippingQuote\(\)/);
  assert.doesNotMatch(product,/Adelaide[^\n]+129/);
  assert.match(css,/product-delivery-check/);
});
