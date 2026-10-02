import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import offer from '../coastgo-offer.js';
import {renderCoastGoPage,renderCoastGoFeed} from './coastgo-content.mjs';
import {loadCatalog,normaliseCheckoutItems,calculateShipping,buildCheckoutParams,orderProgress} from './lib.mjs';
import {customerOrderEmailContent} from './order-email.mjs';
const catalog=loadCatalog(),cutoff=Date.parse(offer.endsAt),launch=Date.parse(offer.launchAt);

test('Queensland launch and price cutoff have exact boundaries',()=>{
  assert.equal(offer.codeFor([{sku:'AP734955'}],cutoff-1),'');
  assert.equal(offer.codeFor([],cutoff-1),'');
  assert.equal(new Date(cutoff).toISOString(),'2026-10-08T14:00:00.000Z');
  for(const [now,amount] of [[cutoff-1,28900],[cutoff,29900],[cutoff+1,29900]])for(const sku of offer.skus){
    const items=normaliseCheckoutItems([{sku,quantity:2}],catalog,now),shipping=calculateShipping(items,'coastgo-standard');
    const params=buildCheckoutParams({items,shipping,siteUrl:'http://localhost',now:Math.floor(now/1000)});
    assert.equal(items[0].variant.checkoutAmount,amount);
    assert.equal(items[0].variant.retailAmount,34900);
    assert.equal(params.get('line_items[0][price_data][unit_amount]'),String(amount));
    assert.equal(params.get('line_items[1][price_data][unit_amount]'),'7000');
    assert.equal(params.get('metadata[aura_payment_stage]'),'paid_in_full');
    assert.equal(params.get('metadata[aura_promotion_code]'),now<cutoff?'COASTGO10':'');
    assert.equal(params.get('metadata[aura_product_discount_amount]'),now<cutoff?'2000':'0');
    assert.equal(params.get('discounts[0][coupon]'),null);
    assert.equal(offer.codeFor(items,now),now<cutoff?'COASTGO10':'');
    assert.doesNotMatch(params.get('custom_text[submit][message]'),/50%|1 business day/);
  }
  assert.equal(offer.beforeLaunch(launch-1),true);assert.equal(offer.beforeLaunch(launch),false);
  assert.match(offer.dispatch(launch-1),/from release/);assert.match(offer.dispatch(launch),/within 2 days of order confirmation/);
});

test('old cached deposit carts become full-payment carts and reprice after cutoff',()=>{
  let now=cutoff-1;const FixedDate=class extends Date{static now(){return now}};
  const previous=[{sku:'AP081165',quantity:1,unitAmount:29900,orderMode:'preorder',campaign:{estimatedDelivery:'30 October 2026'},productUrl:'products/coast-go.html'}];
  const context={Date:FixedDate,Event:class {},setTimeout(){},addEventListener(){},document:{readyState:'loading',addEventListener(){},querySelectorAll(){return[]}},localStorage:{getItem(){return JSON.stringify(previous)}}};context.window=context;
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../coastgo-offer.js',import.meta.url),'utf8'),context);vm.runInContext(fs.readFileSync(new URL('../cart.js',import.meta.url),'utf8'),context);
  assert.equal(context.AURACart.read()[0].unitAmount,28900);assert.equal(context.AURACart.read()[0].orderMode,'available');assert.equal(context.AURACart.read()[0].campaign,null);
  now=cutoff;assert.equal(context.AURACart.read()[0].unitAmount,29900);
});

test('Merchant feed and structured data use launch date and auto-expiring sale',()=>{
  const page=fs.readFileSync(new URL('../products/coast-go.html',import.meta.url),'utf8'),feed=fs.readFileSync(new URL('../merchant-feed.xml',import.meta.url),'utf8');
  for(const now of [launch-1,launch,cutoff]){
    const rendered=renderCoastGoPage(page,now),schema=JSON.parse(rendered.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.match(rendered,/id="productPrice">AUD \$299</);
    assert.match(rendered,/RRP AUD \$349/);
    const variants=schema['@graph'].find(v=>v['@type']==='ProductGroup').hasVariant;
    for(const v of variants){assert.equal(v.offers.price,offer.price(now)/100);assert.equal(v.offers.availability,`https://schema.org/${now<launch?'PreOrder':'InStock'}`)}
    const items=renderCoastGoFeed(feed,now).match(/<item>[\s\S]*?<\/item>/g).filter(i=>offer.skus.some(sku=>i.includes(`<g:id>${sku}</g:id>`)));
    assert.equal(items.length,3);for(const item of items){assert.match(item,/<g:price>299.00 AUD/);assert.match(item,/2026-10-08T23:59:59\+10:00/);assert.match(item,new RegExp(`<g:availability>${now<launch?'preorder':'in_stock'}`));}
  }
});

test('homepage switches from Yoga to CoastGo at midnight, then expires the extra discount',()=>{
  let now=Date.parse('2026-09-29T23:59:59+10:00');
  const FixedDate=class extends Date{static now(){return now}};
  const nodes=new Map(),timers=[],events={},seen=new Map(),tracking=[];
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',style:{},setAttribute(){},addEventListener(){},querySelector(){return {textContent:''}}});return nodes.get(selector)};
  const modal={open:false,querySelector:node,querySelectorAll(){return[]},showModal(){this.open=true},close(){this.open=false},addEventListener(){}};
  const context={Date:FixedDate,document:{getElementById(){return modal},querySelectorAll(){return[]},querySelector(){return null},addEventListener(){}},sessionStorage:{getItem:k=>seen.get(k),setItem:(k,v)=>seen.set(k,v)},setTimeout:(fn,delay)=>timers.push({fn,delay}),addEventListener:(event,fn)=>events[event]=fn,AURATracking:{event:(name,params)=>tracking.push({name,...params})}};context.window=context;
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../home-offer.js',import.meta.url),'utf8'),context);
  timers.find(t=>t.delay===850).fn();assert.equal(modal.open,true);
  assert.equal(tracking.at(-1).promotion_id,'yoga_glacier_free_shipping_202609');
  now=Date.parse('2026-09-30T00:00:00+10:00');events.pageshow();
  assert.equal(modal.open,true);assert.equal(tracking.at(-1).promotion_id,'coastgo_launch_extra10_202610');
  assert.match(node('.preorder-offer__price').innerHTML,/299.*349/);
  assert.match(node('.preorder-offer__copy').textContent,/Includes 8 October 2026/);
  assert.equal(node('[data-promo-code-copy]').hidden,false);
  assert.match(node('[data-promo-code-copy]').innerHTML,/COASTGO10/);
  assert.equal(node('[data-preorder-offer-shop]').href,'products/coast-go.html');
  now=cutoff;events.pageshow();assert.equal(modal.open,false);
});

test('full-payment CoastGo confirmation and tracking never promise one-day dispatch or a balance',()=>{
  const entry={items:[{sku:'AP081165',quantity:1}],paymentStage:'paid_in_full',shippingAmount:3500,shippingLabel:'Standard',amountTotal:32400,currency:'aud',orderNumber:'APO12345',trackingToken:'sample_tracking_token',created:Math.floor((launch-86400000)/1000)};
  const email=customerOrderEmailContent(entry,{catalog,siteUrl:'http://localhost'});
  assert.match(email.text,/within 2 days/);assert.match(email.text,/No further product balance/);assert.doesNotMatch(email.text,/1 business day|30 October/);
  assert.match(orderProgress(entry)[1].description,/from release/);
});
