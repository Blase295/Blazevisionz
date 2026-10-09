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
      if(!session){await enqueue(env,booking.id+'-orphan',booking.id,'payment_review');continue;}
      if(session.payment_status==='paid'){await processPaid(env,session,'reconcile-'+session.id);continue;}
      if(session.status==='open')session=await stripe(env).checkout.sessions.expire(session.id);
      if(session.status==='expired' && session.payment_status!=='paid')await query(env,"UPDATE bookings SET status='expired' WHERE id=? AND status='held'",booking.id).run();
    }
  }
  if(!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.CONTACT_EMAIL || !env.TOKEN_ENCRYPTION_KEY || !env.ADMIN_EMAIL)return;
  const messages=(await query(env,'SELECT * FROM outbox WHERE sent IS NULL AND due<=? AND attempts<10 ORDER BY due LIMIT 20',now()).all()).results;
  for(const message of messages) {
    const booking=await query(env,'SELECT * FROM bookings WHERE id=?',message.booking_id).first();if(!booking)continue;
    if(booking.status==='canceled' && message.kind!=='cancellation'){await query(env,'UPDATE outbox SET sent=? WHERE id=?',now(),message.id).run();continue;}
    const token=await cryptToken(booking.token_cipher,env.TOKEN_ENCRYPTION_KEY,true);
    const link=env.SITE_URL+'/client.html#'+token;
    const p=PACKAGES[booking.package];const slot=await query(env,'SELECT start FROM slots WHERE id=?',booking.slot_id).first();
    const date=format(slot.start);
    const consult=await query(env,'SELECT s.start FROM consultations c JOIN slots s ON s.id=c.slot_id WHERE c.booking_id=?',booking.id).first();
    const phoneTime=consult?format(consult.start):'';
    const owner=message.kind.startsWith('owner_')||message.kind==='payment_review';
    const descriptions={
      confirmation:`Your ${p.name} is confirmed for ${date} (America/Chicago). Deposit received: $${p.deposit/100}. Remaining balance: $${p.balance/100}, due by the end of your session. Complete your intake, then schedule your complimentary 10-minute phone consultation.`,
      owner_confirmation:`Verified booking: ${booking.name}, ${booking.email}, ${p.name}, ${date}.`,
      owner_brief:`Creative brief for ${booking.name}:\n${booking.intake||'Intake pending'}\nPortfolio permission: ${booking.consent?'Yes':'No'}.`,
      owner_selections:`Image selections from ${booking.name}:\n${booking.selections}`,
      shoot_reminder:`Your photography session is ${date} (America/Chicago). Please arrive ready with your agreed outfits. Remaining balance: $${booking.balance_paid?0:p.balance/100}.`,
      consult_confirmation:`Your 10-minute phone consultation is ${phoneTime} (America/Chicago). We will call the phone number in your intake.`,
      consult_reminder:`Reminder: your 10-minute phone consultation is ${phoneTime} (America/Chicago).`,
      balance_receipt:`Your remaining balance of $${p.balance/100} has been verified as paid. Thank you.`,
      proof:`Your private proof gallery is ready in your client portal. Choose ${p.images} included images. Additional edits must be quoted and paid separately at $20 each.`,
      delivery:'Your final JPEG images are ready in your private client portal.',
      review:`Thank you for creating with Blazevisionz. Reply to share your feedback.${env.REVIEW_URL?' You may leave a review at '+env.REVIEW_URL:''}`,
      cancellation:'Your session has been canceled by the studio. Any applicable refund is handled separately through Stripe; this email does not confirm a refund.',
      payment_review:`Payment requires owner review for booking ${booking.id}. Do not confirm or release until reconciled.`
    };
    const text=`Blazing Visuals / Blazevisionz\n\n${descriptions[message.kind]||message.kind}\n\n${owner||message.kind==='cancellation'?'':'Private client portal (do not share): '+link+'\n\n'}Questions, cancellation, or rescheduling: ${env.CONTACT_EMAIL}`;
    try {
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':message.id},body:JSON.stringify({from:env.EMAIL_FROM,to:[owner?env.ADMIN_EMAIL:booking.email],reply_to:env.CONTACT_EMAIL,subject:'Blazing Visuals — '+message.kind.replaceAll('_',' '),text})});
      if(!response.ok)throw new Error('Email provider rejected delivery');
      await query(env,'UPDATE outbox SET sent=?,attempts=attempts+1,last_error=NULL WHERE id=?',now(),message.id).run();
    }catch {await query(env,"UPDATE outbox SET attempts=attempts+1,last_error='Delivery failed; inspect provider' WHERE id=?",message.id).run();}
  }
}
