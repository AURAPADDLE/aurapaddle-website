import crypto from "node:crypto";
const json=(res,status,value)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(value))};

async function body(req,limit=32*1024){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(Error("Request is too large."),{status:413});chunks.push(chunk)}
  return Buffer.concat(chunks);
}
const parse=raw=>{try{return JSON.parse(raw.toString("utf8")||"{}")}catch{throw Object.assign(Error("Request body must be JSON."),{status:400})}};
function verify(raw,header,secret,now=Math.floor(Date.now()/1000)){
  const parts=Object.fromEntries(String(header||"").split(",").map(part=>part.split("=",2))),timestamp=Number(parts.t),signature=String(parts.v1||"");
  if(!secret||!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp)>300||!/^[a-f0-9]{64}$/.test(signature))return false;
  const expected=crypto.createHmac("sha256",secret).update(`${timestamp}.${raw}`).digest("hex");return crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}

// Deliberately not wired into production server.mjs. This adapter exists only for
// non-production integration until the parent/group schema and Stripe test flow pass review.
export function createCombinedCheckoutHttpHandler({coordinator,enabled=false,webhookSecret="",now}={}){
  if(!coordinator?.createSession||!coordinator?.applyWebhook)throw Error("Combined checkout coordinator is required.");
  return async(req,res)=>{
    if(enabled!==true)return json(res,404,{error:"Not found."});
    try{
      if(req.method==="POST"&&req.url==="/api/combined-checkout")return json(res,200,await coordinator.createSession(parse(await body(req))));
      if(req.method==="GET"&&req.url.startsWith("/api/combined-checkout-session?")){const url=new URL(req.url,"http://localhost");return json(res,200,await coordinator.sessionSummary(url.searchParams.get("id")))}
      if(req.method==="POST"&&req.url==="/api/combined-checkout/webhook"){const raw=await body(req);if(!verify(raw,req.headers["stripe-signature"],webhookSecret,now?.()))return json(res,400,{error:"Webhook signature verification failed."});return json(res,200,await coordinator.applyWebhook(parse(raw)))}
      return json(res,404,{error:"Not found."});
    }catch(error){return json(res,Number(error.status)||400,{error:String(error.message||"Combined checkout failed.")})}
  };
}
