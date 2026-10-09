import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {voiceMaintenance,voiceReady,reminderEligible} from '../src/voice.mjs';
const ACCOUNT='AC'+'0'.repeat(32);
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE bookings(id TEXT PRIMARY KEY,status TEXT,deposit_paid INTEGER,intake TEXT); CREATE TABLE slots(id TEXT PRIMARY KEY,start INTEGER,open INTEGER); CREATE TABLE consultations(booking_id TEXT,slot_id TEXT);');
 db.exec(readFileSync(new URL('../migrations/0005_voice_reminders.sql',import.meta.url),'utf8'));
 const start=Math.floor(Date.now()/1000)+1800;
 db.prepare('INSERT INTO bookings VALUES(?,?,?,?)').run('b','confirmed',1,JSON.stringify({phone:'+15555550123',voiceReminderConsent:true}));db.prepare('INSERT INTO slots VALUES(?,?,1)').run('c',start);db.exec("INSERT INTO consultations VALUES('b','c')");
 const DB={prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}};}};}};
 const env={DB,ENVIRONMENT:'preview',TWILIO_ENABLED:'true',TWILIO_LAUNCH_APPROVED:'true',TWILIO_TESTS_PASSED:'true',TWILIO_ACCOUNT_SID:ACCOUNT,TWILIO_EXPECTED_ACCOUNT:ACCOUNT,TWILIO_API_KEY:'SK'+'a'.repeat(32),TWILIO_API_SECRET:'test-only',TWILIO_FROM:'+15555550100',TWILIO_VERIFIED_RECIPIENTS:'+15555550123'};
 return {db,env};
}
test('voice connection is closed unless explicitly configured and approved',()=>{assert.equal(voiceReady({}),false);const {env}=setup();assert.equal(voiceReady(env),true);assert.equal(voiceReady({...env,TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32)}),false);assert.equal(voiceReady({...env,TWILIO_TESTS_PASSED:'false'}),false);});
test('reminders require payment, opt-in, valid US number, and future consultation',()=>{const t=1000;const b={status:'confirmed',deposit_paid:1,intake:JSON.stringify({phone:'+15555550123',voiceReminderConsent:true})};assert.equal(reminderEligible(b,1500,t),true);for(const patch of [{deposit_paid:0},{status:'canceled'},{intake:'{}'},{intake:JSON.stringify({phone:'+44555555555',voiceReminderConsent:true})}])assert.equal(reminderEligible({...b,...patch},1500,t),false);assert.equal(reminderEligible(b,999,t),false);});
test('accepted or uncertain call creation is never automatically duplicated',async()=>{
 for(const timeout of [false,true]){const {db,env}=setup();const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{if(!options.body)return Response.json({sid:ACCOUNT,status:'active',type:'Trial'});calls++;assert.equal(options.body.get('Record'),'false');assert.equal(options.body.get('TimeLimit'),'60');assert.match(options.body.get('Twiml'),/automated reminder/);if(timeout)throw new Error('timeout');return Response.json({sid:'CA'+'b'.repeat(32),account_sid:ACCOUNT});};
 try{await Promise.all([voiceMaintenance(env),voiceMaintenance(env)]);await voiceMaintenance(env);assert.equal(calls,1);assert.equal(db.prepare('SELECT state FROM voice_jobs').get().state,timeout?'unknown':'accepted');}finally{globalThis.fetch=original;}
 }
});
test('trial cannot call production clients or unverified recipients',async()=>{const {env}=setup();const original=globalThis.fetch;let calls=0;globalThis.fetch=async(url,options)=>{if(options.body)calls++;return Response.json({sid:ACCOUNT,status:'active',type:'Trial'});};try{await voiceMaintenance({...env,ENVIRONMENT:'production'});await voiceMaintenance({...env,TWILIO_VERIFIED_RECIPIENTS:''});assert.equal(calls,0);}finally{globalThis.fetch=original;}});
test('database claim enforces daily call ceiling atomically',()=>{const {db}=setup();const epoch=Math.floor(Date.now()/1000);const statement=db.prepare("INSERT OR IGNORE INTO voice_jobs(id,booking_id,consult_slot,attempted,state) SELECT ?,'b','c',?,'unknown' WHERE (SELECT COUNT(*) FROM voice_jobs WHERE attempted>=?)<6");for(let i=0;i<6;i++)assert.equal(statement.run('j'+i,epoch,epoch-86400).changes,1);assert.equal(statement.run('overflow',epoch,epoch-86400).changes,0);});
