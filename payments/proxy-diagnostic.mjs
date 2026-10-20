import crypto from "node:crypto";
import net from "node:net";

function digest(value, key){
  return value ? crypto.createHmac("sha256",key).update(value).digest("hex") : null;
}

function describeSingle(value,key,{country=false}={}){
  const text=String(value||"").trim();
  return {
    present:Boolean(text),
    formatValid:Boolean(text)&&(country?/^[A-Z]{2}$/.test(text):net.isIP(text)>0),
    digest:digest(text,key)
  };
}

export function proxyDiagnostic(req,adminToken){
  const forwarded=String(req.headers["x-forwarded-for"]||"").trim();
  const forwardedParts=forwarded?forwarded.split(",").map(value=>value.trim()).filter(Boolean):[];
  return {
    cfConnectingIp:describeSingle(req.headers["cf-connecting-ip"],adminToken),
    xForwardedFor:{
      present:Boolean(forwarded),
      entryCount:forwardedParts.length,
      formatValid:Boolean(forwardedParts.length)&&forwardedParts.every(value=>net.isIP(value)>0),
      digest:digest(forwarded,adminToken)
    },
    cfIpCountry:describeSingle(req.headers["cf-ipcountry"],adminToken,{country:true}),
    xCountryCode:describeSingle(req.headers["x-country-code"],adminToken,{country:true}),
    socketRemoteAddress:describeSingle(req.socket?.remoteAddress,adminToken)
  };
}
