// Offline smoke tests: no Google tags, Stripe requests or live orders are sent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = name => fs.readFileSync(new URL(name, root), 'utf8');
class Element {
  constructor() { this.listeners = {}; this.children = new Map(); this.style = {}; this.value = ''; this.textContent = ''; this.classList = {add(){}, remove(){}}; this.parentElement = {after(){}}; this.previousElementSibling = {textContent:''}; this.nextElementSibling = {textContent:''}; }
  setAttribute() {}
  append() {}
  get options() { return [...String(this.innerHTML||'').matchAll(/<option value="([^"]*)"/g)].map(m=>({value:m[1]})); }
  after() {}
  before() {}
  closest() { return this; }
  setCustomValidity(message) { this.validationMessage = message; }
  checkValidity() { return !this.validationMessage && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value); }
  reportValidity() { return this.checkValidity(); }
  focus() {}
  remove() {}
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelector(selector) { if (!this.children.has(selector)) this.children.set(selector, new Element()); return this.children.get(selector); }
  querySelectorAll(selector) { return selector==='button' ? this.buttons || [] : []; }
}
const storage = entries => {
  const data = new Map(entries);
  return {getItem:key=>data.get(key) ?? null, setItem:(key,value)=>data.set(key,String(value)), removeItem:key=>data.delete(key)};
};
const yoga = {sku:'AP734955', productName:'AURA PADDLE Yoga Cruiser', shortName:'Yoga Cruiser', size:'11', colour:'Glacier Blue', quantity:1, unitAmount:74900, orderMode:'preorder', productUrl:'products/yoga-cruiser.html'};

function harness(allowed, url='https://www.aurapaddle.com/cart/?utm_source=google&utm_medium=cpc&utm_campaign=offline_qa', options={}) {
  const elements = new Map();
  const element = key => { if (!elements.has(key)) elements.set(key,new Element()); return elements.get(key); };
  element('cartList').buttons=[new Element(),new Element(),new Element()];
  element('checkoutCart').textContent='Pay 50% securely';
  const windowListeners = new Map();
  const calls = [], scripts = [], requests = [], redirects = [], created = [];
  element('shippingRegion').innerHTML='<option value=""></option><option value="gold-coast-brisbane">Metro</option><option value="remote">Remote</option>';
  const document = {referrer:options.referrer||'', head:{append:e=>{scripts.push(e);if(e.src&&!options.manualTag)queueMicrotask(()=>e.listeners.load?.());}}, body:new Element(), createElement:()=>{const e=new Element();created.push(e);return e;}, getElementById:element, querySelector:element, addEventListener(){}};
  const location = Object.assign(new URL(url), {assign:value=>redirects.push(value)});
  const FixedDate=class extends Date { constructor(...args){super(...(args.length?args:[options.now||'2026-10-18T00:00:00Z']));} static now(){return new Date(options.now||'2026-10-18T00:00:00Z').getTime();} };
  const context = {document, location, URL, Date:FixedDate, Uint32Array, setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms);if(ms>10000||ms===0)timer.unref();return timer;}, clearTimeout, Event:class{constructor(type){this.type=type}}, CustomEvent:class{constructor(name,detail){this.type=name;this.detail=detail}},
    localStorage:storage([['aura-cookie-consent-v1',JSON.stringify({analytics:allowed,marketing:allowed})],...(options.attribution?[['aura-attribution-v1',JSON.stringify(options.attribution)]]:[])]),
    sessionStorage:storage([['aura-shipping-region-v1',options.region??'gold-coast-brisbane']]),
    dispatchEvent(){}, addEventListener(name,fn){if(!windowListeners.has(name))windowListeners.set(name,[]);windowListeners.get(name).push(fn);},
    AURA_OFFLINE_REVIEW:options.offlineReview===true,
    AURA_STRIPE:{enabled:true}, AURACart:{read:()=>options.items||[yoga],count:()=>1,subscribe(){}},
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({url:'https://checkout.example.test/offline'})};},
    gtag(...args){calls.push(args);if(args[0]==='get')args[3](args[2]==='client_id'?'123.456':'1788729600');}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source('cookie-consent.js'),context);
  vm.runInContext(source('coastgo-offer.js'),context);
  const startCart = (email='offline@example.test') => {
    const checkoutFetch=context.fetch;
    context.fetch=(url,opts)=>String(url).includes('shipping-rates.json')?Promise.resolve({ok:true,json:async()=>JSON.parse(source('shipping-rates.json'))}):checkoutFetch(url,opts);
    vm.runInContext(source('cart-page.js'),context);
    const input=created.find(e=>e.id==='checkoutEmail');
    input.value=email;
    return input;
  };
  const pageShow=persisted=>(windowListeners.get('pageshow')||[]).forEach(fn=>fn({persisted}));
  return {context, elements, element, calls, scripts, requests, redirects, startCart, pageShow};
}

test('new external source replaces last non-direct while preserving first recorded source',async()=>{
  const attribution={version:1,expiresAt:new Date(Date.now()+86400000).toISOString(),first:{source:'newsletter',medium:'email'},last:{source:'newsletter',medium:'email'}};
  const h=harness(true,'https://www.aurapaddle.com/shop/',{referrer:'https://www.google.com.au/search?q=board',attribution});
  const result=await h.context.AURAAttribution.snapshot();
  assert.equal(result.first.source,'newsletter');assert.equal(result.last.source,'google');assert.equal(result.last.medium,'organic');assert.equal(result.last.evidence,'referrer');
});

test('internal navigation, direct return and Stripe return preserve last non-direct',async()=>{
  const attribution={version:1,expiresAt:new Date(Date.now()+86400000).toISOString(),first:{source:'instagram',medium:'social'},last:{source:'instagram',medium:'social'}};
  for(const referrer of ['', 'https://aurapaddle.com/shop/', 'https://checkout.stripe.com/c/pay/example']){
    const h=harness(true,'https://www.aurapaddle.com/cart/',{referrer,attribution});
    assert.equal((await h.context.AURAAttribution.snapshot()).last.source,'instagram');
  }
});

test('tag ID failure never invents IDs or reuses a cached session',async()=>{
  const attribution={version:1,expiresAt:new Date(Date.now()+86400000).toISOString(),analyticsClientId:'999.999',analyticsSessionId:'111'};
  const h=harness(true,undefined,{attribution});
  h.context.gtag=(...args)=>{if(args[0]==='get')args[3]('');};
  const result=await h.context.AURAAttribution.snapshot();
  assert.equal(result.analyticsClientId,undefined);assert.equal(result.analyticsSessionId,undefined);
});

test('consent withdrawn during ID lookup prevents identifier persistence',async()=>{
  const h=harness(true),callbacks=[];
  h.context.gtag=(...args)=>{if(args[0]==='get')callbacks.push(args[3]);};
  const pending=h.context.AURAAttribution.snapshot();
  await new Promise(resolve=>setImmediate(resolve));
  h.context.auraConsent={analytics:false,marketing:false};
  callbacks[0]('123.456');callbacks[1]('123');
  const result=await pending;
  assert.equal(result.analyticsClientId,undefined);assert.equal(h.context.localStorage.getItem('aura-attribution-v1'),null);
});

test('untagged Google ad click is recorded as click evidence, not direct',async()=>{
  const h=harness(true,'https://www.aurapaddle.com/shop/?gclid=offline-test');
  const result=await h.context.AURAAttribution.snapshot();
  assert.equal(result.last.source,'google');assert.equal(result.last.medium,'cpc');assert.equal(result.last.evidence,'google_click_id');
});

test('consented checkout preserves campaign/client/session, reports AUD 374.50, then redirects',async()=>{
  const h=harness(true);
  h.startCart();
  await h.element('checkoutCart').listeners.click();
  assert.equal(h.requests.length,1);
  const attribution=h.requests[0].body.attribution;
  assert.equal(attribution.last.source,'google');
  assert.equal(attribution.last.medium,'cpc');
  assert.equal(attribution.analyticsClientId,'123.456');
  assert.equal(attribution.analyticsSessionId,'1788729600');
  const events=h.calls.filter(c=>c[0]==='event');
  const begin=events.filter(c=>c[1]==='begin_checkout');
  assert.equal(begin.length,1);
  assert.equal(begin[0][2].currency,'AUD');
  assert.equal(begin[0][2].value,374.5);
  assert.equal(begin[0][2].items[0].item_id,'AP734955');
  assert.equal(events.some(c=>c[1]==='purchase'),false);
  assert.equal(h.redirects[0],'https://checkout.example.test/offline');
});

test('necessary-only consent permits checkout and sends consent-aware event pings without identifiers',async()=>{
  const h=harness(false);
  h.startCart();
  await h.element('checkoutCart').listeners.click();
  assert.equal(h.requests.length,1);
  assert.equal(h.scripts.some(s=>String(s.src).includes('googletagmanager')),true);
  const denied=h.calls.find(c=>c[0]==='consent'&&c[1]==='default');
  assert.equal(denied[2].analytics_storage,'denied');
  assert.equal(denied[2].ad_storage,'denied');
  const events=h.calls.filter(c=>c[0]==='event');
  assert.equal(events.filter(c=>c[1]==='begin_checkout').length,1);
  assert.equal(h.requests[0].body.attribution.consent.analytics,false);
  assert.equal(h.requests[0].body.attribution.analyticsClientId,undefined);
  assert.equal(h.requests[0].body.attribution.analyticsSessionId,undefined);
  assert.equal(h.redirects.length,1);
});

test('checkout server failure reports checkout_error, not begin_checkout or purchase',async()=>{
  const h=harness(true);
  h.context.fetch=async()=>({ok:false,status:503,json:async()=>({error:'Offline simulated failure'})});
  h.startCart();
  await h.element('checkoutCart').listeners.click();
  const names=h.calls.filter(c=>c[0]==='event').map(c=>c[1]);
  assert.ok(names.includes('checkout_error'));
  assert.equal(names.includes('begin_checkout'),false);
  assert.equal(names.includes('purchase'),false);
  assert.equal(h.redirects.length,0);
  assert.equal(h.element('checkoutCart').disabled,false);
});

test('mobile Buy Now handler adds selected SKU and emits add_to_cart before cart navigation',()=>{
  const product=source('product-page.js');
  const start=product.indexOf('  function buyNow(){'),end=product.indexOf('  function addAccessory(',start);
  assert.ok(start>=0 && end>start);
  const actions=[];
  const context={cart:{add:(item,qty)=>actions.push(['cart',item.sku,qty])},cartItem:()=>yoga,quantity:1,analyticsItem:item=>({item_id:item.sku,price:item.unitAmount/100,quantity:1}),track:(name,p)=>actions.push([name,p]),location:{}};
  vm.createContext(context);
  vm.runInContext(product.slice(start,end)+'\nbuyNow();',context);
  assert.equal(actions[0][0],'cart');
  assert.equal(actions[0][1],'AP734955');
  assert.equal(actions[1][0],'add_to_cart');
  assert.equal(actions[1][1].value,749);
  assert.equal(context.location.href,'../cart/');
});

test('empty email blocks checkout, then correction permits a single request',async()=>{
  const h=harness(false), email=h.startCart('');
  await h.element('checkoutCart').listeners.click();
  assert.equal(h.requests.length,0);
  email.value='offline@example.test';
  email.listeners.input();
  await h.element('checkoutCart').listeners.click();
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].body.customerEmail,'offline@example.test');
});

test('cart rerender cannot unlock checkout while its request is in flight',async()=>{
  const h=harness(false);
  let rerender, resolveResponse, requestCount=0;
  h.context.AURACart.subscribe=fn=>{rerender=fn;};
  const response=new Promise(resolve=>{resolveResponse=resolve;});
  h.context.fetch=async()=>{requestCount++;return response;};
  const email=h.startCart();
  const first=h.element('checkoutCart').listeners.click();
  await new Promise(resolve=>setImmediate(resolve));
  try {
    rerender();
    assert.equal(h.element('checkoutCart').disabled,true);
    assert.equal(h.element('shippingRegion').disabled,true);
    assert.equal(email.disabled,true);
    assert.ok(h.element('cartList').buttons.every(button=>button.disabled));
    assert.equal(h.element('recoveryEmailConsent').disabled,true);
    await h.element('checkoutCart').listeners.click();
    assert.equal(requestCount,1);
  } finally {
    resolveResponse({ok:false,status:503,json:async()=>({error:'Offline simulated failure'})});
    await first;
  }
  assert.equal(h.element('checkoutCart').disabled,false);
  assert.equal(h.element('shippingRegion').disabled,false);
  assert.equal(email.disabled,false);
  assert.ok(h.element('cartList').buttons.every(button=>!button.disabled));
  assert.equal(h.element('recoveryEmailConsent').disabled,false);
});

test('invalid email blocks the request without emitting begin_checkout',async()=>{
  const h=harness(true);
  h.startCart('not-an-email');
  await h.element('checkoutCart').listeners.click();
  assert.equal(h.requests.length,0);
  assert.ok(h.calls.some(c=>c[0]==='event'&&c[1]==='checkout_email_required'));
  assert.equal(h.calls.some(c=>c[0]==='event'&&c[1]==='begin_checkout'),false);
});

test('failed request releases controls and permits an explicit retry',async()=>{
  const h=harness(false);
  let count=0;
  h.context.fetch=async()=>{
    count++;
    if(count===1)throw new Error('Offline simulated network failure');
    return {ok:true,json:async()=>({url:'https://checkout.example.test/retry'})};
  };
  h.startCart();
  await h.element('checkoutCart').listeners.click();
  assert.equal(h.element('checkoutError').style.display,'block');
  assert.equal(h.element('checkoutCart').disabled,false);
  await h.element('checkoutCart').listeners.click();
  assert.equal(count,2);
  assert.deepEqual(h.redirects,['https://checkout.example.test/retry']);
});

test('shipping and recovery consent are captured before attribution awaits',async()=>{
  const h=harness(true);
  let release;
  h.context.AURAAttribution.snapshot=()=>new Promise(resolve=>{release=resolve;});
  h.startCart();
  const pending=h.element('checkoutCart').listeners.click();
  // Simulate a programmatic change; real controls are disabled during the request.
  h.element('shippingRegion').value='perth';
  h.element('recoveryEmailConsent').checked=false;
  release({consent:{analytics:true,marketing:true}});
  await pending;
  assert.equal(h.requests[0].body.shippingRegion,'gold-coast-brisbane');
  assert.equal(h.requests[0].body.recoveryEmailConsent,true);
  const event=h.calls.find(c=>c[0]==='event'&&c[1]==='add_shipping_info');
  assert.equal(event[2].shipping_tier,'gold-coast-brisbane');
});

test('cached return after checkout redirect unlocks the cart without submitting again',async()=>{
  const h=harness(false),email=h.startCart();
  await h.element('checkoutCart').listeners.click();
  assert.equal(h.element('checkoutCart').disabled,true);
  h.pageShow(false);
  assert.equal(h.element('checkoutCart').disabled,true);
  h.pageShow(true);
  assert.equal(h.element('checkoutCart').disabled,false);
  assert.equal(h.element('checkoutCart').textContent,'PAY 50% SECURELY');
  assert.equal(email.value,'offline@example.test');
  assert.equal(email.disabled,false);
  assert.equal(h.requests.length,1);
  await h.element('checkoutCart').listeners.click();
  assert.equal(h.requests.length,2);
});

test('pageshow does not unlock a checkout request that has not redirected',async()=>{
  const h=harness(false);
  let release;
  h.context.fetch=()=>new Promise(resolve=>{release=resolve;});
  h.startCart();
  const pending=h.element('checkoutCart').listeners.click();
  await new Promise(resolve=>setImmediate(resolve));
  h.pageShow(true);
  assert.equal(h.element('checkoutCart').disabled,true);
  release({ok:false,json:async()=>({error:'Offline failure'})});
  await pending;
});

test('in-stock Yoga hides zero balances and charges full price with eligible free shipping',async()=>{
  const h=harness(true,undefined,{items:[{...yoga,orderMode:'available'}]});h.startCart();
  assert.equal(h.element('remainingBalance').parentElement.hidden,true);
  assert.equal(h.element('beforeDispatch').parentElement.hidden,true);
  assert.equal(h.element('dueToday').textContent,'$749');
  assert.equal(h.element('checkoutCart').textContent,'PAY IN FULL SECURELY');
  await h.element('checkoutCart').listeners.click();
  assert.equal(h.requests[0].body.coastGoShippingAmount,0);
  assert.equal(h.requests[0].body.promoCode,'AURAFREESHIP');
});

const coast={...yoga,sku:'AP081165',productName:'CoastGo',shortName:'CoastGo',productUrl:'products/coast-go.html',unitAmount:29900,orderMode:'available'};
test('CoastGo standard/express/remote retain amounts, visible transit and payment gating',async()=>{
  for(const [region,amount,enabled] of [['coastgo-metro','$299',true],['coastgo-express','$419',true],['coastgo-remote-north','$299 + quote',false]]){
    const h=harness(false,undefined,{items:[coast],region});h.startCart();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.element('dueToday').textContent,amount,region);
    assert.equal(!h.element('checkoutCart').disabled,enabled,region);
    if(region==='coastgo-metro')assert.match(h.element('shippingHelp').textContent,/21.*40/);
    if(region==='coastgo-express')assert.match(h.element('shippingHelp').textContent,/7.*11/);
  }
});
test('offer expiry restores actual standard shipping, without extending promotion',async()=>{
  const h=harness(false,undefined,{items:[{...yoga,orderMode:'available'}],now:'2026-10-21T14:00:00Z'});h.startCart();
  assert.equal(h.element('dueToday').textContent,'$774');
  await h.element('checkoutCart').listeners.click();
  assert.equal(h.requests[0].body.promoCode,'');
});
test('mixed payment modes and missing region block checkout; preorder balances stay visible',()=>{
  for(const opts of [{items:[yoga,coast]},{items:[yoga],region:''}]){
    const h=harness(false,undefined,opts);h.startCart();assert.equal(h.element('checkoutCart').disabled,true);
    assert.equal(h.element('remainingBalance').parentElement.hidden,false);
  }
});
test('slow tag waits for load and captures real returned IDs',async()=>{
  const h=harness(true,undefined,{manualTag:true});let finished=false;
  const pending=h.context.AURAAttribution.snapshot().then(r=>{finished=true;return r;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);
  h.scripts.find(s=>s.src).listeners.load();
  const result=await pending;assert.equal(result.diagnostics.tagStatus,'loaded');assert.equal(result.analyticsClientId,'123.456');
});
test('tag load failure remains distinguishable from missing identifiers',async()=>{
  const h=harness(true,undefined,{manualTag:true});h.context.gtag=(...args)=>{if(args[0]==='get')args[3]('');};
  h.scripts.find(s=>s.src).listeners.error();
  const result=await h.context.AURAAttribution.snapshot();
  assert.equal(result.diagnostics.tagStatus,'load_error');assert.equal(result.diagnostics.clientStatus,'unavailable');assert.equal(result.analyticsClientId,undefined);
});
test('offline review never loads Google or sends analytics, even with optional consent',async()=>{
  const h=harness(true,undefined,{offlineReview:true});h.startCart();
  const result=await h.context.AURAAttribution.snapshot();
  assert.equal(h.scripts.some(s=>s.src),false);assert.equal(h.calls.some(c=>c[0]==='event'),false);
  assert.equal(result.diagnostics.tagStatus,'offline_review');assert.equal(result.analyticsClientId,undefined);
});
test('explicit QA events carry the standard internal traffic label',()=>{
  const h=harness(true,'https://www.aurapaddle.com/cart/?aura_debug=1');
  h.context.AURAAnalytics.event('view_item');
  const event=h.calls.find(c=>c[0]==='event');assert.equal(event[2].traffic_type,'internal');assert.equal(event[2].debug_mode,true);
});

test('tag load and callback timeouts are bounded and remain diagnosed as missing',async()=>{
  const h=harness(true,undefined,{manualTag:true});h.context.gtag=()=>{};
  const start=Date.now(),result=await h.context.AURAAttribution.snapshot();
  assert.equal(result.diagnostics.tagStatus,'timeout');assert.equal(result.analyticsClientId,undefined);
  assert.ok(Date.now()-start<6000,'checkout lookup must have a bounded wait');
});
test('withdrawal while the tag loads prevents even ID lookup calls',async()=>{
  const h=harness(true,undefined,{manualTag:true});const pending=h.context.AURAAttribution.snapshot();
  h.context.auraConsent={analytics:false,marketing:false};h.scripts.find(s=>s.src).listeners.load();
  const result=await pending;assert.equal(result.diagnostics,undefined);assert.equal(h.calls.some(c=>c[0]==='get'),false);
  assert.equal(h.context.localStorage.getItem('aura-attribution-v1'),null);
});
