import Stripe from 'stripe';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {voiceReady} from './voice.mjs';
import { PACKAGES, localParts, localDate, weekOf, chicagoEpoch, paidSessionMatches, digest, cryptToken } from './domain.mjs';
const now = () => Math.floor(Date.now()/1000);
const json = (value,status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail = (message,status=400) => {const error=new Error(message);error.status=status;throw error;};
export const query = (env,sql,...args) => env.DB.prepare(sql).bind(...args);
async function body(request) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json')) fail('JSON body required',415);
  const text=await request.text();if(text.length>20000)fail('Request too large',413);
  try{return JSON.parse(text);}catch{fail('Invalid JSON');}
}
export function stripe(env) {return new Stripe(env.STRIPE_SECRET_KEY,{httpClient:Stripe.createFetchHttpClient(),maxNetworkRetries:2});}
export async function readiness(env) {
  if(env.PAYMENTS_ENABLED!=='true' || !env.DB || !env.BOOKING_LIMITER || !env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_PAYMENT_CONFIGURATION || !env.EXPECTED_STRIPE_ACCOUNT || !env.TOKEN_ENCRYPTION_KEY || !env.RESEND_API_KEY || !env.EMAIL_FROM || !env.CONTACT_EMAIL || !env.TERMS_VERSION || env.TERMS_APPROVED!=='true' || env.TAX_REVIEW_COMPLETE!=='true' || env.LAUNCH_TESTS_PASSED!=='true' || !env.SITE_URL) return false;
  if(env.ENVIRONMENT==='preview' && env.STRIPE_LIVE==='true') return false;
  if(env.ENVIRONMENT==='production' && env.STRIPE_LIVE!=='true')return false;
  const keyMode=env.STRIPE_LIVE==='true'?'live':'test';
  if(!new RegExp('^(sk|rk)_'+keyMode+'_').test(env.STRIPE_SECRET_KEY))return false;
  const account=await stripe(env).accounts.retrieve();
  return account.id===env.EXPECTED_STRIPE_ACCOUNT && (env.STRIPE_LIVE!=='true' || (account.charges_enabled===true && account.payouts_enabled===true));
}
async function admin(request,env) {
  if(!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL) fail('Owner access is not configured',503);
  const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token) fail('Owner sign-in required',401);
  const issuer='https://'+env.ACCESS_TEAM_DOMAIN;
  try {const {payload}=await jwtVerify(token,createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs')),{issuer,audience:env.ACCESS_AUD});if(payload.email!==env.ADMIN_EMAIL)fail('Owner access required',403);return payload.email;}catch{fail('Owner access required',403);}
}
async function client(request,env) {
  const auth=request.headers.get('Authorization')||'';const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!/^[a-f0-9]{64}$/.test(token))fail('Private booking link required',401);
  const booking=await query(env,"SELECT * FROM bookings WHERE token_hash=? AND deposit_paid=1 AND status IN ('confirmed','completed')",await digest(token)).first();
  if(!booking)fail('Verified paid booking required',403);return booking;
}
async function audit(env,actor,action,resource) {await query(env,'INSERT INTO audit VALUES(?,?,?,?,?)',crypto.randomUUID(),actor,action,resource,now()).run();}
export async function enqueue(env,id,booking,kind,due=now()) {await query(env,'INSERT OR IGNORE INTO outbox(id,booking_id,kind,due) VALUES(?,?,?,?)',id,booking,kind,due).run();}
function checkoutParams(env,booking,kind) {
  const p=PACKAGES[booking.package];
  const suffix=booking.id.replaceAll('-','').slice(0,8).replace(/[0-9a-f]/g,c=>'abcdefghijklmnop'[parseInt(c,16)]);
  return {mode:'payment',payment_method_configuration:env.STRIPE_PAYMENT_CONFIGURATION,customer_email:booking.email,client_reference_id:booking.id,metadata:{booking_id:booking.id,kind},integration_identifier:'blazevisionz_'+suffix,excluded_payment_method_types:['afterpay_clearpay','klarna','affirm'],line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:kind==='deposit'?p.deposit:p.balance,product_data:{name:`${p.name} — ${kind==='deposit'?'booking deposit':'remaining balance'}`}}}],expires_at:booking.expires,success_url:env.SITE_URL+'/?checkout=returned#booking',cancel_url:env.SITE_URL+'/?checkout=canceled#booking'};
}
async function createBooking(request,env) {
  if(!await readiness(env))fail('Booking is not open yet',503);
  const limited=await env.BOOKING_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});
  if(!limited.success)fail('Too many booking attempts. Please wait a minute.',429);
  const data=await body(request);
  if(data.acceptedTerms!==true || data.termsVersion!==env.TERMS_VERSION)fail('Review and accept the current booking terms');
  if(!PACKAGES[data.package] || typeof data.name!=='string' || !data.name.trim() || data.name.length>100 || typeof data.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length>254 || typeof data.slot!=='string') fail('Choose a package, appointment, name, and valid email');
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  const booking={id:crypto.randomUUID(),slot_id:data.slot,package:data.package,name:data.name.trim(),email:data.email.trim().toLowerCase(),created:now(),expires:now()+1860};
  try {await query(env,"INSERT INTO bookings(id,slot_id,package,name,email,status,created,expires,token_hash,token_cipher) VALUES(?,?,?,?,?,'held',?,?,?,?)",booking.id,booking.slot_id,booking.package,booking.name,booking.email,booking.created,booking.expires,await digest(token),await cryptToken(token,env.TOKEN_ENCRYPTION_KEY)).run();}catch{fail('This appointment is unavailable or the weekly limit is reached',409);}
  await query(env,'UPDATE bookings SET terms_version=?,terms_accepted=? WHERE id=?',env.TERMS_VERSION,now(),booking.id).run();
  // A timeout can still create a Stripe session; retain this reservation until reconciled.
  const session=await stripe(env).checkout.sessions.create(checkoutParams(env,booking,'deposit'),{idempotencyKey:'deposit-'+booking.id});
  await query(env,'UPDATE bookings SET checkout_id=? WHERE id=?',session.id,booking.id).run();
  return json({url:session.url},201);
}
async function createInquiry(request,env) {
  const data=await body(request);
  const types={'fashion-editorial':'Fashion + Editorial','local-business':'Local Business',event:'Event'};
  if(!types[data.type] || typeof data.name!=='string' || !data.name.trim() || data.name.length>100 || typeof data.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.email.length>254 || typeof data.phone!=='string' || !data.phone.trim() || data.phone.length>40) fail('Choose an inquiry type and enter valid contact details');
  if(data.date && (typeof data.date!=='string' || !/^\d{4}-\d\d-\d\d$/.test(data.date)))fail('Use a valid target date');
  for(const [field,limit] of [['location',1000],['objectives',2000],['scope',3000]])if(typeof data[field]!=='string' || !data[field].trim() || data[field].length>limit)fail('Complete the consultation inquiry details');
  const inquiry={id:crypto.randomUUID(),type:data.type,name:data.name.trim(),email:data.email.trim().toLowerCase(),phone:data.phone.trim(),target_date:data.date||null,location:data.location.trim(),objectives:data.objectives.trim(),scope:data.scope.trim(),created:now()};
  let emailQueued=false;
  if(env.DB)await query(env,'INSERT INTO inquiries(id,type,name,email,phone,target_date,location,objectives,scope,created,email_queued) VALUES(?,?,?,?,?,?,?,?,?,?,0)',inquiry.id,inquiry.type,inquiry.name,inquiry.email,inquiry.phone,inquiry.target_date,inquiry.location,inquiry.objectives,inquiry.scope,inquiry.created).run();
  if(env.RESEND_API_KEY && env.EMAIL_FROM && env.CONTACT_EMAIL && env.ADMIN_EMAIL) {
    const text=`Blazing Visuals / Blazevisionz\n\nConsultation inquiry: ${types[inquiry.type]}\nName: ${inquiry.name}\nEmail: ${inquiry.email}\nPhone: ${inquiry.phone}\nTarget date: ${inquiry.target_date||'Not provided'}\nLocation / venue: ${inquiry.location}\n\nProject objectives:\n${inquiry.objectives}\n\nDeliverables, people/models, usage, video, logistics, and budget:\n${inquiry.scope}\n\nPolicy: required consultation -> written scope and quote -> agreement -> retainer -> confirmed booking. Do not send a payment or booking path before scope approval.`;
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'inquiry-'+inquiry.id},body:JSON.stringify({from:env.EMAIL_FROM,to:[env.ADMIN_EMAIL],reply_to:inquiry.email,subject:'Blazevisionz consultation inquiry — '+types[inquiry.type],text})});
    if(!response.ok)fail('Inquiry saved, but email delivery is not configured. Please try again later.',503);
    emailQueued=true;
    if(env.DB)await query(env,'UPDATE inquiries SET email_queued=1 WHERE id=?',inquiry.id).run();
  }
  return json({saved:true,emailQueued},202);
}
export async function processPaid(env,session,eventId) {
  const id=session.metadata?.booking_id;const kind=session.metadata?.kind;
  if(!id || !['deposit','balance'].includes(kind))return;
  const booking=await query(env,'SELECT * FROM bookings WHERE id=?',id).first();if(!booking)return;
  if(!paidSessionMatches(session,booking,kind,env.STRIPE_LIVE==='true'))fail('Payment verification mismatch',409);
  const statements=[query(env,'INSERT OR IGNORE INTO payment_events VALUES(?,?,?,?)',eventId,id,kind,now())];
  if(kind==='deposit') {
    if(!['held','confirmed'].includes(booking.status)) {await enqueue(env,'review-'+eventId,id,'payment_review');return;}
    statements.push(query(env,"UPDATE bookings SET deposit_paid=1,status='confirmed' WHERE id=? AND status='held'",id));
    const slot=await query(env,'SELECT * FROM slots WHERE id=?',booking.slot_id).first();
    for(const [key,type,due] of [['confirmed','confirmation',now()],['brief','owner_confirmation',now()],['reminder','shoot_reminder',Math.max(now(),slot.start-86400)]]) statements.push(query(env,'INSERT OR IGNORE INTO outbox(id,booking_id,kind,due) VALUES(?,?,?,?)',id+'-'+key,id,type,due));
  } else {
    if(!['confirmed','completed'].includes(booking.status))fail('Booking is not active',409);
    statements.push(query(env,'UPDATE bookings SET balance_paid=1 WHERE id=?',id));
    statements.push(query(env,'INSERT OR IGNORE INTO outbox(id,booking_id,kind,due) VALUES(?,?,?,?)',id+'-balance',id,'balance_receipt',now()));
  }
  await env.DB.batch(statements);
}
async function webhook(request,env) {
  if(!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.EXPECTED_STRIPE_ACCOUNT)fail('Webhook not configured',503);
  const raw=await request.text();if(raw.length>262144)fail('Webhook too large',413);
  let event;try{event=await stripe(env).webhooks.constructEventAsync(raw,request.headers.get('Stripe-Signature'),env.STRIPE_WEBHOOK_SECRET,300,Stripe.createSubtleCryptoProvider());}catch{fail('Invalid webhook signature',400);}
  if(event.livemode!==(env.STRIPE_LIVE==='true') || event.account && event.account!==env.EXPECTED_STRIPE_ACCOUNT)fail('Wrong account or payment environment',400);
  const account=await stripe(env).accounts.retrieve();if(account.id!==env.EXPECTED_STRIPE_ACCOUNT)fail('Wrong Stripe account',409);
  if(await query(env,'SELECT id FROM payment_events WHERE id=?',event.id).first())return json({received:true});
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
    const session=await stripe(env).checkout.sessions.retrieve(event.data.object.id);
    if(session.payment_status==='paid')await processPaid(env,session,event.id);
  } else if(event.type==='checkout.session.expired') {
    const session=await stripe(env).checkout.sessions.retrieve(event.data.object.id);
    if(session.status==='expired' && session.payment_status!=='paid')await query(env,"UPDATE bookings SET status='expired' WHERE checkout_id=? AND status='held'",session.id).run();
  }
  return json({received:true});
}
async function clientRoute(request,env,path) {
  const booking=await client(request,env);const p=PACKAGES[booking.package];
  if(request.method==='GET') {
    const slot=await query(env,'SELECT start FROM slots WHERE id=?',booking.slot_id).first();
    const consult=await query(env,'SELECT s.start FROM consultations c JOIN slots s ON s.id=c.slot_id WHERE c.booking_id=?',booking.id).first();
    const slots=booking.intake&&!consult?(await query(env,"SELECT id,start FROM slots WHERE kind='consult' AND open=1 AND start>? AND start<? AND NOT EXISTS(SELECT 1 FROM consultations WHERE slot_id=slots.id) ORDER BY start",now(),slot.start).all()).results:[];
    return json({voiceRemindersAvailable:voiceReady(env),package:p.name,start:slot.start,name:booking.name,email:booking.email,consent:!!booking.consent,intake:booking.intake?JSON.parse(booking.intake):null,consult,slots,balance:p.balance/100,balancePaid:!!booking.balance_paid,proofUrl:booking.proof_url,deliveryUrl:booking.balance_paid?booking.delivery_url:null});
  }
  const data=await body(request);
  if(path.endsWith('/intake')) {
    const fields=['name','email','phone','purpose','aesthetic','inspiration','outfits','location','posing','requests','usage'];const intake={};
    for(const field of fields){if(typeof data[field]!=='string' || data[field].length>2000)fail('Invalid intake');intake[field]=data[field].trim();}
    if(['name','email','phone','purpose','aesthetic','location','usage'].some(field=>!intake[field]))fail('Complete required intake fields');
    intake.voiceReminderConsent=voiceReady(env) && data.voiceReminderConsent===true;
    intake.voiceReminderConsentUpdated=now();
    if(intake.voiceReminderConsent && !/^\+1[2-9]\d{9}$/.test(intake.phone))fail('For automated call reminders, use +1 followed by your ten-digit US phone number');
    await query(env,'UPDATE bookings SET intake=?,consent=?,consent_updated=? WHERE id=?',JSON.stringify(intake),data.portfolioPermission===true?1:0,now(),booking.id).run();
    await enqueue(env,booking.id+'-intake-'+crypto.randomUUID(),booking.id,'owner_brief');
  } else if(path.endsWith('/consult')) {
    const shoot=await query(env,'SELECT start FROM slots WHERE id=?',booking.slot_id).first();const slot=await query(env,'SELECT * FROM slots WHERE id=?',data.slot).first();
    if(!slot || slot.start>=shoot.start)fail('Choose a phone call before your shoot');
    try{await env.DB.batch([query(env,'INSERT INTO consultations VALUES(?,?)',booking.id,data.slot),query(env,'INSERT OR IGNORE INTO outbox(id,booking_id,kind,due) VALUES(?,?,?,?)',booking.id+'-consult',booking.id,'consult_confirmation',now()),query(env,'INSERT OR IGNORE INTO outbox(id,booking_id,kind,due) VALUES(?,?,?,?)',booking.id+'-consult-reminder',booking.id,'consult_reminder',Math.max(now(),slot.start-3600))]);}catch{fail('Consultation unavailable; paid booking and intake are required',409);}
  } else if(path.endsWith('/balance')) {
    if(!await readiness(env))fail('Payments unavailable',503);if(booking.balance_paid)fail('Balance already paid',409);
    let session;
    if(booking.balance_checkout_id){session=await stripe(env).checkout.sessions.retrieve(booking.balance_checkout_id);if(session.status==='complete')fail('Payment is processing; wait for verification',409);}
    if(!session || session.status==='expired') {
      const attemptId=`balance-${booking.id}-${booking.balance_checkout_id||'initial'}`;
      await query(env,'INSERT OR IGNORE INTO checkout_attempts(id,expires) VALUES(?,?)',attemptId,now()+1860).run();
      const attempt=await query(env,'SELECT expires FROM checkout_attempts WHERE id=?',attemptId).first();
      session=await stripe(env).checkout.sessions.create(checkoutParams(env,{...booking,expires:attempt.expires},'balance'),{idempotencyKey:attemptId});
      await query(env,'UPDATE bookings SET balance_checkout_id=? WHERE id=?',session.id,booking.id).run();
    }
    return json({url:session.url});
  } else if(path.endsWith('/selection')) {
    if(!booking.proof_url || typeof data.selection!=='string' || !data.selection.trim() || data.selection.length>2000)fail('Proof gallery and image identifiers required');
    const identifiers=data.selection.split(/[\n,]+/).map(v=>v.trim()).filter(Boolean);
    if(identifiers.length!==p.images || new Set(identifiers).size!==p.images)fail(`Select exactly ${p.images} distinct image identifiers. Ask the studio to quote additional edits separately.`);
    await query(env,'UPDATE bookings SET selections=? WHERE id=?',identifiers.join('\n'),booking.id).run();
    await enqueue(env,booking.id+'-selections-'+crypto.randomUUID(),booking.id,'owner_selections');
  } else fail('Not found',404);
  return json({saved:true});
}
async function adminRoute(request,env,path) {
  const actor=await admin(request,env);
  if(request.method==='GET')return json({slots:(await query(env,'SELECT * FROM slots ORDER BY start').all()).results,blocks:(await query(env,'SELECT * FROM blocks ORDER BY start').all()).results,weeks:(await query(env,'SELECT * FROM weeks ORDER BY week').all()).results,bookings:(await query(env,'SELECT id,package,name,email,status,deposit_paid,balance_paid,intake,consent,consent_updated,selections,proof_url,delivery_url,slot_id FROM bookings ORDER BY created DESC').all()).results});
  const data=await body(request);const action=path.split('/').at(-1);let resource=crypto.randomUUID();
  if(action==='week') {
    if(!/^\d{4}-\d\d-\d\d$/.test(data.week)||new Date(data.week+'T12:00Z').getUTCDay()!==1 || !Number.isInteger(data.limit) || data.limit<1 || data.limit>6)fail('Choose a Monday and a limit from 1 to 6');
    const count=await query(env,"SELECT COUNT(*) AS n FROM bookings b JOIN slots s ON s.id=b.slot_id WHERE s.week=? AND b.status IN ('held','confirmed','completed','payment_review')",data.week).first();if(count.n>data.limit)fail('Limit cannot be below existing reservations',409);
    await query(env,'INSERT INTO weeks VALUES(?,?) ON CONFLICT(week) DO UPDATE SET booking_limit=excluded.booking_limit',data.week,data.limit).run();resource=data.week;
  } else if(action==='block') {
    const start=chicagoEpoch(data.start),end=chicagoEpoch(data.end);if(end<=start || !['security','family','b4us','other'].includes(data.kind) || data.kind==='b4us' && weekOf(start)!==weekOf(end-1))fail('Invalid commitment. B4US blocks must be within one week.');
    await query(env,'INSERT INTO blocks VALUES(?,?,?,?,?)',resource,data.kind,start,end,weekOf(start)).run();
  } else if(action==='slot') {
    const start=chicagoEpoch(data.start);if(start<=now() || !['shoot','consult'].includes(data.kind))fail('Choose a future appointment');
    if(data.kind==='shoot' && !['Wed','Thu','Fri','Sat','Sun'].includes(localParts(start).weekday))fail('Photography days are Wednesday through Sunday');
    const minutes=data.kind==='consult'?10:Number(data.minutes),before=Number(data.before),after=Number(data.after);
    if(![minutes,before,after].every(Number.isInteger)||minutes<10||minutes>180||before<0||before>180||after<0||after>180)fail('Invalid duration or buffers');
    const end=start+minutes*60;if(localDate(start)!==localDate(end-1))fail('Appointments must remain within one Chicago date');
    await query(env,'INSERT INTO slots(id,kind,start,end,before_minutes,after_minutes,week,local_date) VALUES(?,?,?,?,?,?,?,?)',resource,data.kind,start,end,before,after,weekOf(start),localDate(start)).run();
  } else if(action==='close' || action==='close-date') {
    const predicate=action==='close'?'id=?':'local_date=?';resource=action==='close'?data.id:data.date;
    const occupied=await query(env,`SELECT s.id FROM slots s WHERE s.${predicate} AND (EXISTS(SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN ('held','confirmed','completed','payment_review')) OR EXISTS(SELECT 1 FROM consultations c JOIN bookings b ON b.id=c.booking_id WHERE c.slot_id=s.id AND b.status IN ('confirmed','completed')))`,resource).first();if(occupied)fail('Cancel or reschedule affected bookings first',409);
    await query(env,`UPDATE slots SET open=0 WHERE ${predicate}`,resource).run();
  } else if(action==='client') {
    const booking=await query(env,'SELECT * FROM bookings WHERE id=?',data.id).first();if(!booking)fail('Booking not found',404);resource=booking.id;
    if(data.action==='cancel') {
      if(booking.status==='held' || !booking.deposit_paid)fail('Reconcile pending payment before cancellation',409);
      await env.DB.batch([query(env,"UPDATE bookings SET status='canceled',token_hash=? WHERE id=?",await digest(crypto.randomUUID()),booking.id),query(env,'DELETE FROM consultations WHERE booking_id=?',booking.id),query(env,'DELETE FROM outbox WHERE booking_id=? AND sent IS NULL',booking.id)]);
      await enqueue(env,booking.id+'-canceled',booking.id,'cancellation');
    } else if(data.action==='complete') {
      if(!booking.balance_paid)fail('Verified full payment required',409);
      await query(env,"UPDATE bookings SET status='completed' WHERE id=? AND status='confirmed'",booking.id).run();
    } else if(['proof','delivery'].includes(data.action)) {
      if(!['confirmed','completed'].includes(booking.status) || !booking.deposit_paid)fail('Verified active booking required',409);
      let url;try{url=new URL(data.url);}catch{fail('Valid private HTTPS gallery URL required');}if(url.protocol!=='https:'||url.username||url.password)fail('HTTPS gallery URL required');
      if(data.action==='delivery' && (!booking.balance_paid || !booking.selections))fail('Verified balance and selections required',409);
      await query(env,`UPDATE bookings SET ${data.action==='proof'?'proof_url':'delivery_url'}=? WHERE id=?`,url.href,booking.id).run();
      await enqueue(env,booking.id+'-'+data.action,booking.id,data.action);
      if(data.action==='delivery')await enqueue(env,booking.id+'-review',booking.id,'review',now()+3*86400);
    } else if(data.action==='reschedule') {
      if(booking.status!=='confirmed')fail('Only confirmed sessions can be rescheduled');
      const slot=await query(env,"SELECT * FROM slots WHERE id=? AND open=1 AND kind='shoot' AND start>?",data.slot,now()).first();
      if(!slot || slot.end-slot.start<PACKAGES[booking.package].minutes*60)fail('Choose an open appointment with enough time');
      // INSERT triggers also apply on moves through the dedicated UPDATE trigger in the migration.
      await env.DB.batch([query(env,'UPDATE bookings SET slot_id=? WHERE id=?',data.slot,booking.id),query(env,'DELETE FROM consultations WHERE booking_id=?',booking.id),query(env,'DELETE FROM outbox WHERE booking_id=? AND sent IS NULL',booking.id)]);
      await enqueue(env,booking.id+'-rescheduled-'+crypto.randomUUID(),booking.id,'confirmation');
      await enqueue(env,booking.id+'-reminder-'+crypto.randomUUID(),booking.id,'shoot_reminder',Math.max(now(),slot.start-86400));
    } else fail('Unsupported client action');
  } else if(action==='dispatch') {const {maintenance}=await import('./operations.mjs');await maintenance(env);return json({processed:true});}
  else fail('Not found',404);
  await audit(env,actor,action,resource);return json({saved:true});
}
export async function handle(request,env) {
  const path=new URL(request.url).pathname;
  try {
    if(path==='/api/availability' && request.method==='GET') {
      const packageId=new URL(request.url).searchParams.get('package')||'essential';if(!PACKAGES[packageId])fail('Invalid package');
      const ready=await readiness(env);
      if(!env.DB)return json({paymentsEnabled:false,slots:[]});
      const slots=(await query(env,"SELECT s.id,s.start FROM slots s JOIN weeks w ON w.week=s.week WHERE s.kind='shoot' AND s.open=1 AND s.start>? AND s.end-s.start>=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE slot_id=s.id AND status IN ('held','confirmed','completed','payment_review')) AND (SELECT COUNT(*) FROM bookings b JOIN slots bs ON bs.id=b.slot_id WHERE bs.week=s.week AND b.status IN ('held','confirmed','completed','payment_review'))<w.booking_limit ORDER BY s.start LIMIT 100",now(),PACKAGES[packageId].minutes*60).all()).results;
      return json({paymentsEnabled:ready,slots:ready?slots:[],...(ready?{termsVersion:env.TERMS_VERSION}:{})});
    }
    if(!env.DB)fail('Booking infrastructure not configured',503);
    if(path==='/api/webhook' && request.method==='POST')return await webhook(request,env);
    if(!['GET','POST'].includes(request.method))fail('Method not allowed',405);
    if(request.method==='POST' && request.headers.get('Origin')!==new URL(request.url).origin)fail('Same-origin request required',403);
    if(path==='/api/inquiries' && request.method==='POST')return await createInquiry(request,env);
    if(path==='/api/bookings' && request.method==='POST')return await createBooking(request,env);
    if(path==='/api/admin' || path.startsWith('/api/admin/'))return await adminRoute(request,env,path);
    if(path==='/api/client' || path.startsWith('/api/client/'))return await clientRoute(request,env,path);
    fail('Not found',404);
  } catch(error) {
    if(error.status)return json({error:error.message},error.status);
    console.error(JSON.stringify({type:'booking_error',path,message:'Operation failed'}));
    return json({error:'Unable to complete this operation. Please retry or contact the studio.'},500);
  }
}
