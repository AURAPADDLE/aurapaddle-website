import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import offer from '../coastgo-offer.js';
import {renderCoastGoPage,renderCoastGoFeed} from './coastgo-content.mjs';
import {loadCatalog,normaliseCheckoutItems,calculateShipping,buildCheckoutParams,orderProgress,applyStripeEvent} from './lib.mjs';
import {enqueueStripeAnalytics} from './analytics.mjs';
import {customerOrderEmailContent} from './order-email.mjs';
const catalog=loadCatalog(),cutoff=Date.parse(offer.endsAt),launch=Date.parse(offer.launchAt);

test('Queensland launch and price cutoff have exact boundaries',()=>{
  assert.equal(offer.codeFor([{sku:'AP734955'}],cutoff-1),'');
  assert.equal(offer.codeFor([],cutoff-1),'');
  assert.equal(new Date(cutoff).toISOString(),'2026-10-07T20:00:00.000Z');
  for(const [now,amount] of [[cutoff-1,28900],[cutoff,29900],[cutoff+1,29900]])for(const sku of offer.skus){
    const items=normaliseCheckoutItems([{sku,quantity:2}],catalog,now),shipping=calculateShipping(items,'coastgo-standard',undefined,now);
    const params=buildCheckoutParams({items,shipping,siteUrl:'http://localhost',now:Math.floor(now/1000)});
    assert.equal(items[0].variant.checkoutAmount,amount);
    assert.equal(items[0].variant.retailAmount,34900);
    assert.equal(params.get('line_items[0][price_data][unit_amount]'),String(amount));
    assert.equal(params.get('line_items[1][price_data][unit_amount]'),now<cutoff?'7000':null);
    assert.equal(shipping.amount,now<cutoff?7000:0);
    assert.equal(params.get('metadata[aura_payment_stage]'),'paid_in_full');
    assert.equal(params.get('metadata[aura_promotion_code]'),now<cutoff?'COASTGO10':offer.shippingCode);
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
    assert.equal(items.length,3);for(const item of items){assert.match(item,/<g:price>299.00 AUD/);if(now<cutoff)assert.match(item,/2026-10-08T23:59:59\+10:00/);else assert.doesNotMatch(item,/<g:sale_price>/);assert.match(item,new RegExp(`<g:availability>${now<launch?'preorder':'in_stock'}`));}
    if(now===cutoff)for(const item of items){assert.match(item,/<g:region>NSW<\/g:region>/);assert.match(item,/<g:max_transit_time>40/);assert.doesNotMatch(item,/<g:region>(QLD|WA|NT)<\/g:region>/);}
  }
});

test('homepage presents both products and common code only during the promotion',()=>{
  let now=cutoff;
  const nodes=new Map(),events={},timers=[],tracking=[],seen=new Map();
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',style:{},setAttribute(){},addEventListener(){},after(){},append(){},querySelector(){return {textContent:''}}});return nodes.get(selector)};
  const modal={open:false,querySelector:node,querySelectorAll(){return[]},showModal(){this.open=true},close(){this.open=false},addEventListener(){}};
  const context={Date:class extends Date{static now(){return now}},document:{getElementById(){return modal},createElement:node,querySelectorAll(){return[]},querySelector(){return null},addEventListener(){}},sessionStorage:{getItem:k=>seen.get(k),setItem:(k,v)=>seen.set(k,v)},setTimeout:(fn,delay)=>timers.push({fn,delay}),addEventListener:(event,fn)=>events[event]=fn,AURATracking:{event:(name,params)=>tracking.push({name,...params})}};context.window=context;context.AURACoastGo={...offer,freeShippingActive:()=>offer.freeShippingActive(now)};
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../home-offer.js',import.meta.url),'utf8'),context);
  timers.find(t=>t.delay===850).fn();
  assert.equal(modal.open,true);assert.equal(tracking.at(-1).promotion_id,offer.shippingPromotionId);
  assert.match(node('[data-promo-code-copy]').innerHTML,/AURAFREESHIP/);
  assert.match(node('.preorder-offer__eyebrow').textContent,/COASTGO \+ YOGA/);
  assert.equal(node('a').href,'products/yoga-cruiser.html?colour=glacier');
  now=Date.parse(offer.shippingEndsAt);events.pageshow();assert.equal(modal.open,false);
});

test('standard-only shipping promotion respects exact dates, quantity, remote and mixed-cart exclusions',()=>{
  const end=Date.parse(offer.shippingEndsAt);
  assert.equal(new Date(end).toISOString(),'2026-10-21T14:00:00.000Z');
  for(const sku of offer.skus)for(const quantity of [1,2,20]){
    for(const now of [cutoff-1,cutoff,cutoff+1,end-1,end,end+1]){
      const items=normaliseCheckoutItems([{sku,quantity}],catalog,now);
      for(const region of offer.standardRegionIds){
        const shipping=calculateShipping(items,region,undefined,now);
        assert.equal(shipping.promotionApplied,now>=cutoff&&now<end);
        assert.equal(shipping.amount===0,now>=cutoff&&now<end);
      }
      const express=calculateShipping(items,'coastgo-express',undefined,now);
      assert.equal(express.amount,12000*quantity);assert.equal(express.promotionApplied,false);
      for(const region of offer.remoteRegionIds){
        const remote=calculateShipping(items,region,undefined,now);
        assert.equal(remote.quoteRequired,now>=cutoff&&now<end);
        if(remote.quoteRequired){assert.equal(remote.amount,null);assert.throws(()=>buildCheckoutParams({items,shipping:remote,siteUrl:'http://localhost'}),/freight quote/);}
      }
    }
  }
  const mixed=normaliseCheckoutItems([{sku:offer.skus[0],quantity:1},{sku:'AP734955',quantity:1}],catalog,cutoff);
  assert.equal(calculateShipping(mixed,'coastgo-standard',undefined,cutoff).quoteRequired,true);
  const yoga=normaliseCheckoutItems([{sku:'AP734955',quantity:1}],catalog,cutoff);
  assert.equal(calculateShipping(yoga,'gold-coast-brisbane',undefined,cutoff).amount,0);
});

test('free standard shipping is recorded once on a genuine paid webhook payload, not inferred from today',()=>{
  const items=normaliseCheckoutItems([{sku:offer.skus[0],quantity:2}],catalog,cutoff),shipping=calculateShipping(items,'coastgo-standard',undefined,cutoff);
  const params=buildCheckoutParams({items,shipping,siteUrl:'http://localhost',now:cutoff/1000,attribution:{consent:{analytics:true,marketing:false},analyticsClientId:'123.456'}});
  assert.equal(params.get('metadata[aura_shipping_promotion_id]'),offer.shippingPromotionId);
  const metadata=Object.fromEntries([...params].filter(([k])=>k.startsWith('metadata[')).map(([k,v])=>[k.slice(9,-1),v]));
  const event={id:'evt_offline_promo',type:'checkout.session.completed',created:cutoff/1000,data:{object:{id:'cs_offline_promo',metadata,payment_status:'paid',amount_total:59800,currency:'aud'}}};
  const state={};applyStripeEvent(state,event);enqueueStripeAnalytics(state,event,catalog);
  const purchase=state.analyticsOutbox['purchase:APO00000'];
  assert.equal(purchase.params.shipping,0);assert.equal(purchase.params.promotion_id,offer.shippingPromotionId);
  assert.equal(purchase.params.items[0].price,299);assert.equal(purchase.params.value,598);
  assert.equal(enqueueStripeAnalytics(state,event,catalog),false);
});

test('full-payment CoastGo confirmation and tracking never promise one-day dispatch or a balance',()=>{
  const entry={items:[{sku:'AP081165',quantity:1}],paymentStage:'paid_in_full',shippingAmount:3500,shippingLabel:'Standard',amountTotal:32400,currency:'aud',orderNumber:'APO12345',trackingToken:'sample_tracking_token',created:Math.floor((launch-86400000)/1000)};
  const email=customerOrderEmailContent(entry,{catalog,siteUrl:'http://localhost'});
  assert.match(email.text,/within 2 days/);assert.match(email.text,/No further product balance/);assert.doesNotMatch(email.text,/1 business day|30 October/);
  assert.match(orderProgress(entry)[1].description,/from release/);
});

test('Yoga free shipping covers both approved zones and aliases, preserves other products and expiry',()=>{
  const end=Date.parse(offer.shippingEndsAt);
  for(const sku of offer.yogaSkus)for(const quantity of [1,2]){
    const items=normaliseCheckoutItems([{sku,quantity}],catalog,cutoff);
    for(const region of offer.yogaRegionIds){
      const shipping=calculateShipping(items,region,undefined,cutoff,offer.shippingCode);
      assert.equal(shipping.amount,0);assert.equal(shipping.promotionCode,offer.shippingCode);
      const params=buildCheckoutParams({items,shipping,siteUrl:'http://localhost',now:cutoff/1000});
      assert.equal(params.get('metadata[aura_shipping_amount]'),'0');
      assert.equal(params.get('metadata[aura_shipping_promotion_id]'),offer.shippingPromotionId);
      assert.equal(params.get('metadata[aura_promotion_code]'),offer.shippingCode);
      assert.equal(params.get('line_items[1][price_data][unit_amount]'),null);
    }
    assert.equal(calculateShipping(items,'adelaide',undefined,cutoff).amount,12900*quantity);
    assert.equal(calculateShipping(items,'remote',undefined,cutoff).quoteRequired,true);
    assert.equal(calculateShipping(items,'gold-coast-brisbane',undefined,end).amount,2500*quantity);
    assert.equal(calculateShipping(items,'qld-nsw-main',undefined,end).amount,4500*quantity);
  }
  const others=normaliseCheckoutItems([{sku:'AP667703',quantity:1}],catalog,cutoff);
  assert.equal(calculateShipping(others,'gold-coast-brisbane',undefined,cutoff).quoteRequired,true);
});
