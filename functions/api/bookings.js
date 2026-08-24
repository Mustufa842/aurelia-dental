import { validateBooking } from '../_lib/validate.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  const { errors, clean } = validateBooking(body);

  if (errors.length) {
    return Response.json({ success: false, errors }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO bookings (id, name, phone, email, treatment, date, notes, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  )
    .bind(id, clean.name, clean.phone, clean.email, clean.treatment, clean.date, clean.notes, createdAt)
    .run();

  const booking = { id, ...clean, status: 'pending', createdAt };

  return Response.json(
    { success: true, message: 'Reservation received. Our concierge team will confirm shortly.', booking },
    { status: 201 }
  );
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { results } = await env.DB.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
  return Response.json({ success: true, bookings: results });
}
