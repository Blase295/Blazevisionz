import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {CATALOG,PACKAGES,chicagoEpoch,weekOf,paidSessionMatches,cryptToken,digest} from '../src/domain.mjs';
import {handle,processPaid} from '../src/api.mjs';
function database(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_booking.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0002_terms.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0003_protect_closed_slots.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0004_commercial_inquiries.sql',import.meta.url),'utf8'));db.exec(readFileSync(new URL('../migrations/0006_email_verification.sql',import.meta.url),'utf8'));return db;}
function adapter(db){return {prepare(sql){let args=[];const prepared={bind(...values){args=values;return prepared;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};return prepared;},async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}};}
function seed(db,limit=6){db.prepare('INSERT INTO weeks VALUES(?,?)').run('2027-01-04',limit);db.prepare('INSERT INTO blocks VALUES(?,?,?,?,?)').run('b1','b4us',chicagoEpoch('2027-01-04T09:00'),chicagoEpoch('2027-01-04T12:00'),'2027-01-04');db.prepare('INSERT INTO blocks VALUES(?,?,?,?,?)').run('b2','b4us',chicagoEpoch('2027-01-05T09:00'),chicagoEpoch('2027-01-05T12:00'),'2027-01-04');}
function slot(db,id,start='2027-01-06T12:00',kind='shoot',minutes=60){const epoch=chicagoEpoch(start);db.prepare('INSERT INTO slots(id,kind,start,end,week,local_date) VALUES(?,?,?,?,?,?)').run(id,kind,epoch,epoch+minutes*60,weekOf(epoch),start.slice(0,10));}
function book(db,id,slotId,packageId='essential'){db.prepare("INSERT INTO bookings(id,slot_id,package,name,email,status,created,expires,checkout_id,token_hash,token_cipher,email_verified) VALUES(?,?,?,?,?,'held',?,?,?,?,?,1)").run(id,slotId,packageId,'Test Client','client@example.com',1790000000,1790002000,'cs_'+id,'hash_'+id,'encrypted');}
function session(id,packageId='essential'){return {id:'cs_'+id,metadata:{booking_id:id,kind:'deposit'},mode:'payment',status:'complete',payment_status:'paid',currency:'usd',amount_total:PACKAGES[packageId].deposit,livemode:false};}
test('approved prices and unapproved Signature split fail closed',()=>{assert.equal(PACKAGES.essential.total,10000);assert.equal(PACKAGES.essential.deposit+PACKAGES.essential.balance,10000);assert.equal(PACKAGES.signature.total,12500);assert.equal(PACKAGES.signature.deposit,null);assert.equal(PACKAGES.signature.balance,null);assert.equal(paidSessionMatches(session('a','signature'),{id:'a',package:'signature',checkout_id:'cs_a'},'deposit',false),false);});
test('Chicago dates and DST are explicit',()=>{assert.equal(weekOf(chicagoEpoch('2027-01-10T18:00')),'2027-01-04');assert.throws(()=>chicagoEpoch('2026-11-01T01:30'));assert.throws(()=>chicagoEpoch('2027-03-14T02:30'));});
test('requires two distinct protected B4US blocks',()=>{const db=database();db.exec("INSERT INTO weeks VALUES('2027-01-04',6)");assert.throws(()=>slot(db,'s'));});
test('blocks overlapping B4US and travel buffers',()=>{const db=database();seed(db);assert.throws(()=>slot(db,'s','2027-01-04T11:00'));slot(db,'s');assert.throws(()=>slot(db,'s2','2027-01-06T13:15'));assert.throws(()=>db.prepare('INSERT INTO blocks VALUES(?,?,?,?,?)').run('security','security',chicagoEpoch('2027-01-06T11:45'),chicagoEpoch('2027-01-06T12:15'),'2027-01-04'));});
test('only one active reservation per appointment',()=>{const db=database();seed(db);slot(db,'s');book(db,'a','s');assert.throws(()=>book(db,'b','s'));});
test('weekly cap includes pending holds',()=>{const db=database();seed(db,1);slot(db,'s');slot(db,'s2','2027-01-07T12:00');book(db,'a','s');assert.throws(()=>book(db,'b','s2'));});
test('unpaid booking cannot become confirmed',()=>{const db=database();seed(db);slot(db,'s');book(db,'a','s');assert.throws(()=>db.exec("UPDATE bookings SET status='confirmed' WHERE id='a'"));});
test('consultation requires verified payment and intake, never more than 10 minutes',()=>{const db=database();seed(db);slot(db,'s','2027-01-08T12:00');slot(db,'c','2027-01-06T12:00','consult',10);book(db,'a','s');assert.throws(()=>db.exec("INSERT INTO consultations VALUES('a','c')"));db.exec("UPDATE bookings SET deposit_paid=1,status='confirmed' WHERE id='a'");assert.throws(()=>db.exec("INSERT INTO consultations VALUES('a','c')"));db.exec("UPDATE bookings SET intake='{}' WHERE id='a'; INSERT INTO consultations VALUES('a','c')");assert.equal(db.prepare('SELECT COUNT(*) n FROM consultations').get().n,1);});
test('payment verification rejects wrong amount, currency, mode, session, and unpaid status',()=>{const booking={id:'a',package:'essential',checkout_id:'cs_a'};const good=session('a');assert.ok(paidSessionMatches(good,booking,'deposit',false));for(const patch of [{amount_total:4500},{currency:'eur'},{livemode:true},{payment_status:'unpaid'},{status:'open'},{id:'cs_other'},{mode:'subscription'}])assert.equal(paidSessionMatches({...good,...patch},booking,'deposit',false),false);});
test('Essential confirms atomically; duplicate events do not duplicate emails',async()=>{for(const pkg of ['essential']){const db=database();seed(db);slot(db,'s');book(db,'a','s',pkg);const env={DB:adapter(db),STRIPE_LIVE:'false'};await processPaid(env,session('a',pkg),'evt_1');await processPaid(env,session('a',pkg),'evt_1');await processPaid(env,session('a',pkg),'evt_2');assert.equal(db.prepare('SELECT status FROM bookings').get().status,'confirmed');assert.equal(db.prepare('SELECT COUNT(*) n FROM outbox').get().n,3);}});
test('failed/unpaid processing never confirms appointment',async()=>{const db=database();seed(db);slot(db,'s');book(db,'a','s');await assert.rejects(processPaid({DB:adapter(db),STRIPE_LIVE:'false'},{...session('a'),payment_status:'unpaid'},'evt_fail'));assert.equal(db.prepare('SELECT status FROM bookings').get().status,'held');});
test('expired reservation permits a new booking; canceled payment needs review',async()=>{const db=database();seed(db);slot(db,'s');book(db,'a','s');db.exec("UPDATE bookings SET status='expired' WHERE id='a'");book(db,'b','s');await processPaid({DB:adapter(db),STRIPE_LIVE:'false'},session('a'),'evt_late');assert.equal(db.prepare("SELECT status FROM bookings WHERE id='a'").get().status,'expired');assert.equal(db.prepare("SELECT kind FROM outbox").get().kind,'payment_review');});
test('closed appointments and short Signature slots reject reservations',()=>{const db=database();seed(db);slot(db,'s','2027-01-06T12:00','shoot',30);assert.throws(()=>book(db,'a','s','signature'));db.exec("UPDATE slots SET open=0 WHERE id='s'");assert.throws(()=>book(db,'b','s'));});
test('reschedule respects weekly cap and active appointment uniqueness',()=>{const db=database();seed(db,1);slot(db,'s');slot(db,'s2','2027-01-07T12:00');book(db,'a','s');db.exec("UPDATE bookings SET deposit_paid=1,status='confirmed' WHERE id='a'; UPDATE bookings SET slot_id='s2' WHERE id='a'");assert.equal(db.prepare('SELECT slot_id FROM bookings').get().slot_id,'s2');});
test('client tokens are encrypted at rest',async()=>{const encrypted=await cryptToken('private-token','test-only-encryption-key');assert.notEqual(encrypted,'private-token');assert.equal(await cryptToken(encrypted,'test-only-encryption-key',true),'private-token');await assert.rejects(cryptToken(encrypted,'wrong-key',true));assert.equal((await digest('token')).length,64);});
test('launch gate remains closed and private APIs require authorization',async()=>{const db=database();const env={DB:adapter(db),PAYMENTS_ENABLED:'false'};const availability=await handle(new Request('https://example.com/api/availability'),env);assert.deepEqual(await availability.json(),{paymentsEnabled:false,slots:[]});assert.equal((await handle(new Request('https://example.com/api/client'),env)).status,401);assert.equal((await handle(new Request('https://example.com/api/admin'),env)).status,503);assert.equal((await handle(new Request('https://example.com/api/bookings',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:'{}'}),env)).status,503);});
test('commercial and event inquiries never create checkout or booking records',async()=>{const db=database();const env={DB:adapter(db),PAYMENTS_ENABLED:'false'};const response=await handle(new Request('https://example.com/api/inquiries',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({type:'event',name:'Event Client',email:'client@example.com',phone:'555-0100',date:'2027-01-09',location:'Houston venue',objectives:'Cover the event with editorial direction.',scope:'Need arrival moments, program coverage, guest candids, licensing, and a scoped quote before retainer.'})}),env);assert.equal(response.status,202);assert.deepEqual(await response.json(),{saved:true,emailQueued:false});assert.equal(db.prepare('SELECT COUNT(*) n FROM inquiries').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);});
test('forged Stripe webhook signatures are rejected',async()=>{const db=database();const response=await handle(new Request('https://example.com/api/webhook',{method:'POST',headers:{'Stripe-Signature':'t=1,v1=forged'},body:'{}'}),{DB:adapter(db),STRIPE_SECRET_KEY:'sk_test_dummy_no_network',STRIPE_WEBHOOK_SECRET:'whsec_test_only',EXPECTED_STRIPE_ACCOUNT:'acct_test'});assert.equal(response.status,400);});

import {createHmac} from 'node:crypto';
import {maintenance} from '../src/operations.mjs';
test('genuine signed webhook verifies server state and rejects duplicate confirmation delivery',async()=>{
 const db=database();seed(db);slot(db,'s');book(db,'a','s');
 const original=globalThis.fetch;
 globalThis.fetch=async input=>{const url=new URL(typeof input==='string'?input:input.url||String(input));if(url.pathname==='/v1/account')return Response.json({id:'acct_blaze_test'});if(url.pathname==='/v1/checkout/sessions/cs_a')return Response.json(session('a'));throw new Error('Unexpected external call');};
 try{
 const payload=JSON.stringify({id:'evt_signed',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_a',metadata:{booking_id:'a',kind:'deposit'}}}});const t=Math.floor(Date.now()/1000);const signature=createHmac('sha256','whsec_local_fixture').update(t+'.'+payload).digest('hex');const env={DB:adapter(db),STRIPE_LIVE:'false',EXPECTED_STRIPE_ACCOUNT:'acct_blaze_test',STRIPE_SECRET_KEY:'sk_test_local_fixture',STRIPE_WEBHOOK_SECRET:'whsec_local_fixture'};
 for(let i=0;i<2;i++){const response=await handle(new Request('https://example.com/api/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${t},v1=${signature}`},body:payload}),env);assert.equal(response.status,200);}
 assert.equal(db.prepare('SELECT status FROM bookings').get().status,'confirmed');assert.equal(db.prepare('SELECT COUNT(*) n FROM outbox').get().n,3);
 }finally{globalThis.fetch=original;}
});
test('email outbox sends the verified client link once and retains failed delivery',async()=>{
 const db=database();seed(db);slot(db,'s');book(db,'a','s');const encrypted=await cryptToken('a'.repeat(64),'local-encryption-fixture');db.prepare("UPDATE bookings SET deposit_paid=1,status='confirmed',token_cipher=? WHERE id='a'").run(encrypted);db.exec("INSERT INTO outbox(id,booking_id,kind,due) VALUES('message-1','a','confirmation',0)");
 const original=globalThis.fetch;const sent=[];globalThis.fetch=async (url,options)=>{assert.equal(url,'https://api.resend.com/emails');sent.push(JSON.parse(options.body));return Response.json({id:'test-message'});};
 const env={DB:adapter(db),RESEND_API_KEY:'local-email-fixture',TOKEN_ENCRYPTION_KEY:'local-encryption-fixture',SITE_URL:'https://example.com',EMAIL_FROM:'studio@example.com',CONTACT_EMAIL:'studio@example.com',ADMIN_EMAIL:'owner@example.com'};
 try{await maintenance(env);await maintenance(env);assert.equal(sent.length,1);assert.deepEqual(sent[0].to,['client@example.com']);assert.ok(sent[0].text.includes('/client.html#'+'a'.repeat(64)));assert.ok(sent[0].text.includes('$30'));db.exec("INSERT INTO outbox(id,booking_id,kind,due) VALUES('message-2','a','shoot_reminder',0)");globalThis.fetch=async()=>new Response('rejected',{status:503});await maintenance(env);const pending=db.prepare("SELECT sent,attempts FROM outbox WHERE id='message-2'").get();assert.equal(pending.sent,null);assert.equal(pending.attempts,1);}finally{globalThis.fetch=original;}
});
test('calendar closure cannot race an occupied reservation',()=>{const db=database();seed(db);slot(db,'s');book(db,'a','s');assert.throws(()=>db.exec("UPDATE slots SET open=0 WHERE id='s'"));assert.equal(db.prepare('SELECT open FROM slots').get().open,1);});

function testEnv(db){return {DB:adapter(db),ENVIRONMENT:'preview',STRIPE_LIVE:'false',PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_local_fixture',STRIPE_WEBHOOK_SECRET:'whsec_local_fixture',EXPECTED_STRIPE_ACCOUNT:'acct_blaze_test',STRIPE_PAYMENT_CONFIGURATION:'pmc_local_fixture',BOOKING_LIMITER:{async limit(){return {success:true};}},TOKEN_ENCRYPTION_KEY:'local-encryption-fixture',RESEND_API_KEY:'local-email-fixture',EMAIL_FROM:'studio@example.com',CONTACT_EMAIL:'studio@example.com',ADMIN_EMAIL:'owner@example.com',SITE_URL:'https://example.com',TERMS_VERSION:'local-test-only',TERMS_APPROVED:'true',TAX_REVIEW_COMPLETE:'true',LAUNCH_TESTS_PASSED:'true'};}
function post(path,data={},token){return new Request('https://example.com'+path,{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});}
function payload(pkg='essential',slotId='s'){return {package:pkg,slot:slotId,name:'Local Fixture',email:'client@example.com',acceptedTerms:true,termsVersion:'local-test-only'};}
async function stripeFixture(fn){const original=globalThis.fetch;const calls=[];globalThis.fetch=async (input,options)=>{const url=new URL(typeof input==='string'?input:input.url||String(input));calls.push({url:url.pathname,options});if(url.pathname==='/v1/account')return Response.json({id:'acct_blaze_test'});if(url.pathname==='/v1/checkout/sessions' && options.method==='POST')return Response.json({id:'cs_created',url:'https://checkout.stripe.com/c/pay/local_fixture',livemode:false});if(url.pathname==='/v1/checkout/sessions/cs_created')return Response.json({id:'cs_created',url:'https://checkout.stripe.com/c/pay/local_fixture',livemode:false});if(url.pathname==='/v1/checkout/sessions/cs_a')return Response.json(session('a'));if(url.hostname==='api.resend.com')return Response.json({id:'email_fixture'});throw new Error('Unexpected external call');};try{await fn(calls);}finally{globalThis.fetch=original;}}

test('email ownership is required before Stripe checkout; link is one-time and retry preserves session',async()=>{
 const db=database();seed(db);slot(db,'s');const env=testEnv(db);
 await stripeFixture(async calls=>{
  const response=await handle(post('/api/bookings',payload()),env);assert.equal(response.status,202);assert.equal((await response.json()).verificationRequired,true);
  let booking=db.prepare('SELECT * FROM bookings').get();assert.equal(booking.email_verified,null);assert.equal(booking.checkout_id,null);assert.equal(calls.filter(c=>c.url==='/v1/checkout/sessions').length,0);
  const portalToken=await cryptToken(booking.token_cipher,env.TOKEN_ENCRYPTION_KEY,true);
  assert.equal((await handle(post('/api/checkout',{},portalToken),env)).status,403);
  await maintenance(env);const email=calls.find(c=>c.url==='/emails');assert.ok(email);const text=JSON.parse(email.options.body).text;assert.ok(!text.includes(portalToken));
  const rawToken=text.match(/verify.html#([a-f0-9-]+)/)[1];assert.equal(rawToken.length,72);assert.equal(db.prepare('SELECT token_hash FROM email_verifications').get().token_hash,await digest(rawToken));
  const verified=await handle(post('/api/email/verify',{token:rawToken}),env);assert.equal(verified.status,200);assert.equal((await verified.json()).checkoutToken,portalToken);
  assert.equal((await handle(post('/api/email/verify',{token:rawToken}),env)).status,403);
  const realNow=Date.now;Date.now=()=>realNow()+120000;
  try{for(let i=0;i<2;i++)assert.equal((await handle(post('/api/checkout',{},portalToken),env)).status,200);}finally{Date.now=realNow;}
  assert.ok(db.prepare('SELECT expires FROM checkout_attempts').get().expires>Math.floor(realNow()/1000)+1900);
  const create=calls.filter(c=>c.url==='/v1/checkout/sessions');assert.equal(create.length,1);const params=new URLSearchParams(create[0].options.body);assert.equal(params.get('line_items[0][price_data][unit_amount]'),'3000');assert.equal(params.get('metadata[booking_id]'),booking.id);
  booking=db.prepare('SELECT * FROM bookings').get();assert.ok(booking.email_verified);assert.equal(booking.status,'held');assert.equal(booking.deposit_paid,0);
 });
});

test('expired, forged, and simultaneously reused verification links fail closed',async()=>{
 const db=database();seed(db);slot(db,'s');const env=testEnv(db);
 await stripeFixture(async()=>{await handle(post('/api/bookings',payload()),env);});
 const v=db.prepare('SELECT * FROM email_verifications').get();const token=await cryptToken(v.token_cipher,env.TOKEN_ENCRYPTION_KEY,true);
 assert.equal((await handle(post('/api/email/verify',{token:'0'.repeat(72)}),env)).status,403);
 db.exec('UPDATE email_verifications SET expires=1');assert.equal((await handle(post('/api/email/verify',{token}),env)).status,403);assert.equal(db.prepare('SELECT email_verified FROM bookings').get().email_verified,null);
 db.exec('UPDATE email_verifications SET expires=9999999999');const responses=await Promise.all([handle(post('/api/email/verify',{token}),env),handle(post('/api/email/verify',{token}),env)]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,403]);
 assert.throws(()=>db.exec("UPDATE bookings SET email='another@example.com'"));
});

test('two concurrent reservation requests create one hold, verification token, and message',async()=>{
 const db=database();seed(db);slot(db,'s');const env=testEnv(db);
 await stripeFixture(async()=>{const results=await Promise.all([handle(post('/api/bookings',payload()),env),handle(post('/api/bookings',payload()),env)]);assert.deepEqual(results.map(r=>r.status).sort(),[202,409]);});
 for(const table of ['bookings','email_verifications','outbox'])assert.equal(db.prepare('SELECT COUNT(*) n FROM '+table).get().n,1);
});

test('Signature and consultation-first catalogs cannot create a payable personal booking',async()=>{
 const db=database();seed(db);slot(db,'s');const env=testEnv(db);
 await stripeFixture(async calls=>{for(const pkg of ['signature','monthly','personalRAW','campaign'])assert.ok((await handle(post('/api/bookings',payload(pkg)),env)).status>=400);assert.equal(calls.filter(c=>c.url==='/v1/checkout/sessions').length,0);});assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);
});

test('sandbox booking path requires owner Access and never opens public availability',async()=>{
 const db=database();const env={...testEnv(db),PAYMENTS_ENABLED:'false',SANDBOX_CHECKOUT_ENABLED:'true',ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com',ACCESS_AUD:'owner-fixture'};
 assert.equal((await handle(post('/api/sandbox/bookings',payload()),env)).status,401);
 assert.equal((await handle(post('/api/bookings',payload()),env)).status,503);
 assert.equal((await (await handle(new Request('https://example.com/api/availability'),env)).json()).paymentsEnabled,false);
 const {readiness}=await import('../src/api.mjs');await stripeFixture(async()=>{assert.equal(await readiness(env,true),true);assert.equal(await readiness({...env,ENVIRONMENT:'production'},true),false);assert.equal(await readiness({...env,STRIPE_SECRET_KEY:'sk_live_forbidden'},true),false);});
});

test('transaction failure rolls back payment event, booking confirmation, and queued emails',async()=>{
 const db=database();seed(db);slot(db,'s');book(db,'a','s');db.exec("CREATE TRIGGER simulated_disk_failure BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 await assert.rejects(processPaid({DB:adapter(db),STRIPE_LIVE:'false'},session('a'),'evt_retry'));
 assert.equal(db.prepare('SELECT status FROM bookings').get().status,'held');assert.equal(db.prepare('SELECT COUNT(*) n FROM payment_events').get().n,0);
 db.exec('DROP TRIGGER simulated_disk_failure');await processPaid({DB:adapter(db),STRIPE_LIVE:'false'},session('a'),'evt_retry');assert.equal(db.prepare('SELECT status FROM bookings').get().status,'confirmed');
});

test('payment without verified email cannot grant a booking or portal access',async()=>{
 const db=database();seed(db);slot(db,'s');book(db,'a','s');db.exec('UPDATE bookings SET email_verified=NULL');
 await assert.rejects(processPaid({DB:adapter(db),STRIPE_LIVE:'false'},session('a'),'evt_unverified'));
 assert.throws(()=>db.exec("UPDATE bookings SET deposit_paid=1,status='confirmed'"));
});

test('customer authorization binds reads and writes to one record, ignoring supplied booking IDs',async()=>{
 const db=database();seed(db);slot(db,'s');slot(db,'s2','2027-01-07T12:00');book(db,'a','s');book(db,'b','s2');const tokenA='a'.repeat(64),tokenB='b'.repeat(64);
 db.prepare("UPDATE bookings SET deposit_paid=1,status='confirmed',token_hash=? WHERE id='a'").run(await digest(tokenA));db.prepare("UPDATE bookings SET deposit_paid=1,status='confirmed',token_hash=?,name='Other Customer',proof_url='https://example.com/other-proof' WHERE id='b'").run(await digest(tokenB));
 const env={DB:adapter(db),PAYMENTS_ENABLED:'false'};const result=await (await handle(new Request('https://example.com/api/client?id=b',{headers:{Authorization:'Bearer '+tokenA}}),env)).json();assert.equal(result.name,'Test Client');assert.equal(result.proofUrl,null);
 const fields=['name','email','phone','purpose','aesthetic','inspiration','outfits','location','posing','requests','usage'];const data=Object.fromEntries(fields.map(f=>[f,'Fixture']));data.id='b';assert.equal((await handle(post('/api/client/intake',data,tokenA),env)).status,200);assert.equal(db.prepare("SELECT intake FROM bookings WHERE id='b'").get().intake,null);
 assert.equal((await handle(new Request('https://example.com/api/client',{headers:{Authorization:'Bearer '+'c'.repeat(64)}}),env)).status,403);
});

test('signed webhook rejects tampering, stale timestamps, and wrong account/environment',async()=>{
 const db=database();const env={DB:adapter(db),STRIPE_LIVE:'false',EXPECTED_STRIPE_ACCOUNT:'acct_blaze_test',STRIPE_SECRET_KEY:'sk_test_local_fixture',STRIPE_WEBHOOK_SECRET:'whsec_local_fixture'};
 const t=Math.floor(Date.now()/1000);const send=async(data,timestamp=t,tamper=false)=>{const raw=JSON.stringify(data);const sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex');return handle(new Request('https://example.com/api/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${timestamp},v1=${sig}`},body:raw+(tamper?' ':'' )}),env);};
 const event={id:'evt_fixture',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_a',metadata:{booking_id:'a',kind:'deposit'}}}};assert.equal((await send(event,t,true)).status,400);assert.equal((await send(event,t-600)).status,400);assert.equal((await send({...event,livemode:true})).status,400);assert.equal((await send({...event,account:'acct_wrong'})).status,400);
});

test('concurrent email dispatch leases one send and records provider acceptance',async()=>{
 const db=database();seed(db);slot(db,'s');book(db,'a','s');db.prepare("UPDATE bookings SET deposit_paid=1,status='confirmed',token_cipher=?").run(await cryptToken('a'.repeat(64),'local-encryption-fixture'));db.exec("INSERT INTO outbox(id,booking_id,kind,due) VALUES('mail-fixture','a','confirmation',0)");const env={...testEnv(db),STRIPE_SECRET_KEY:undefined};
 await stripeFixture(async calls=>{await Promise.all([maintenance(env),maintenance(env)]);assert.equal(calls.filter(c=>c.url==='/emails').length,1);});const row=db.prepare('SELECT * FROM outbox').get();assert.equal(row.provider_id,'email_fixture');assert.ok(row.sent);assert.equal(row.attempts,1);
});

test('email retry uses stable provider idempotency and stops before retention expires',async()=>{
 const db=database();seed(db);slot(db,'s');book(db,'a','s');db.prepare("UPDATE bookings SET deposit_paid=1,status='confirmed',token_cipher=?").run(await cryptToken('a'.repeat(64),'local-encryption-fixture'));db.exec("INSERT INTO outbox(id,booking_id,kind,due) VALUES('mail-retry','a','confirmation',0)");const env={...testEnv(db),STRIPE_SECRET_KEY:undefined};const original=globalThis.fetch;const keys=[];
 globalThis.fetch=async(url,options)=>{keys.push(options.headers['Idempotency-Key']);return new Response('retry',{status:503});};try{await maintenance(env);assert.equal(db.prepare('SELECT attempts FROM outbox').get().attempts,1);await maintenance(env);assert.equal(keys.length,1);db.exec('UPDATE outbox SET due=0');await maintenance(env);assert.deepEqual(keys,['mail-retry','mail-retry']);db.exec('UPDATE outbox SET due=0,first_attempt=1');await maintenance(env);assert.equal(keys.length,2);assert.equal(db.prepare('SELECT attempts FROM outbox').get().attempts,10);}finally{globalThis.fetch=original;}
});

test('preview Stripe transport refuses live keys and mode flags before network access',async()=>{
 const {stripe}=await import('../src/api.mjs');assert.throws(()=>stripe({ENVIRONMENT:'preview',STRIPE_LIVE:'true',STRIPE_SECRET_KEY:'sk_live_forbidden'}));assert.throws(()=>stripe({ENVIRONMENT:'preview',STRIPE_LIVE:'false',STRIPE_SECRET_KEY:'sk_live_forbidden'}));
});

test('late paid session queues owner review even after cancellation',async()=>{
 const db=database();seed(db);slot(db,'s');book(db,'a','s');db.prepare("UPDATE bookings SET status='canceled',token_cipher=?").run(await cryptToken('a'.repeat(64),'local-encryption-fixture'));await processPaid({DB:adapter(db),STRIPE_LIVE:'false'},session('a'),'evt_late');
 const env={...testEnv(db),STRIPE_SECRET_KEY:undefined};await stripeFixture(async calls=>{await maintenance(env);const sent=JSON.parse(calls.find(c=>c.url==='/emails').options.body);assert.deepEqual(sent.to,['owner@example.com']);assert.ok(sent.text.includes('requires owner review'));});assert.equal(db.prepare('SELECT status FROM bookings').get().status,'canceled');
});

test('verified balance payment is atomic and duplicate events queue one receipt',async()=>{
 const db=database();seed(db);slot(db,'s');book(db,'a','s');const env={DB:adapter(db),STRIPE_LIVE:'false'};await processPaid(env,session('a'),'evt_deposit');db.exec("UPDATE bookings SET balance_checkout_id='cs_balance' WHERE id='a'");
 const paid={...session('a'),id:'cs_balance',amount_total:7000,metadata:{booking_id:'a',kind:'balance'}};await processPaid(env,paid,'evt_balance');await processPaid(env,paid,'evt_balance');await processPaid(env,paid,'evt_balance_other');assert.equal(db.prepare('SELECT balance_paid FROM bookings').get().balance_paid,1);assert.equal(db.prepare("SELECT COUNT(*) n FROM outbox WHERE kind='balance_receipt'").get().n,1);
});

test('signed non-booking webhook fixtures are acknowledged without granting fulfillment',async()=>{
 const db=database();const env=testEnv(db);await stripeFixture(async calls=>{
  const raw=JSON.stringify({id:'evt_non_booking',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_fixture_without_booking',metadata:{}}}});const t=Math.floor(Date.now()/1000);const sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(t+'.'+raw).digest('hex');
  const response=await handle(new Request('https://example.com/api/webhook',{method:'POST',headers:{'Stripe-Signature':`t=${t},v1=${sig}`},body:raw}),env);assert.equal(response.status,200);assert.deepEqual(await response.json(),{received:true,ignored:true});assert.equal(calls.filter(c=>c.url.includes('checkout')).length,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM outbox').get().n,0);
 });
});


test('all approved catalog totals and deliverables stay aligned',()=>{
 assert.deepEqual([CATALOG.essential.total,CATALOG.essential.minutes,CATALOG.essential.images],[10000,30,3]);
 assert.deepEqual([CATALOG.signature.total,CATALOG.signature.minutes,CATALOG.signature.images],[12500,60,5]);
 assert.deepEqual([CATALOG.monthly.total,CATALOG.monthly.interval,CATALOG.monthly.minutes,CATALOG.monthly.images,CATALOG.monthly.usableRAWs],[12500,'month',60,7,true]);
 assert.equal(CATALOG.personalRAW.total,5000);
 assert.deepEqual([CATALOG.campaign.total,CATALOG.campaign.minutes,CATALOG.campaign.locations,CATALOG.campaign.consultationRequired],[45000,120,2,true]);
});
