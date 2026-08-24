export async function onRequestPatch(context) {
  const { request, env, params } = context;

  if (request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const allowedStatus = ['pending', 'confirmed', 'cancelled'];

  if (!allowedStatus.includes(body.status)) {
    return Response.json({ success: false, error: 'Invalid status' }, { status: 400 });
  }

  await env.DB.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(body.status, params.id).run();
  const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(params.id).first();

  if (!booking) {
    return Response.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  return Response.json({ success: true, booking });
}
