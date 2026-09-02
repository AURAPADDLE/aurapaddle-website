import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const releaseAt="2026-08-18T01:18:00+10:00";
const archive=path.join(site,"archives","pre-release-2026-08-18");
fs.mkdirSync(archive,{recursive:true});

if(fs.existsSync(path.join(site,"index.html"))&&!fs.existsSync(path.join(archive,"legacy-index.html"))){
  fs.copyFileSync(path.join(site,"index.html"),path.join(archive,"legacy-index.html"));
}

const replacements=[
  [/noindex,nofollow/g,"index,follow,max-image-preview:large"],
  [/redesign-preview\.html/g,""],
  [/shop-preview\.html/g,"shop/"],
  [/policy-preview\.html/g,"policies/"],
  [/preorder-preview\.html/g,"pre-order/"],
  [/cart-preview\.html/g,"cart/"],
  [/our-story\.html/g,"our-story/"],
  [/contact\.html/g,"contact/"],
  [/support\.html/g,"support/"],
  [/Stripe sandbox · Afterpay disabled/g,"Secure checkout · Afterpay unavailable"],
  [/Australia-only offline preview/g,"Australia-wide online store"],
  [/Australia-only offline shop preview/g,"Australia-wide online store"],
  [/ · Not deployed · Payments inactive/g," · Secure payments by Stripe"],
  [/Offline review/g,"Online store"],
  [/Stripe-ready checkout position/g,"Secure Stripe checkout"],
  [/Two-stage pre-order payments are designed, not active\./g,"Secure two-stage pre-order payments."],
  [/The live checkout will apply/g,"Checkout applies"],
  [/Preview payment entry/g,"Review payment details"]
];
function productionHtml(source){
  let html=fs.readFileSync(path.join(site,source),"utf8");
  for(const [pattern,value] of replacements)html=html.replace(pattern,value);
  return html;
}
function writeRoute(route,source){
  const target=route?path.join(site,route,"index.html"):path.join(site,"index.html");
  fs.mkdirSync(path.dirname(target),{recursive:true});
  let html=productionHtml(source);
  if(route)html=html.replace(/<head>/i,'<head><base href="/">');
  fs.writeFileSync(target,html);
}

const productOnly=String(process.env.AURA_PRODUCT_ONLY||"").trim();
if(!productOnly){
  writeRoute("","redesign-preview.html");
  writeRoute("shop","shop-preview.html");
  writeRoute("policies","policy-preview.html");
  writeRoute("pre-order","preorder-preview.html");
  writeRoute("cart","cart-preview.html");
  writeRoute("our-story","our-story.html");
  writeRoute("contact","contact.html");
  writeRoute("support","support.html");
}

const productFiles=productOnly?[`${productOnly}.html`]:fs.readdirSync(path.join(site,"products")).filter(name=>name.endsWith(".html"));
for(const filename of productFiles){
  if(!fs.existsSync(path.join(site,"products",filename)))throw new Error(`Product page not found: ${filename}`);
  let html=fs.readFileSync(path.join(site,"products",filename),"utf8");
  for(const [pattern,value] of replacements)html=html.replace(pattern,value);
  fs.writeFileSync(path.join(site,"products",filename),html);
}

if(!productOnly)fs.writeFileSync(path.join(site,"release-manifest.json"),`${JSON.stringify({releaseAt,timezone:"Australia/Brisbane",generatedAt:new Date().toISOString(),entry:"/index.html",stripeActivation:"requires production readiness gate"},null,2)}\n`);
console.log(productOnly?`Production product page prepared: ${productOnly}.`:`Production routes prepared for ${releaseAt}. Legacy index archived at ${path.relative(site,archive)}.`);
