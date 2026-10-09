const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
const dialog = document.getElementById('modal');
const form = document.getElementById('booking-form');
const select = document.getElementById('slot');
const status = document.getElementById('booking-status');
const button = document.getElementById('checkout');
let enabled = false;
let termsVersion = null;
async function availability() {
  button.disabled = true;
  try {
    const response = await fetch('/api/availability?package=' + document.getElementById('package').value);
    if (!response.ok) throw new Error();
    const data = await response.json();
    enabled = data.paymentsEnabled;
    document.getElementById('accept-terms').disabled = !enabled;
    termsVersion = data.termsVersion || null;
    select.replaceChildren(new Option('Choose an appointment', ''));
    for (const slot of data.slots) {
      select.add(new Option(new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'}).format(new Date(slot.start * 1000)), slot.id));
    }
    status.textContent = !enabled ? 'Booking is not open yet. No payment or appointment can be created.' : data.slots.length ? 'Select an appointment to continue. Your deposit is credited toward the total.' : 'No dates have been released. Please check back soon.';
    if (!data.slots.length) select.replaceChildren(new Option('No appointments released', ''));
    button.disabled = !enabled || !data.slots.length;
  } catch {
    enabled = false;
    select.replaceChildren(new Option('Booking is not open yet', ''));
    status.textContent = 'Booking is being prepared. No payment or appointment can be created.';
  }
}
document.getElementById('package').addEventListener('change', availability);
document.querySelectorAll('[data-package]').forEach(item => item.addEventListener('click', () => {
  document.getElementById('package').value = item.dataset.package.toLowerCase();
  document.getElementById('booking').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  document.getElementById('package').focus({preventScroll:true});
  availability();
}));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!enabled) return;
  button.disabled = true;
  status.textContent = 'Reserving your appointment and preparing secure checkout…';
  try {
    const response = await fetch('/api/bookings', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(form)),acceptedTerms:document.getElementById('accept-terms').checked,termsVersion})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to reserve this appointment.');
    const checkout = new URL(data.url);
    if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.stripe.com') throw new Error('Checkout unavailable.');
    window.location.assign(checkout.href);
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});
if (new URLSearchParams(location.search).has('checkout')) {
  status.textContent = 'Your checkout return does not confirm payment. Check your confirmation email for the verified booking status.';
}
document.getElementById('close').addEventListener('click', () => dialog.close());
document.getElementById('okay').addEventListener('click', () => dialog.close());
availability();
