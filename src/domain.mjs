export const PACKAGES = Object.freeze({
  essential: Object.freeze({name:'Essential Session', total:10000, deposit:3000, balance:7000, minutes:30, images:3}),
  signature: Object.freeze({name:'Signature Session', total:15000, deposit:4500, balance:10500, minutes:60, images:5})
});
export function localParts(epoch) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(epoch*1000)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
export function localDate(epoch) {const p=localParts(epoch); return `${p.year}-${p.month}-${p.day}`;}
export function weekOf(epoch) {const date=localDate(epoch);const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
export function chicagoEpoch(value) {
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) throw new Error('Use a Chicago date and time');
  const approximate=Date.parse(value+'Z')/1000;
  const matches=[];
  for(const offset of [5,6]) {const epoch=approximate+offset*3600;const p=localParts(epoch);if(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`===value) matches.push(epoch);}
  if(matches.length!==1) throw new Error('This time is invalid or ambiguous because of daylight saving time');
  return matches[0];
}
export function paidSessionMatches(session, booking, kind, live) {
  const p=PACKAGES[booking.package];
  return Boolean(p && session.mode==='payment' && session.status==='complete' && session.payment_status==='paid' && session.currency==='usd' && session.amount_total===(kind==='deposit'?p.deposit:p.balance) && session.livemode===live && session.metadata?.booking_id===booking.id && session.metadata?.kind===kind && session.id===(kind==='deposit'?booking.checkout_id:booking.balance_checkout_id));
}
export async function digest(value) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export async function cryptToken(token, secret, decrypt=false) {
  const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);
  if(decrypt) {const data=Uint8Array.from(atob(token),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12)},key,data.slice(12)));}
  const iv=crypto.getRandomValues(new Uint8Array(12));const result=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(token)));return btoa(String.fromCharCode(...iv,...result));
}
