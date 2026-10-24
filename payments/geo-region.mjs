import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {fileURLToPath} from "node:url";
import maxmind from "maxmind";

const here=path.dirname(fileURLToPath(import.meta.url));
const defaultDatabase=path.join(here,"geo-data","dbip-country-lite.mmdb");
const defaultManifest=path.join(here,"geo-data","dbip-country-lite.manifest.json");

function ipv4Number(value){const parts=value.split(".").map(Number);return parts.length===4&&parts.every(part=>Number.isInteger(part)&&part>=0&&part<=255)?parts.reduce((sum,part)=>sum*256+part,0)>>>0:null}
function inV4(value,base,bits){const ip=ipv4Number(value),network=ipv4Number(base);if(ip===null||network===null)return false;const mask=bits===0?0:(0xffffffff<<(32-bits))>>>0;return (ip&mask)===(network&mask)}
function publicIpv4(value){return ![["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4]].some(([base,bits])=>inV4(value,base,bits))}
function publicIpv6(value){const compact=value.toLowerCase();return !compact.startsWith("::ffff:")&&compact!=="::"&&compact!=="::1"&&!compact.startsWith("fc")&&!compact.startsWith("fd")&&!/^fe[89ab]/.test(compact)&&!compact.startsWith("ff")&&!compact.startsWith("2001:db8")}
export function isPublicIp(value){const version=net.isIP(String(value||""));return version===4?publicIpv4(value):version===6?publicIpv6(value):false}

export function renderClientIp(req,{render=process.env.RENDER,trustRender=process.env.TRUST_RENDER_CF_CONNECTING_IP}={}){
  if(render!=="true"||trustRender!=="true")return "";
  const value=req.headers?.["cf-connecting-ip"];
  if(typeof value!=="string"||value.includes(",")||value.trim()!==value||!isPublicIp(value))return "";
  return value;
}

export async function createGeoResolver({databasePath=process.env.DBIP_COUNTRY_DB_PATH||defaultDatabase,manifestPath=process.env.DBIP_COUNTRY_MANIFEST_PATH||defaultManifest,now=()=>Date.now(),lookup}={}){
  let manifest=null,reader=null,status="unavailable";
  try{
    manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
    if(!manifest.validUntil||now()>=Date.parse(manifest.validUntil))status="expired";
    else if(lookup){reader={get:lookup};status="ready"}
    else{
      const bytes=fs.readFileSync(databasePath),digest=crypto.createHash("sha256").update(bytes).digest("hex");
      if(digest!==manifest.mmdbSha256)status="checksum_mismatch";
      else{reader=await maxmind.open(databasePath);status="ready"}
    }
  }catch{status="unavailable"}
  return {
    status:()=>status,
    resolve(ip){
      if(status!=="ready"||now()>=Date.parse(manifest.validUntil)||!isPublicIp(ip))return "UNKNOWN";
      try{const code=String(reader.get(ip)?.country?.iso_code||"").toUpperCase();return code==="AU"?"AU":/^[A-Z]{2}$/.test(code)?"OTHER":"UNKNOWN"}catch{return "UNKNOWN"}
    }
  };
}
