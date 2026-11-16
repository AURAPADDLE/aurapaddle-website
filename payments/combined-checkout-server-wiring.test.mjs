import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const server=fs.readFileSync(new URL("./server.mjs",import.meta.url),"utf8"),pkg=JSON.parse(fs.readFileSync(new URL("./package.json",import.meta.url),"utf8"));

test("production server wires combined checkout default-off without a second webhook secret",()=>{
  assert.match(server,/COMBINED_CHECKOUT_ENABLED==="true"/);assert.match(server,/combinedCheckout:\{enabled:combinedCheckoutEnabled\}/);assert.match(server,/AURA_STRIPE\.combinedCheckoutEnabled/);assert.match(server,/url\.pathname==="\/api\/combined-checkout"/);assert.match(server,/url\.pathname==="\/api\/combined-checkout-session"/);assert.match(server,/metadata\?\.aura_combined_request/);assert.equal((server.match(/STRIPE_WEBHOOK_SECRET/g)||[]).length,1);assert.doesNotMatch(server,/COMBINED_CHECKOUT_ENABLED!=="false"/);
});

test("release test command includes combined checkout suites",()=>{
  for(const file of ["combined-checkout-integration.test.mjs","combined-checkout-persistence.test.mjs","combined-checkout-postgres.test.mjs","combined-checkout-return-ui.test.mjs","combined-checkout-server-wiring.test.mjs","stripe-combined-adapter.test.mjs"])assert.match(pkg.scripts.test,new RegExp(file.replaceAll(".","\\.")));
});
