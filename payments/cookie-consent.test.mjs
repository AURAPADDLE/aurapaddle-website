import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const fullSource=fs.readFileSync(new URL("../cookie-consent.js",import.meta.url),"utf8");
const source=`${fullSource.slice(0,fullSource.indexOf('  const banner=document.createElement("section");'))}})();`;

function browserFixture({consent={analytics:true,marketing:true},loadDelayMs=30,clientId="123456789.987654321",sessionId="1787635200"}={}){
  const storage=new Map([["aura-cookie-consent-v1",JSON.stringify({necessary:true,...consent,updatedAt:"2026-10-12T00:00:00.000Z"})]]);
  const dataLayer=[];
  const getCalls={client_id:0,session_id:0};
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
    location:{href:"https://www.aurapaddle.com/cart/",hostname:"www.aurapaddle.com",pathname:"/cart/"},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    URL,Date,JSON,Promise,clearTimeout,setTimeout:scaledTimeout
  };
  vm.runInNewContext(source,context);
  return {window,storage,getCalls};
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
