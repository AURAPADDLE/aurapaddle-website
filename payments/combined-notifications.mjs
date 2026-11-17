const email=value=>{const result=String(value||"").trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)&&result.length<=254?result:""};

function shared(order,requestId,now){return {combined:true,requestId,orderNumber:order.parentOrderNumber,trackingToken:order.trackingToken||"",amountTotal:order.amountPaid,currency:order.currency||"aud",customerName:order.customer?.name||"",customerEmail:email(order.customer?.email),customerPhone:order.customer?.phone||"",deliveryAddress:structuredClone(order.deliveryAddress||null),groups:structuredClone(order.groups||[]),status:"pending",attempts:0,nextAttemptAt:0,createdAt:now,updatedAt:now}}

export function queueCombinedOrderEmails(state,{requestId,eventId,adminEmail="admin@aurapaddle.com",now=0}={}){
  const order=state.combinedOrders?.[requestId];if(!order)return false;state.transactionalEmailOutbox??={};let queued=false;const base=shared(order,requestId,now),customer=base.customerEmail,admin=email(adminEmail);
  for(const [kind,recipient] of [["combined_customer_confirmation",customer],["combined_admin_notification",admin]]){if(!recipient)continue;const key=`${eventId}:${kind}`;if(!state.transactionalEmailOutbox[key]){state.transactionalEmailOutbox[key]={...structuredClone(base),key,kind,recipient};queued=true}}
  return queued;
}

export function queueCombinedGroupEmail(state,{requestId,groupId,kind,eventId,now=0}={}){
  const order=state.combinedOrders?.[requestId],group=order?.groups.find(item=>item.id===groupId),recipient=email(order?.customer?.email);if(!order||!group||!recipient||!["combined_balance_requested","combined_balance_paid","combined_group_dispatched"].includes(kind))return false;
  state.transactionalEmailOutbox??={};const key=`${eventId}:${kind}`;if(state.transactionalEmailOutbox[key])return false;state.transactionalEmailOutbox[key]={...shared(order,requestId,now),key,kind,recipient,group:structuredClone(group)};return true;
}
