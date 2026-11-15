import coastGoOffer from "../coastgo-offer.js";
import {calculateShipping,loadCatalog,loadShippingRates} from "./lib.mjs";
import {resolveDeliveryLocation,shippingRegionForItems,validateCoverageTable} from "./shipping-location.mjs";
import {buildCatalogueCombinedPlan,cataloguePaymentRule} from "./catalog-combined-ledger.mjs";

export function previewMixedCheckout(input={},dependencies={}){
  if(input.enabled!==true)return {enabled:false,status:"disabled"};
  const now=Number(input.now||Date.now()),catalog=dependencies.catalog||loadCatalog(),rates=dependencies.rates||loadShippingRates(),coverage=dependencies.coverage?validateCoverageTable(dependencies.coverage,rates):null,availability=dependencies.availability||new Map();
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>20)throw Error("One to twenty cart lines are required.");
  const merged=new Map();for(const raw of input.items){const sku=String(raw?.sku||"").toUpperCase(),quantity=Number(raw?.quantity);if(!Number.isInteger(quantity)||quantity<1||quantity>20)throw Error("Quantity must be a whole number between 1 and 20.");merged.set(sku,(merged.get(sku)||0)+quantity)}
  if([...merged.values()].reduce((a,b)=>a+b,0)>50)throw Error("An online cart cannot exceed 50 items.");
  const resolved=[];for(const [sku,quantity] of merged){const source=catalog.bySku.get(sku);if(!source)throw Error(`${sku||"Missing SKU"} is not enabled for online checkout.`);const variant={...coastGoOffer.variant(source,now)};if(variant.orderMode==="available"){if(!availability.has(sku))throw Error(`${sku} has no verified dynamic availability.`);variant.inventoryAvailable=Number(availability.get(sku))}cataloguePaymentRule(variant,quantity,{now});resolved.push({variant,quantity,now})}
  const stock=resolved.filter(item=>item.variant.orderMode==="available"),delayed=resolved.filter(item=>item.variant.orderMode==="preorder"),rules=resolved.map(item=>cataloguePaymentRule(item.variant,item.quantity,{now}));
  let stockShipping=null,shippingStatus="not_required",shippingEvidence=null;
  if(stock.length){
    if(!coverage)return {enabled:true,status:"manual_quote",reason:"coverage_unavailable",todayTotal:null,groups:rules,shippingStatus:"manual_quote"};
    const resolution=resolveDeliveryLocation(input.deliveryLocation,coverage,rates);shippingEvidence={status:resolution.status,coverageVersion:resolution.coverageVersion};
    if(resolution.status!=="verified")return {enabled:true,status:"manual_quote",reason:resolution.status,todayTotal:null,groups:rules,shippingStatus:"manual_quote",shippingEvidence};
    const regionId=shippingRegionForItems(resolution,stock,{deliveryService:String(input.deliveryService||"standard")});
    if(!regionId)return {enabled:true,status:"manual_quote",reason:"unsupported_stock_combination",todayTotal:null,groups:rules,shippingStatus:"manual_quote",shippingEvidence};
    const promo=String(input.promoCode||coastGoOffer.codeFor(stock,now)||"").toUpperCase(),promotionAddressVerified=resolution.freeShippingEligible===true&&String(input.deliveryService||"standard")==="standard";
    const quote=calculateShipping(stock,regionId,rates,now,promo,promotionAddressVerified);
    if(quote.quoteRequired)return {enabled:true,status:"manual_quote",reason:"shipping_quote_required",todayTotal:null,groups:rules,shippingStatus:"manual_quote",shippingEvidence:{...shippingEvidence,regionId}};
    stockShipping={amount:quote.amount,promotionId:(quote.promotionIds||[]).join(",")};shippingStatus=quote.amount===0?"free":"paid";shippingEvidence={...shippingEvidence,regionId,amount:quote.amount,promotionIds:quote.promotionIds||[],promotionCode:quote.promotionCode||""};
  }
  const plan=buildCatalogueCombinedPlan({requestId:String(input.requestId||"preview-request"),parentOrderNumber:String(input.parentOrderNumber||"APO00000"),lines:resolved,stockShipping});
  return {enabled:true,status:"ready",todayTotal:plan.dueToday,currency:plan.currency,shippingStatus,shippingEvidence,groups:plan.groups.map(group=>({id:group.id,kind:group.kind,termKey:group.termKey,items:group.items.map(({sku,quantity,payment,fullUnitAmount,dueTodayUnitAmount,balanceUnitAmount})=>({sku,quantity,payment,fullUnitAmount,dueTodayUnitAmount,balanceUnitAmount})),productDueToday:group.productDueToday,shippingDueToday:group.shippingDueToday,remainingProductBalance:group.remainingProductBalance,shippingDueLater:group.shippingDueLater,deadlineISO:group.deadlineISO||null})),writePerformed:false,stripeCalled:false,delayedGroupCount:delayed.length};
}
