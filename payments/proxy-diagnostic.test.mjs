import assert from "node:assert/strict";
import {test} from "node:test";
import {proxyDiagnostic} from "./proxy-diagnostic.mjs";

test("proxy diagnostic exposes only keyed digests and format metadata",()=>{
  const req={
    headers:{
      "cf-connecting-ip":"203.0.113.9",
      "x-forwarded-for":"198.51.100.4, 2001:db8::2",
      "cf-ipcountry":"AU",
      "x-country-code":"NZ"
    },
    socket:{remoteAddress:"::ffff:127.0.0.1"}
  };
  const result=proxyDiagnostic(req,"existing-admin-secret");
  const serialized=JSON.stringify(result);
  for(const raw of ["203.0.113.9","198.51.100.4","2001:db8::2","::ffff:127.0.0.1","AU","NZ"]){
    assert.equal(serialized.includes(raw),false);
  }
  assert.deepEqual(result.cfConnectingIp,{present:true,formatValid:true,digest:result.cfConnectingIp.digest});
  assert.equal(result.cfConnectingIp.digest.length,64);
  assert.equal(result.xForwardedFor.entryCount,2);
  assert.equal(result.xForwardedFor.formatValid,true);
  assert.equal(result.cfIpCountry.formatValid,true);
});

test("proxy diagnostic rejects malformed values without echoing them",()=>{
  const result=proxyDiagnostic({headers:{"cf-connecting-ip":"not-an-ip","cf-ipcountry":"Australia"},socket:{}},"existing-admin-secret");
  assert.equal(result.cfConnectingIp.formatValid,false);
  assert.equal(result.cfIpCountry.formatValid,false);
  assert.equal(result.xForwardedFor.present,false);
  assert.equal(result.socketRemoteAddress.digest,null);
});
