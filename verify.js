const verificationToken=location.hash.slice(1);
history.replaceState(null,'',location.pathname);
let checkoutToken;
const status=document.getElementById('verify-status');
const verify=document.getElementById('verify-email');
const checkout=document.getElementById('continue-checkout');
async function post(path,data,token){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
}
verify.onclick=async()=>{
  verify.disabled=true;
  try{const result=await post('/api/email/verify',{token:verificationToken});checkoutToken=result.checkoutToken;verify.hidden=true;checkout.hidden=false;status.textContent='Email verified. Continue to Checkout. Keep this tab open if a payment request needs retrying.';}
  catch(error){status.textContent=error.message;}
};
checkout.onclick=async()=>{
  checkout.disabled=true;
  try{const result=await post('/api/checkout',{},checkoutToken);const url=new URL(result.url);if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com')throw new Error('Checkout unavailable');location.assign(url.href);}
  catch(error){status.textContent=error.message;checkout.disabled=false;}
};
