export function createStripeTaxReadiness({stripeRequest,taxRateId,ttlMs=300_000,now=()=>Date.now()}={}){
  let cached=null,pending=null;
  const unavailable=()=>({checked:false,valid:false,active:false,australian:false,tenPercent:false,inclusive:false,status:"unavailable"});
  return async()=>{
    const time=now();if(cached&&time-cached.checkedAt<ttlMs)return cached.result;if(pending)return pending;
    if(typeof stripeRequest!=="function"||!/^txr_[A-Za-z0-9]+$/.test(String(taxRateId||""))){const result=unavailable();cached={checkedAt:time,result};return result}
    pending=(async()=>{try{const rate=await stripeRequest(`/v1/tax_rates/${encodeURIComponent(taxRateId)}`),result={checked:true,active:rate.active===true,australian:String(rate.country||"").toUpperCase()==="AU",tenPercent:Number(rate.percentage)===10,inclusive:rate.inclusive===true,status:"checked"};result.valid=result.active&&result.australian&&result.tenPercent&&result.inclusive;cached={checkedAt:now(),result};return result}catch{const result=unavailable();cached={checkedAt:now(),result};return result}finally{pending=null}})();
    return pending;
  };
}
