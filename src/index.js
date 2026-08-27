import { validateBooking } from './lib/validate.js';
import { ruleBasedReply, anthropicReply } from './lib/knowledge.js';

function json(data, init = {}) {
  return Response.json(data, init);
}

async function handleHealth(env) {
  return json({
    success: true,
    status: 'ok',
    aiMode: env.ANTHROPIC_API_KEY ? 'live-anthropic' : 'rule-based',
    time: new Date().toISOString(),
  });
}

async function handleChat(request, env) {
  const body = await request.json().catch(() => ({}));
  const message = (body.message || '').toString().trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message) {
    return json({ success: false, error: 'Message is required.' }, { status: 400 });
  }

  try {
    let reply;
    let mode;
    if (env.ANTHROPIC_API_KEY) {
      reply = await anthropicReply(message, history, env);
      mode = 'ai';
    } else {
      reply = ruleBasedReply(message);
      mode = 'rules';
    }
    return json({ success: true, reply, mode });
  } catch (err) {
    console.error('Chat error:', err.message);
    return json({ success: true, reply: ruleBasedReply(message), mode: 'rules-fallback' });
  }
}

async function handleCreateBooking(request, env) {
  const body = await request.json().catch(() => ({}));
  const { errors, clean } = validateBooking(body);

  if (errors.length) {
    return json({ success: false, errors }, { status: 400 });
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

  return json(
    { success: true, message: 'Reservation received. Our concierge team will confirm shortly.', booking },
    { status: 201 }
  );
}

async function handleListBookings(request, env) {
  if (request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const { results } = await env.DB.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
  return json({ success: true, bookings: results });
}

async function handleUpdateBooking(request, env, id) {
  if (request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const allowedStatus = ['pending', 'confirmed', 'cancelled'];

  if (!allowedStatus.includes(body.status)) {
    return json({ success: false, error: 'Invalid status' }, { status: 400 });
  }

  await env.DB.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(body.status, id).run();
  const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();

  if (!booking) {
    return json({ success: false, error: 'Not found' }, { status: 404 });
  }

  return json({ success: true, booking });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      if (pathname === '/api/health' && method === 'GET') {
        return await handleHealth(env);
      }

      if (pathname === '/api/chat' && method === 'POST') {
        return await handleChat(request, env);
      }

      if (pathname === '/api/bookings' && method === 'POST') {
        return await handleCreateBooking(request, env);
      }

      if (pathname === '/api/bookings' && method === 'GET') {
        return await handleListBookings(request, env);
      }

      const bookingMatch = pathname.match(/^\/api\/bookings\/([^/]+)$/);
      if (bookingMatch && method === 'PATCH') {
        return await handleUpdateBooking(request, env, bookingMatch[1]);
      }

      if (pathname.startsWith('/api/')) {
        return json({ success: false, error: 'Not found' }, { status: 404 });
      }
    } catch (err) {
      console.error('Worker error:', err);
      return json({ success: false, error: 'Internal server error' }, { status: 500 });
    }

    // Everything else: serve the static site (public/ via the ASSETS binding)
    return env.ASSETS.fetch(request);
  },
};
