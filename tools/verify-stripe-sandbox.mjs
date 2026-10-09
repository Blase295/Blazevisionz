// Uses real Stripe sandbox APIs with an isolated local database. Never enables public booking.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import Stripe from 'stripe';
import {handle} from '../src/api.mjs';
import {PACKAGES, chicagoEpoch, weekOf} from '../src/domain.mjs';

async function verify() {
const expected='acct_1UOWNwCXm8prgzws';
const filename=process.env.STRIPE_TEST_CREDENTIAL_FILE||'.dev.vars.stripe-preview.json';
const credentials=JSON.parse(await readFile(filename,'utf8'));
assert.match(credentials.STRIPE_SECRET_KEY||'',/^(rk|sk)_test_/,'Only test credentials are permitted');
const stripe=new Stripe(credentials.STRIPE_SECRET_KEY,{maxNetworkRetries:1});
const account=await stripe.accounts.retrieve();
assert.equal(account.id,expected,'Stop: credential belongs to a different business');
const configuration=await stripe.paymentMethodConfigurations.retrieve('pmc_1UOWl1CXm8prgzwsFcsPRVxg');
assert.equal(configuration.active,true);
assert.equal(configuration.livemode,false);
assert.equal(configuration.card?.available,true);
assert.equal(configuration.card?.display_preference?.value,'on');
for(const [method,value] of Object.entries(configuration)) {
  if(method!=='card' && value?.display_preference)assert.notEqual(value.display_preference.value,'on',`Unexpected enabled method: ${method}`);
}

const db=new DatabaseSync(':memory:');
for(const migration of ['0001_booking.sql','0002_terms.sql','0003_protect_closed_slots.sql','0004_commercial_inquiries.sql','0005_voice_reminders.sql']) {
  await readFile(new URL('../migrations/'+migration,import.meta.url),'utf8').then(sql=>db.exec(sql));
}
const adapter={prepare(sql){let args=[];const statement={bind(...values){args=values;return statement;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};return statement;},async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};
const date=new Date(Date.now()+14*86400000);
while(date.getUTCDay()!==3)date.setUTCDate(date.getUTCDate()+1);
const day=date.toISOString().slice(0,10);
const start=chicagoEpoch(day+'T12:00');
const week=weekOf(start);
db.prepare('INSERT INTO weeks VALUES(?,6)').run(week);
const monday=chicagoEpoch(week+'T09:00');
for(let i=0;i<2;i++)db.prepare('INSERT INTO blocks VALUES(?,?,?,?,?)').run('protected-'+i,'b4us',monday+i*86400,monday+i*86400+10800,week);
for(let i=0;i<2;i++)db.prepare('INSERT INTO slots(id,kind,start,end,week,local_date) VALUES(?,?,?,?,?,?)').run('sandbox-'+i,'shoot',start+i*10800,start+i*10800+3600,week,day);
const env={ENVIRONMENT:'preview',STRIPE_LIVE:'false',PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:credentials.STRIPE_SECRET_KEY,EXPECTED_STRIPE_ACCOUNT:expected,STRIPE_PAYMENT_CONFIGURATION:configuration.id,DB:adapter,BOOKING_LIMITER:{async limit(){return {success:true};}},TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('hex'),STRIPE_WEBHOOK_SECRET:'local-test-only-not-a-deployed-webhook',RESEND_API_KEY:'local-readiness-fixture-no-delivery',EMAIL_FROM:'test@example.com',CONTACT_EMAIL:'test@example.com',TERMS_VERSION:'sandbox-test-only',TERMS_APPROVED:'true',TAX_REVIEW_COMPLETE:'true',LAUNCH_TESTS_PASSED:'true',SITE_URL:'https://blazevisionz-preview.blazevisionz.workers.dev'};
const request=(path,body)=>new Request(env.SITE_URL+path,{method:body?'POST':'GET',headers:{Origin:env.SITE_URL,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const sessions=[];
const checks=[];
try {
  const availability=await (await handle(request('/api/availability'),env)).json();
  assert.equal(availability.paymentsEnabled,true);
  assert.equal(availability.slots.length,2);
  for(const [i,pkg] of ['essential','signature'].entries()) {
    const body={package:pkg,slot:'sandbox-'+i,name:'Sandbox Verification',email:'sandbox@example.com',acceptedTerms:true,termsVersion:env.TERMS_VERSION};
    const response=await handle(request('/api/bookings',body),env);
    assert.equal(response.status,201,'Real sandbox Checkout creation failed');
    const booking=db.prepare('SELECT * FROM bookings WHERE slot_id=?').get(body.slot);
    sessions.push(booking.checkout_id);
    const session=await stripe.checkout.sessions.retrieve(booking.checkout_id);
    assert.equal(session.livemode,false);
    assert.equal(session.amount_total,PACKAGES[pkg].deposit);
    assert.equal(session.metadata.booking_id,booking.id);
    assert.equal(session.metadata.kind,'deposit');
    assert.equal(session.client_reference_id,booking.id);
    assert.equal(session.payment_status,'unpaid');
    assert.equal(booking.status,'held');
    assert.equal(booking.deposit_paid,0);
    assert.deepEqual(session.payment_method_types,['card']);
    assert.equal((await handle(request('/api/bookings',body),env)).status,409);
    assert.equal((await handle(request('/api/client'),env)).status,401);
    await stripe.checkout.sessions.expire(session.id);
    assert.equal((await stripe.checkout.sessions.retrieve(session.id)).status,'expired');
    checks.push({package:pkg,depositCents:session.amount_total,sessionId:session.id,duplicateBookingRejected:true,unpaidRemainsHeld:true,expiredAtStripe:true});
  }
  await mkdir('test-results',{recursive:true});
  await writeFile('test-results/stripe-sandbox-api.json',JSON.stringify({at:new Date().toISOString(),account:account.id,checks,limits:['Isolated local SQLite, not the deployed D1 database','No card submitted, signed Stripe delivery, email delivery, or mobile Checkout tested','Production remains closed']},null,2));
  console.log(JSON.stringify({accountVerified:true,cardOnlyVerified:true,packages:checks.map(({sessionId,...check})=>check),productionEnabled:false}));
} finally {
  for(const id of sessions)try{const session=await stripe.checkout.sessions.retrieve(id);if(session.status==='open')await stripe.checkout.sessions.expire(id);}catch{console.error('Sandbox session cleanup needs owner review');}
  db.close();
}
}
try {await verify();} catch(error) {
  // Provider error objects may contain request details; never print credentials or raw errors.
  console.error(JSON.stringify({sandboxVerificationPassed:false,errorType:error.name||'Error',code:error.code||null,status:error.statusCode||null}));
  process.exitCode=1;
}
