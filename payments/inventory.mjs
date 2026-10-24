import crypto from 'node:crypto';

export const LOCATIONS={gc:'Gold Coast · on hand',factory:'Factory · on hand',gc_transit:'In transit → Gold Coast',amazon_transit:'In transit → Amazon',amazon:'Amazon · on hand',quarantine:'Quarantine / damaged'};
const nowSeconds=()=>Math.floor(Date.now()/1000);
const text=(value,max=300)=>String(value||'').trim().slice(0,max);
const qty=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0||n>1000000)throw Error('Quantity must be a non-negative whole number.');return n};
export const sandboxOrder=order=>String(order.sessionId||'').startsWith('cs_test_')||/^https:\/\/invoice\.stripe\.com\/i\/[^/]+\/test_/.test(order.balanceInvoiceUrl||'');
export const noStockOrder=order=>order.internalTest===true||sandboxOrder(order)||['cancelled','refunded','not_required'].includes(order.fulfilmentStatus);
const terminal=order=>['dispatched','delivered','collected'].includes(order.fulfilmentStatus);
function inventory(state){if(!state.inventory?.initializedAt)throw Error('Inventory has not been initialized.');return state.inventory}
function used(state,sku,location,exclude,now=nowSeconds()){
  let total=0;const paid=new Set(Object.values(state.orders||{}).map(o=>o.orderNumber));
  for(const [number,lines] of Object.entries(state.inventory?.allocations||{}))if(number!==exclude)for(const line of lines)if(line.sku===sku&&line.location===location)total+=line.quantity;
  for(const entry of Object.values(state.checkoutRequests||{}))if(entry.orderNumber!==exclude&&!paid.has(entry.orderNumber)&&now-Number(entry.reservedAt)<7200)for(const line of entry.inventoryAllocation||[])if(line.sku===sku&&line.location===location)total+=line.quantity;
  return total;
}
function allocate(state,items,orderNumber,{now=nowSeconds(),pickup=false}={}){
  const inv=inventory(state),lines=[];
  for(const item of items){const product=inv.products[item.sku];if(!product?.tracked)continue;let remaining=qty(item.quantity);
    for(const location of pickup?['gc']:product.saleLocations){const balance=Number(inv.balances[item.sku]?.[location]||0),available=balance-used(state,item.sku,location,orderNumber,now)-lines.filter(l=>l.sku===item.sku&&l.location===location).reduce((sum,l)=>sum+l.quantity,0);const quantity=Math.min(remaining,Math.max(0,available));if(quantity)lines.push({sku:item.sku,location,quantity});remaining-=quantity;if(!remaining)break}
    if(remaining)throw Error(`${item.sku}: insufficient available stock${pickup?' in Gold Coast for collection':''}.`);
  }return lines;
}
export function reserveInventory(state,identity,items,now=nowSeconds()){
  if(!state.inventory?.initializedAt)return;
  if(now-Number(identity.reservedAt)>=7200)throw Error('This checkout reservation has expired. Please start a new checkout.');
  if(Object.values(state.orders||{}).some(o=>o.orderNumber===identity.orderNumber))throw Error('This checkout has already been paid. Please start a new checkout.');
  if(Object.values(state.orders||{}).some(o=>o.inventoryException&&!noStockOrder(o)&&(o.items||[]).some(line=>items.some(i=>i.variant.sku===line.sku))))throw Error('Stock allocation is under review. Please contact AURA PADDLE.');
  identity.inventoryAllocation=allocate(state,items.map(i=>({sku:i.variant.sku,quantity:i.quantity})),identity.orderNumber,{now});
}
export function reconcileInventory(state,now=nowSeconds()){
  if(!state.inventory?.initializedAt)return;
  const inv=state.inventory;
  for(const order of Object.values(state.orders||{})){
    if(noStockOrder(order)||terminal(order)||order.inventoryAccounted||order.inventoryConsumed){delete inv.allocations[order.orderNumber];continue}
    if(order.initialPaymentStatus!=='paid'||inv.allocations[order.orderNumber])continue;
    try{inv.allocations[order.orderNumber]=allocate(state,order.items||[],order.orderNumber,{now});delete order.inventoryException}
    catch(error){order.inventoryException=error.message}
  }
}
export function fulfilInventory(state,order,{pickup=false,now=nowSeconds()}={}){
  if(!state.inventory?.initializedAt)return;
  if(order.inventoryAccounted||order.inventoryConsumed||noStockOrder(order))return;
  const inv=inventory(state),lines=pickup?allocate(state,order.items||[],order.orderNumber,{pickup:true,now}):(inv.allocations[order.orderNumber]||allocate(state,order.items||[],order.orderNumber,{now}));
  for(const line of lines){if(Number(inv.balances[line.sku]?.[line.location]||0)<line.quantity)throw Error('Insufficient physical stock. Review the order allocation.');}
  for(const line of lines){inv.balances[line.sku][line.location]-=line.quantity;inv.movements.push({id:crypto.randomUUID(),type:pickup?'collected':'dispatched',...line,from:line.location,to:null,reference:order.orderNumber,note:'Order fulfilment',createdAt:now});}
  order.inventoryConsumed={at:now,lines};delete inv.allocations[order.orderNumber];delete order.inventoryException;
}
export function suppressInternalOrder(state,order,now=nowSeconds()){
  if(state.inventory?.allocations)delete state.inventory.allocations[order.orderNumber];
  delete order.inventoryException;
  for(const name of ['analyticsOutbox','transactionalEmailOutbox','recoveryEmailOutbox'])for(const item of Object.values(state[name]||{}))if(item.orderNumber===order.orderNumber&&['pending','retry','failed'].includes(item.status)){item.status='suppressed';item.suppressionReason='Internal test: no fulfilment';item.updatedAt=now;}
}
export function initializeInventory(state,input,catalog,now=nowSeconds()){
  if(state.inventory?.initializedAt)throw Error('Inventory is already initialized; use audited movements, not a second import.');
  if(!Array.isArray(input.products)||!input.products.length||input.products.length>1000)throw Error('Provide the reviewed product import.');
  const inv={version:1,initializedAt:now,source:text(input.source,500),sourceAsOf:text(input.sourceAsOf,80),products:{},balances:{},allocations:{},movements:[],sourceHistory:Array.isArray(input.sourceHistory)?input.sourceHistory.slice(0,2000):[]};
  for(const raw of input.products){const sku=text(raw.sku,30).toUpperCase();if(!/^[A-Z0-9_-]+$/.test(sku)||inv.products[sku])throw Error('Invalid or duplicate SKU.');const saleLocations=raw.saleLocations||['gc'];if(!Array.isArray(saleLocations)||saleLocations.some(l=>!['gc','factory'].includes(l)))throw Error('Only on-hand Gold Coast / factory stock can be sold online.');
    const cost=raw.landedCostUSD==null?null:Number(raw.landedCostUSD);if(cost!==null&&(!Number.isFinite(cost)||cost<0))throw Error('Invalid USD cost.');
    inv.products[sku]={sku,name:text(raw.name,200)||catalog.bySku.get(sku)?.productName||sku,tracked:raw.tracked===true,saleLocations:[...new Set(saleLocations)],landedCostUSD:cost,reorder:qty(raw.reorder||0),sourceStatus:text(raw.sourceStatus,80)};
    inv.balances[sku]={};for(const location of Object.keys(LOCATIONS)){const quantity=qty(raw.balances?.[location]||0);inv.balances[sku][location]=quantity;if(quantity)inv.movements.push({id:crypto.randomUUID(),type:'opening',sku,quantity,from:null,to:location,reference:'Opening reconciliation',note:'Approved physical balance; historical movements already included.',createdAt:now});}
  }
  for(const number of input.accountedOrders||[]){const order=Object.values(state.orders||{}).find(o=>o.orderNumber===number);if(!order)throw Error(`Accounted order ${number} was not found.`);order.inventoryAccounted={at:now,reason:'Already included in approved opening physical count; do not deduct again.'};}
  state.inventory=inv;reconcileInventory(state,now);
  const paid=new Set(Object.values(state.orders||{}).map(o=>o.orderNumber));
  for(const entry of Object.values(state.checkoutRequests||{}))if(!paid.has(entry.orderNumber)&&now-Number(entry.reservedAt)<7200){const lines=entry.cartItems||entry.stockItems||[];entry.inventoryAllocation=allocate(state,lines,entry.orderNumber,{now});}
  return inventoryView(state,now);
}
export function inventoryMovement(state,input,now=nowSeconds()){
  const inv=inventory(state),id=text(input.requestId,80);if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))throw Error('A unique request ID is required.');
  const previous=inv.movements.find(m=>m.id===id);if(previous){if(previous.sku!==input.sku||previous.type!==input.type||previous.quantity!==Number(input.quantity)||previous.from!==(input.from||null)||previous.to!==(input.to||null)||previous.note!==text(input.note)||previous.reference!==text(input.reference,100))throw Error('This request ID was already used for a different movement.');return previous;}
  const sku=text(input.sku,30),product=inv.products[sku],type=text(input.type,30),quantity=qty(input.quantity),from=input.from||null,to=input.to||null,note=text(input.note),reference=text(input.reference,100);
  if(!product||!quantity||!note)throw Error('Select a product, positive quantity and a reason.');
  if(!['receipt','transfer','sample','adjustment_in','adjustment_out','return'].includes(type))throw Error('Unknown movement type.');
  if(from&&!LOCATIONS[from]||to&&!LOCATIONS[to]||from===to)throw Error('Choose valid, different locations.');
  if(type==='transfer'&&(!from||!to)||['sample','adjustment_out'].includes(type)&&(!from||to)||['receipt','return','adjustment_in'].includes(type)&&(from||!to))throw Error('Invalid movement direction.');
  if(from&&Number(inv.balances[sku][from])-used(state,sku,from,null,now)<quantity)throw Error('This stock is unavailable or reserved for orders.');
  if(from)inv.balances[sku][from]-=quantity;if(to)inv.balances[sku][to]+=quantity;
  const entry={id,type,sku,quantity,from,to,note,reference,createdAt:now};inv.movements.push(entry);reconcileInventory(state,now);return entry;
}
export function inventoryView(state,now=nowSeconds()){
  if(!state.inventory?.initializedAt)return {initialized:false,locations:LOCATIONS};
  const inv=state.inventory,products=Object.values(inv.products).map(product=>{const balances=inv.balances[product.sku],reserved=Object.fromEntries(Object.keys(LOCATIONS).map(l=>[l,used(state,product.sku,l,null,now)]));return {...product,balances,reserved,total:Object.values(balances).reduce((a,b)=>a+b,0),available:product.saleLocations.reduce((sum,l)=>sum+Math.max(0,balances[l]-reserved[l]),0)};});
  return {initialized:true,initializedAt:inv.initializedAt,source:inv.source,sourceAsOf:inv.sourceAsOf,locations:LOCATIONS,products,movements:inv.movements.slice().reverse(),sourceHistory:inv.sourceHistory,exceptions:Object.values(state.orders||{}).filter(o=>o.inventoryException&&!noStockOrder(o)).map(o=>({orderNumber:o.orderNumber,error:o.inventoryException}))};
}
export function publicAvailability(state){return {initialized:Boolean(state.inventory?.initializedAt),items:(inventoryView(state).products||[]).filter(p=>p.tracked).map(p=>({sku:p.sku,available:p.available,localAvailable:Math.max(0,p.balances.gc-p.reserved.gc),canBuy:p.available>0}))};}

export function renderInventoryContent(markup,state,{feed=false}={}){
  const bySku=new Map(publicAvailability(state).items.map(i=>[i.sku,i]));if(!bySku.size)return markup;
  if(feed)return markup.replace(/<item>[\s\S]*?<\/item>/g,item=>{const sku=item.match(/<g:id>([^<]+)<\/g:id>/)?.[1],stock=bySku.get(sku);return stock?item.replace(/<g:availability>[^<]+<\/g:availability>/,`<g:availability>${stock.canBuy?'in_stock':'out_of_stock'}</g:availability>`):item;});
  return markup.replace(/(<script id="product-data" type="application\/json">)([\s\S]*?)(<\/script>)/,(_,start,json,end)=>{const product=JSON.parse(json);for(const variant of product.variants||[]){const stock=bySku.get(variant.sku);if(stock){variant.stockQuantity=stock.available;variant.inventoryAvailable=stock.available;variant.localStockQuantity=stock.localAvailable;}}
    return start+JSON.stringify(product).replace(/</g,'\\u003c')+end;
  });
}
