const seconds=()=>Math.floor(Date.now()/1000);
const q=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
export function voiceReady(env){
  return env.TWILIO_ENABLED==='true' && env.TWILIO_LAUNCH_APPROVED==='true' && env.TWILIO_TESTS_PASSED==='true' && (/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID||'') && env.TWILIO_ACCOUNT_SID===env.TWILIO_EXPECTED_ACCOUNT) && /^SK[0-9a-f]{32}$/i.test(env.TWILIO_API_KEY||'') && !!env.TWILIO_API_SECRET && /^\+1[2-9]\d{9}$/.test(env.TWILIO_FROM||'') && !!env.DB;
}
export function reminderEligible(booking,start,epoch=seconds()){
  let intake;try{intake=JSON.parse(booking.intake||'{}');}catch{return false;}
  return booking.status==='confirmed' && booking.deposit_paid===1 && intake.voiceReminderConsent===true && /^\+1[2-9]\d{9}$/.test(intake.phone||'') && start>epoch && start<=epoch+3600;
}
export function reminderTwiml(start){
  const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'}).format(new Date(start*1000));
  return `<Response><Say language="en-US">This is an automated reminder from Blazing Visuals. Your ten minute phone consultation is scheduled for ${date}, Central time. Please be ready for your photographer's call. Thank you.</Say><Hangup/></Response>`;
}
async function api(env,path,body){
  const ACCOUNT=env.TWILIO_EXPECTED_ACCOUNT;
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT}${path}`,{method:body?'POST':'GET',headers:{Authorization:'Basic '+btoa(env.TWILIO_API_KEY+':'+env.TWILIO_API_SECRET),...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body:new URLSearchParams(body)}:{}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Twilio request failed');return response.json();
}
export async function voiceMaintenance(env){
  if(!voiceReady(env))return;
  const ACCOUNT=env.TWILIO_EXPECTED_ACCOUNT;
  const account=await api(env,'.json');
  if(account.sid!==ACCOUNT || account.status!=='active')throw new Error('Twilio account verification failed');
  const trial=account.type==='Trial';
  if(trial && env.ENVIRONMENT!=='preview')return;
  if(!trial && account.type!=='Full')return;
  const epoch=seconds();
  const count=await q(env,'SELECT COUNT(*) n FROM voice_jobs WHERE attempted>=?',epoch-86400).first();
  let remaining=Math.max(0,6-count.n);if(!remaining)return;
  const bookings=(await q(env,"SELECT b.*,s.start,c.slot_id consult_slot FROM consultations c JOIN bookings b ON b.id=c.booking_id JOIN slots s ON s.id=c.slot_id WHERE b.status='confirmed' AND b.deposit_paid=1 AND s.open=1 AND s.start>? AND s.start<=? ORDER BY s.start LIMIT 6",epoch,epoch+3600).all()).results;
  for(const booking of bookings){
    if(!reminderEligible(booking,booking.start,epoch))continue;
    const phone=JSON.parse(booking.intake).phone;
    if(trial && !(env.TWILIO_VERIFIED_RECIPIENTS||'').split(',').map(x=>x.trim()).includes(phone))continue;
    // Claim before contacting Twilio. Unknown outcomes require manual reconciliation;
    // never retry a call automatically after a timeout or Worker interruption.
    const id=booking.id+'-'+booking.consult_slot;
    let claim;try{claim=await q(env,"INSERT OR IGNORE INTO voice_jobs(id,booking_id,consult_slot,attempted,state) SELECT ?,?,?,?,'unknown' WHERE (SELECT COUNT(*) FROM voice_jobs WHERE attempted>=?)<6",id,booking.id,booking.consult_slot,epoch,epoch-86400).run();}catch{break;}
    if(!claim.meta.changes)continue;
    if(--remaining<0)break;
    const latest=await q(env,'SELECT * FROM bookings WHERE id=?',booking.id).first();
    const consult=await q(env,'SELECT s.start FROM consultations c JOIN slots s ON s.id=c.slot_id WHERE c.booking_id=? AND c.slot_id=? AND s.open=1',booking.id,booking.consult_slot).first();
    if(!latest || !consult || !reminderEligible(latest,consult.start) || JSON.parse(latest.intake).phone!==phone){await q(env,"UPDATE voice_jobs SET state='canceled' WHERE id=?",id).run();continue;}
    try{
      const call=await api(env,'/Calls.json',{To:phone,From:env.TWILIO_FROM,Twiml:reminderTwiml(consult.start),Timeout:'20',TimeLimit:'60',Record:'false'});
      if(call.account_sid!==ACCOUNT || !/^CA[0-9a-f]{32}$/i.test(call.sid||''))throw new Error('Unexpected Twilio response');
      await q(env,"UPDATE voice_jobs SET state='accepted',call_sid=? WHERE id=?",call.sid,id).run();
    }catch{ /* The persisted unknown claim is an owner review item; no duplicate call. */ }
  }
}
