// Shared booking validation logic, used by src/index.js

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-()\s]{7,20}$/;

export function validateBooking(body) {
  const errors = [];
  const name = (body.name || '').toString().trim();
  const phone = (body.phone || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const date = (body.date || '').toString().trim();
  const treatment = (body.treatment || '').toString().trim();
  const notes = (body.notes || '').toString().trim();

  if (!name || name.length < 2) errors.push('Please enter your full name.');
  if (!phone || !PHONE_RE.test(phone)) errors.push('Please enter a valid phone number.');
  if (email && !EMAIL_RE.test(email)) errors.push('Please enter a valid email address.');
  if (!date) errors.push('Please choose a preferred date.');
  if (!treatment) errors.push('Please choose a treatment of interest.');

  return { errors, clean: { name, phone, email, date, treatment, notes } };
}
