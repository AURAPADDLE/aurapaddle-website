(()=>{
  const form=document.getElementById('newsletterForm');if(!form)return;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const status=document.getElementById('newsletterStatus'),button=form.querySelector('button[type=submit]');
    if(button.disabled)return;button.disabled=true;status.style.display='block';status.textContent='Saving your signup…';
    const ownCapture=new URL(form.action,location.href).pathname==='/api/newsletter/subscribe';let response;
    try{
      const fields=new FormData(form);
      response=await fetch(form.action,ownCapture?{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(fields))}:{method:'POST',headers:{Accept:'application/json'},body:fields});
      if(!response.ok)throw new Error('Signup not saved');
      // Do not fall back to Formspree after an uncertain first-party submission.
      status.textContent=ownCapture?'Thank you. Your signup request has been recorded for review.':'Thank you. Your signup request has been received.';
      window.AURATracking?.event('sign_up',{method:'newsletter',form_location:'homepage'});form.reset();
      if(ownCapture)form.elements.request_id.value=crypto.randomUUID();
    }catch{
      status.textContent='We could not confirm your subscription was saved. Please try again or email admin@aurapaddle.com.';
      window.AURATracking?.event('form_submit_error',{form_type:'newsletter',error_code:window.AURATracking?.errorCode(response)||'request_failed'});
    }finally{button.disabled=false}
  });
})();
