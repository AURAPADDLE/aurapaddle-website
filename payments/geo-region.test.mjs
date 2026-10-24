import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createGeoResolver,isPublicIp,renderClientIp} from "./geo-region.mjs";

test("Render trust boundary accepts one Cloudflare-overwritten public address only",()=>{
  const request=headers=>({headers,socket:{remoteAddress:"10.0.0.2"}}),trusted={render:"true",trustRender:"true"};
  assert.equal(renderClientIp(request({"cf-connecting-ip":"1.1.1.1","x-forwarded-for":"198.51.100.7"}),trusted),"1.1.1.1");
  for(const headers of [{"x-forwarded-for":"1.1.1.1"},{"cf-connecting-ip":"1.1.1.1, 8.8.8.8"},{"cf-connecting-ip":" 1.1.1.1"},{"cf-connecting-ip":"10.0.0.1"}])assert.equal(renderClientIp(request(headers),trusted),"");
  assert.equal(renderClientIp(request({"cf-connecting-ip":"1.1.1.1"}),{render:"",trustRender:"true"}),"");
  assert.equal(renderClientIp(request({"cf-connecting-ip":"1.1.1.1"}),{render:"true",trustRender:"false"}),"");
});

test("public-address validation rejects private, reserved and documentation ranges",()=>{
  for(const ip of ["10.0.0.1","127.0.0.1","169.254.1.1","192.168.1.1","203.0.113.1","::1","fd00::1","2001:db8::1","::ffff:192.168.1.1","::ffff:c0a8:101","not-an-ip"])assert.equal(isPublicIp(ip),false,ip);
  assert.equal(isPublicIp("1.1.1.1"),true);assert.equal(isPublicIp("2606:4700:4700::1111"),true);
});

test("current verified DB-IP database classifies only AU, OTHER or UNKNOWN",async()=>{
  const resolver=await createGeoResolver();assert.equal(resolver.status(),"ready");assert.equal(resolver.resolve("1.1.1.1"),"AU");assert.equal(resolver.resolve("8.8.8.8"),"OTHER");assert.equal(resolver.resolve("203.0.113.1"),"UNKNOWN");
});

test("missing, expired and malformed database results fail closed",async()=>{
  const missing=await createGeoResolver({databasePath:"/definitely/missing.mmdb"});assert.equal(missing.status(),"unavailable");assert.equal(missing.resolve("1.1.1.1"),"UNKNOWN");
  const expired=await createGeoResolver({now:()=>Date.parse("2026-11-16T00:00:00.000Z"),lookup:()=>({country:{iso_code:"AU"}})});assert.equal(expired.status(),"expired");assert.equal(expired.resolve("1.1.1.1"),"UNKNOWN");
  const malformed=await createGeoResolver({lookup:()=>({country:{iso_code:"Australia"}})});assert.equal(malformed.resolve("1.1.1.1"),"UNKNOWN");
});

test("region endpoint is same-origin, minimised and explicitly uncacheable",()=>{
  const server=fs.readFileSync(new URL("./server.mjs",import.meta.url),"utf8");assert.match(server,/url\.pathname==="\/api\/region"/);assert.match(server,/"Cache-Control":"no-store","CDN-Cache-Control":"no-store"/);assert.doesNotMatch(server,/\/api\/region[^\n]+x-forwarded-for/);
});
