import test from "node:test";
import assert from "node:assert/strict";
import {createStripeTaxReadiness} from "./stripe-tax-readiness.mjs";

test("admin tax readiness exposes only bounded booleans and caches the production read",async()=>{let calls=0,time=10;const readiness=createStripeTaxReadiness({taxRateId:"txr_liveGST",now:()=>time,stripeRequest:async path=>{calls++;assert.equal(path,"/v1/tax_rates/txr_liveGST");return {id:"txr_liveGST",active:true,country:"AU",percentage:10,inclusive:true,secret:"not exposed"}}});const first=await readiness(),second=await readiness();assert.deepEqual(first,{checked:true,active:true,australian:true,tenPercent:true,inclusive:true,status:"checked",valid:true});assert.deepEqual(second,first);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(first),/txr_|secret/)});

test("tax readiness fails closed without leaking provider errors",async()=>{const readiness=createStripeTaxReadiness({taxRateId:"txr_liveGST",stripeRequest:async()=>{throw Error("private provider detail")}}),result=await readiness();assert.deepEqual(result,{checked:false,valid:false,active:false,australian:false,tenPercent:false,inclusive:false,status:"unavailable"});assert.doesNotMatch(JSON.stringify(result),/private|provider/)});
