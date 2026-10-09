const status=document.getElementById('admin-status');
async function api(path='',data) {
 const response=await fetch('/api/admin'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});
 const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
}
function node(tag,text){const el=document.createElement(tag);el.textContent=text;return el;}
async function save(path,data){try{await api(path,data);status.textContent='Saved.';await load();}catch(e){status.textContent=e.message;}}
async function load(){
 try{
 const data=await api();status.textContent='Owner access verified. Schedule uses America/Chicago.';
 const schedule=document.getElementById('schedule');schedule.replaceChildren();
 for(const week of data.weeks)schedule.append(node('p',`Week ${week.week}: maximum ${week.booking_limit} sessions.`));
 for(const block of data.blocks)schedule.append(node('p',`${block.kind.toUpperCase()}: ${new Date(block.start*1000).toLocaleString('en-US',{timeZone:'America/Chicago'})} — ${new Date(block.end*1000).toLocaleString('en-US',{timeZone:'America/Chicago'})}`));
 for(const slot of data.slots){const row=node('p',`${slot.kind} — ${new Date(slot.start*1000).toLocaleString('en-US',{timeZone:'America/Chicago'})} — ${slot.open?'Open':'Closed'} `);if(slot.open){const button=node('button','Close appointment');button.className='action';button.onclick=()=>save('/close',{id:slot.id});row.append(button);}schedule.append(row);}
 const clients=document.getElementById('clients');clients.replaceChildren();
 for(const booking of data.bookings){const section=node('section','');section.append(node('h2',`${booking.name} / ${booking.package}`),node('p',`${booking.email} — ${booking.status} — deposit ${booking.deposit_paid?'paid':'unpaid'} / balance ${booking.balance_paid?'paid':'unpaid'}`),node('p',`Portfolio consent: ${booking.consent?'Yes':'No'}`));if(booking.intake)section.append(node('pre',JSON.stringify(JSON.parse(booking.intake),null,2)));if(booking.selections)section.append(node('pre','Selected images:\n'+booking.selections));
 if(['confirmed','completed'].includes(booking.status)){
 for(const action of ['proof','delivery']){const form=node('form','');const label=node('label',action==='proof'?'Private proof gallery HTTPS URL':'Private final JPEG delivery HTTPS URL');const input=node('input','');input.type='url';input.required=true;label.append(input);const button=node('button','SEND '+action.toUpperCase());form.append(label,button);form.onsubmit=e=>{e.preventDefault();save('/client',{id:booking.id,action,url:input.value});};section.append(form);}
 if(booking.status==='confirmed'){const form=node('form','');const label=node('label','Reschedule to open photography appointment');const select=node('select','');select.append(new Option('Choose appointment',''));for(const slot of data.slots.filter(s=>s.open&&s.kind==='shoot'))select.append(new Option(new Date(slot.start*1000).toLocaleString('en-US',{timeZone:'America/Chicago'}),slot.id));select.required=true;label.append(select);form.append(label,node('button','RESCHEDULE SESSION'));form.onsubmit=e=>{e.preventDefault();save('/client',{id:booking.id,action:'reschedule',slot:select.value});};section.append(form);}
 for(const action of ['complete','cancel']){const button=node('button',action==='complete'?'MARK COMPLETED':'CANCEL SESSION');button.className='action';button.onclick=()=>{if(action==='cancel'&&!confirm('Cancel this session? Handle any approved refund separately in the Blazevisionz Stripe account.'))return;save('/client',{id:booking.id,action});};section.append(button);}}
 clients.append(section);}
 }catch(e){status.textContent=e.message;document.querySelectorAll('form button,#dispatch').forEach(b=>b.disabled=true);}
}
for(const [id,path] of [['week-form','/week'],['block-form','/block'],['slot-form','/slot'],['close-date-form','/close-date']])document.getElementById(id).onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));for(const key of ['limit','minutes','before','after'])if(key in data)data[key]=Number(data[key]);save(path,data);};
document.getElementById('dispatch').onclick=()=>save('/dispatch',{});
load();
