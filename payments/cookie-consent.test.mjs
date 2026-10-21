import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const fullSource=fs.readFileSync(new URL("../cookie-consent.js",import.meta.url),"utf8");
const source=`${fullSource.slice(0,fullSource.indexOf('  const banner=document.createElement("section");'))}})();`;

function privacyFixture({savedConsent,session=new Map(),metaChoice="default_au"}={}){
  const storage=new Map([["aura-attribution-v1",JSON.stringify({metaChoice})]]);
  if(savedConsent!==undefined)storage.set("aura-cookie-consent-v1",JSON.stringify({necessary:true,analytics:false,marketing:savedConsent,updatedAt:"2026-10-20T00:00:00.000Z"}));
  const window={dataLayer:[],AURA_OFFLINE_REVIEW:true};
  const context={window,document:{referrer:""},location:{href:"https://www.aurapaddle.com/",hostname:"www.aurapaddle.com",pathname:"/"},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},sessionStorage:{getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,String(value)),removeItem:key=>session.delete(key)},URL,Date,JSON,Promise,clearTimeout,setTimeout};
  vm.runInNewContext(source,context);return {window,storage,session};
}

function browserFixture({consent={analytics:true,marketing:true},loadDelayMs=30,clientId="123456789.987654321",sessionId="1787635200",debug=false}={}){
  const storage=new Map([["aura-cookie-consent-v1",JSON.stringify({necessary:true,...consent,updatedAt:"2026-10-12T00:00:00.000Z"})]]);
  const dataLayer=[];
  const getCalls={client_id:0,session_id:0};
  const gtagCalls=[];
  let script;
  const window={dataLayer};
  const scaledTimeout=(callback,delay)=>setTimeout(callback,Math.max(1,Math.round(Number(delay||0)/100)));
  const document={
    referrer:"",
    createElement(){
      const listeners={};
      script={async:false,src:"",addEventListener(name,callback){listeners[name]=callback}};
      script.listeners=listeners;
      return script;
    },
    head:{append(){
      if(loadDelayMs===null)return;
      setTimeout(()=>{
        const googleTag=(...args)=>{
          gtagCalls.push(args);
          if(args[0]==="get"){
            getCalls[args[2]]=(getCalls[args[2]]||0)+1;
            args[3](args[2]==="client_id"?clientId:args[2]==="session_id"?sessionId:"");
          }
        };
        for(const queued of dataLayer)googleTag(...queued);
        window.gtag=googleTag;
        script.listeners.load?.();
      },loadDelayMs);
    }}
  };
  const context={
    window,document,
    location:{href:`https://www.aurapaddle.com/cart/${debug?"?aura_debug=1":""}`,hostname:"www.aurapaddle.com",pathname:"/cart/"},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    URL,Date,JSON,Promise,clearTimeout,setTimeout:scaledTimeout
  };
  vm.runInNewContext(source,context);
  return {window,storage,getCalls,gtagCalls};
}

test("consented checkout reads IDs after a normally loading Google tag",async()=>{
  const fixture=browserFixture({loadDelayMs:1});
  const attribution=await fixture.window.AURAAttribution.snapshot();
  assert.equal(attribution.analyticsClientId,"123456789.987654321");
  assert.equal(attribution.analyticsSessionId,"1787635200");
});

test("consented checkout waits for a slowly loading Google tag before reading IDs",async()=>{
  const fixture=browserFixture({loadDelayMs:30});
  const attribution=await fixture.window.AURAAttribution.snapshot();
  assert.equal(attribution.analyticsClientId,"123456789.987654321");
  assert.equal(attribution.analyticsSessionId,"1787635200");
});

test("blocked Google tag remains bounded and never manufactures an identity",async()=>{
  const fixture=browserFixture({loadDelayMs:null});
  const started=Date.now(),attribution=await fixture.window.AURAAttribution.snapshot();
  assert.ok(Date.now()-started<150);
  assert.equal(attribution.consent.analytics,true);
  assert.equal(attribution.consent.marketing,true);
  assert.equal(attribution.analyticsClientId,undefined);
  assert.equal(attribution.analyticsSessionId,undefined);
});

test("consent withdrawn while the tag loads removes IDs before checkout",async()=>{
  const fixture=browserFixture({loadDelayMs:30});
  const pending=fixture.window.AURAAttribution.snapshot();
  setTimeout(()=>{fixture.window.auraConsent={necessary:true,analytics:false,marketing:false,updatedAt:"2026-10-12T00:00:01.000Z"}},10);
  const attribution=await pending;
  assert.equal(attribution.consent.analytics,false);
  assert.equal(attribution.consent.marketing,false);
  assert.equal(attribution.analyticsClientId,undefined);
  assert.equal(fixture.storage.has("aura-attribution-v1"),false);
});

test("valid client ID is preserved when session ID is unavailable",async()=>{
  const fixture=browserFixture({loadDelayMs:1,sessionId:""});
  const attribution=await fixture.window.AURAAttribution.snapshot();
  assert.equal(attribution.analyticsClientId,"123456789.987654321");
  assert.equal(attribution.analyticsSessionId,undefined);
});

test("concurrent snapshots share the bounded tag load and return genuine IDs",async()=>{
  const fixture=browserFixture({loadDelayMs:30});
  const [first,second]=await Promise.all([fixture.window.AURAAttribution.snapshot(),fixture.window.AURAAttribution.snapshot()]);
  assert.equal(first.analyticsClientId,"123456789.987654321");
  assert.equal(second.analyticsClientId,"123456789.987654321");
  assert.equal(first.analyticsSessionId,"1787635200");
  assert.equal(second.analyticsSessionId,"1787635200");
  assert.deepEqual(fixture.getCalls,{client_id:2,session_id:2});
});

test("necessary-only checkout does not wait for or retain Google IDs",async()=>{
  const fixture=browserFixture({consent:{analytics:false,marketing:false},loadDelayMs:null});
  const started=Date.now(),attribution=await fixture.window.AURAAttribution.snapshot();
  assert.ok(Date.now()-started<30);
  assert.deepEqual(JSON.parse(JSON.stringify(attribution.consent)),{analytics:false,marketing:false,updatedAt:"2026-10-12T00:00:00.000Z"});
  assert.equal(attribution.analyticsClientId,undefined);
});

test("explicit aura_debug traffic matches the active GA4 internal filter",async()=>{
  const fixture=browserFixture({loadDelayMs:1,debug:true});
  await fixture.window.AURAAttribution.snapshot();
  fixture.window.AURAAnalytics.event("checkout_submit",{checkout_stage:"test"});
  const config=fixture.gtagCalls.find(args=>args[0]==="config");
  const event=fixture.gtagCalls.find(args=>args[0]==="event"&&args[1]==="checkout_submit");
  assert.equal(config[2].debug_mode,true);
  assert.equal(config[2].traffic_type,"internal");
  assert.equal(event[2].debug_mode,true);
  assert.equal(event[2].traffic_type,"internal");
});

test("ordinary browser events do not receive an internal traffic label",async()=>{
  const fixture=browserFixture({loadDelayMs:1});
  await fixture.window.AURAAttribution.snapshot();
  fixture.window.AURAAnalytics.event("checkout_submit",{checkout_stage:"cart"});
  const config=fixture.gtagCalls.find(args=>args[0]==="config");
  const event=fixture.gtagCalls.find(args=>args[0]==="event"&&args[1]==="checkout_submit");
  assert.equal(Object.hasOwn(config[2],"traffic_type"),false);
  assert.equal(Object.hasOwn(event[2],"traffic_type"),false);
});

test("unoperated privacy state stays unsaved without automatically opening the notice",()=>{
  const fixture=privacyFixture();assert.equal(fixture.window.AURAPrivacyNoticeState.shouldShow(),true);assert.equal(fixture.window.AURAPrivacyNoticeState.dismissed(),false);
  assert.doesNotMatch(fullSource,/setTimeout\([^)]*(?:banner|cookie-consent|dismiss)/);
  assert.doesNotMatch(fullSource,/banner\.classList\.add\("is-visible"\)/);
});

test("dismiss action records only a tab-session UI state and changes no privacy choice",()=>{
  const fixture=privacyFixture(),before=new Map(fixture.storage);fixture.window.auraConsent={necessary:true,analytics:false,marketing:false};
  fixture.window.AURAPrivacyNoticeState.dismiss();
  assert.equal(fixture.window.AURAPrivacyNoticeState.shouldShow(),false);assert.deepEqual([...fixture.storage],[...before]);assert.deepEqual(fixture.window.auraConsent,{necessary:true,analytics:false,marketing:false});
  assert.equal(JSON.parse(fixture.storage.get("aura-attribution-v1")).metaChoice,"default_au");
  assert.match(fullSource,/data-cookie-dismiss aria-label="Dismiss privacy notice">×<\/button>/);assert.match(fullSource,/data-cookie-dismiss[^]*dismissNotice\(\);banner\.classList\.remove\("is-visible"\)/);
});

test("footer privacy entry can reopen detailed settings after the notice is dismissed",()=>{
  const fixture=privacyFixture();fixture.window.AURAPrivacyNoticeState.dismiss();
  const home=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(home,/data-open-cookie-settings>Cookie settings<\/button>/);assert.match(fullSource,/footer&&!footer\.querySelector\("\[data-open-cookie-settings\]"\)/);assert.match(fullSource,/settingsButton\.dataset\.openCookieSettings=""/);assert.match(fullSource,/data-open-cookie-settings[^]*openSettings\(\)/);assert.equal(fixture.window.AURAPrivacyNoticeState.dismissed(),true);assert.equal(fixture.storage.has("aura-cookie-consent-v1"),false);
});

test("dismissal follows the same browser tab across pages but not persistent storage",()=>{
  const session=new Map(),first=privacyFixture({session});first.window.AURAPrivacyNoticeState.dismiss();const nextPage=privacyFixture({session});
  assert.equal(nextPage.window.AURAPrivacyNoticeState.shouldShow(),false);assert.equal(nextPage.storage.has("aura-cookie-consent-v1"),false);assert.equal(session.get("aura-privacy-notice-dismissed-v1"),"1");
});

test("an existing marketing rejection remains rejected and shows no unsaved notice",()=>{
  const fixture=privacyFixture({savedConsent:false});assert.equal(fixture.window.AURAPrivacyNoticeState.shouldShow(),false);assert.equal(fixture.window.AURAPrivacyNoticeState.dismissed(),false);
  const choice=JSON.parse(fixture.storage.get("aura-cookie-consent-v1"));assert.equal(choice.analytics,false);assert.equal(choice.marketing,false);
});
