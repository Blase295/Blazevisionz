import {query,stripe,processPaid,enqueue} from './api.mjs';
import {PACKAGES,cryptToken} from './domain.mjs';
import {voiceMaintenance} from './voice.mjs';
const now=()=>Math.floor(Date.now()/1000);
const format=epoch=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'}).format(new Date(epoch*1000));
export async function maintenance(env) {
  if(!env.DB)return;
  try{await voiceMaintenance(env);}catch{console.error('Voice reminder maintenance failed; inspect Twilio configuration');}
  if(env.STRIPE_SECRET_KEY && env.EXPECTED_STRIPE_ACCOUNT) {
    const account=await stripe(env).accounts.retrieve();if(account.id!==env.EXPECTED_STRIPE_ACCOUNT)throw new Error('Wrong Stripe account');
    const holds=(await query(env,"SELECT * FROM bookings WHERE status='held' AND expires<? LIMIT 50",now()).all()).results;
    for(const booking of holds) {
      let session=booking.checkout_id?await stripe(env).checkout.sessions.retrieve(booking.checkout_id):null;
      // Unknown checkout outcomes remain blocked for owner reconciliation, never auto-released.
      if(!session && !booking.email_verified){await query(env,"UPDATE bookings SET status='expired' WHERE id=? AND status='held' AND email_verified IS NULL",booking.id).run();continue;}
      if(!session){await enqueue(env,booking.id+'-orphan',booking.id,'payment_review');continue;}
      if(session.payment_status==='paid'){await processPaid(env,session,'reconcile-'+session.id);continue;}
      if(session.status==='open')session=await stripe(env).checkout.sessions.expire(session.id);
      if(session.status==='expired' && session.payment_status!=='paid')await query(env,"UPDATE bookings SET status='expired' WHERE id=? AND status='held'",booking.id).run();
    }
  }
  if(!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.CONTACT_EMAIL || !env.TOKEN_ENCRYPTION_KEY || !env.ADMIN_EMAIL)return;
  const messages=(await query(env,'SELECT * FROM outbox WHERE sent IS NULL AND due<=? AND attempts<10 AND (lease_until IS NULL OR lease_until<?) ORDER BY due LIMIT 20',now(),now()).all()).results;
  for(const message of messages) {
    const booking=await query(env,'SELECT * FROM bookings WHERE id=?',message.booking_id).first();if(!booking)continue;
    if(booking.status==='canceled' && !['cancellation','payment_review'].includes(message.kind)){await query(env,'UPDATE outbox SET sent=? WHERE id=?',now(),message.id).run();continue;}
    const owner=message.kind.startsWith('owner_')||message.kind==='payment_review';
    if(!owner && message.kind!=='email_verification' && (!booking.email_verified || message.kind!=='cancellation' && (!booking.deposit_paid || !['confirmed','completed'].includes(booking.status))))continue;
    // Never retry beyond the provider's 24-hour idempotency retention window.
    // Unknown delivery after that window needs explicit provider reconciliation.
    if(message.first_attempt && now()-message.first_attempt>=23*3600){await query(env,"UPDATE outbox SET attempts=10,last_error='Reconcile provider acceptance before retry' WHERE id=?",message.id).run();continue;}
    const lease=crypto.randomUUID();
    const claimed=await query(env,'UPDATE outbox SET lease_id=?,lease_until=?,first_attempt=COALESCE(first_attempt,?),attempts=attempts+1 WHERE id=? AND sent IS NULL AND attempts<10 AND (lease_until IS NULL OR lease_until<?) RETURNING id',lease,now()+120,now(),message.id,now()).first();
    if(!claimed)continue;
    const token=await cryptToken(booking.token_cipher,env.TOKEN_ENCRYPTION_KEY,true);
    const link=env.SITE_URL+'/client.html#'+token;
    const p=PACKAGES[booking.package];const slot=await query(env,'SELECT start FROM slots WHERE id=?',booking.slot_id).first();
    const date=format(slot.start);
    const consult=await query(env,'SELECT s.start FROM consultations c JOIN slots s ON s.id=c.slot_id WHERE c.booking_id=?',booking.id).first();
    const phoneTime=consult?format(consult.start):'';
    const descriptions={
      confirmation:`Your ${p.name} is confirmed for ${date} (America/Chicago). Deposit received: $${(p.deposit/100).toFixed(2)}. Remaining balance: $${(p.balance/100).toFixed(2)}, due by the end of your session. Complete your intake, then schedule your complimentary 10-minute phone consultation.`,
      owner_confirmation:`Verified booking: ${booking.name}, ${booking.email}, ${p.name}, ${date}.`,
      owner_brief:`Creative brief for ${booking.name}:\n${booking.intake||'Intake pending'}\nPortfolio permission: ${booking.consent?'Yes':'No'}.`,
      owner_selections:`Image selections from ${booking.name}:\n${booking.selections}`,
      shoot_reminder:`Your photography session is ${date} (America/Chicago). Please arrive ready with your agreed outfits. Remaining balance: $${booking.balance_paid?0:p.balance/100}.`,
      consult_confirmation:`Your 10-minute phone consultation is ${phoneTime} (America/Chicago). We will call the phone number in your intake.`,
      consult_reminder:`Reminder: your 10-minute phone consultation is ${phoneTime} (America/Chicago).`,
      balance_receipt:`Your remaining balance of $${(p.balance/100).toFixed(2)} has been verified as paid. Thank you.`,
      proof:`Your private proof gallery is ready in your client portal. Choose ${p.images} included images. Additional edits must be quoted and paid separately at $20 each.`,
      delivery:'Your final JPEG images are ready in your private client portal.',
      review:`Thank you for creating with Blazevisionz. Reply to share your feedback.${env.REVIEW_URL?' You may leave a review at '+env.REVIEW_URL:''}`,
      cancellation:'Your session has been canceled by the studio. Any applicable refund is handled separately through Stripe; this email does not confirm a refund.',
      payment_review:`Payment requires owner review for booking ${booking.id}. Do not confirm or release until reconciled.`
    };
    let text=`Blazing Visuals / Blazevisionz\n\n${descriptions[message.kind]||message.kind}\n\n${owner||message.kind==='cancellation'?'':'Private client portal (do not share): '+link+'\n\n'}Questions, cancellation, or rescheduling: ${env.CONTACT_EMAIL}`;
    if(message.kind==='email_verification') {
      const verification=await query(env,'SELECT * FROM email_verifications WHERE booking_id=?',booking.id).first();
      if(!verification || verification.consumed || verification.expires<=now() || booking.status!=='held') {await query(env,'UPDATE outbox SET sent=?,lease_until=NULL WHERE id=? AND lease_id=?',now(),message.id,lease).run();continue;}
      const secret=await cryptToken(verification.token_cipher,env.TOKEN_ENCRYPTION_KEY,true);
      text=`Blazevisionz${booking.sandbox?' TEST ONLY — no live payment':''}\n\nVerify your email address before Checkout: ${env.SITE_URL}/verify.html#${secret}\n\nThis one-time link expires 15 minutes after your request. Verification does not confirm payment or a booking. If you did not request this, ignore this message. Contact: ${env.CONTACT_EMAIL}`;
    }
    try {
      if(booking.sandbox && message.kind!=='email_verification')text='TEST ONLY — no live payment or photography commitment.\n\n'+text;
      const payload=JSON.stringify({from:env.EMAIL_FROM,to:[owner?env.ADMIN_EMAIL:booking.email],reply_to:env.CONTACT_EMAIL,subject:(booking.sandbox?'[TEST ONLY] ':'')+'Blazing Visuals — '+message.kind.replaceAll('_',' '),text});
      // Retried requests must preserve both idempotency key and exact message content.
      // Encrypt the snapshot because it may contain a private portal/verification link.
      const snapshot=await query(env,'UPDATE outbox SET payload_cipher=COALESCE(payload_cipher,?) WHERE id=? AND lease_id=? RETURNING payload_cipher',await cryptToken(payload,env.TOKEN_ENCRYPTION_KEY),message.id,lease).first();
      if(!snapshot)continue;
      const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':message.id},body:await cryptToken(snapshot.payload_cipher,env.TOKEN_ENCRYPTION_KEY,true)});
      if(!response.ok)throw new Error('Email provider rejected delivery');
      const result=await response.json();if(!result.id)throw new Error('Missing provider receipt');
      await query(env,'UPDATE outbox SET sent=?,provider_id=?,lease_until=NULL,last_error=NULL WHERE id=? AND lease_id=?',now(),result.id,message.id,lease).run();
    }catch {await query(env,"UPDATE outbox SET due=?,lease_until=NULL,last_error='Delivery failed; inspect provider' WHERE id=? AND lease_id=?",now()+Math.min(3600,60*2**message.attempts),message.id,lease).run();}
  }
}
