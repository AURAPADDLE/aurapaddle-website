import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html=fs.readFileSync(new URL("../checkout-combined-success.html",import.meta.url),"utf8"),cart=fs.readFileSync(new URL("../cart.js",import.meta.url),"utf8");

test("combined return page uses server verification and never treats redirect as payment",()=>{
  assert.match(html,/\/api\/combined-checkout-session\?id=/);
  assert.match(html,/record\.status==="paid"/);
  assert.match(html,/signed payment notification/);
  assert.doesNotMatch(html,/AURACart\?\.clear/);
  assert.match(html,/AURACart\?\.consume/);
  assert.match(html,/aura-combined-cart-consumed-v1:/);
  assert.match(html,/noindex,nofollow/);
  assert.match(html,/name="referrer" content="no-referrer"/);
});

test("cart consume removes only paid quantities and preserves unrelated or later additions",()=>{
  const stored=new Map(),context={window:{AURACoastGo:{isCoastGo:()=>false}},document:{readyState:"complete",querySelectorAll:()=>[]},localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)}};vm.createContext(context);vm.runInContext(cart,context);
  context.window.AURACart.write([{sku:"AP734955",quantity:2,unitAmount:74900},{sku:"AP505002",quantity:1,unitAmount:74900},{sku:"AP550986",quantity:1,unitAmount:104900}]);
  context.window.AURACart.consume([{sku:"AP734955",quantity:1},{sku:"AP505002",quantity:1}]);
  assert.deepEqual(JSON.parse(JSON.stringify(context.window.AURACart.read().map(({sku,quantity})=>({sku,quantity})))),[{sku:"AP734955",quantity:1},{sku:"AP550986",quantity:1}]);
});
