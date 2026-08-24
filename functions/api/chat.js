import { ruleBasedReply, anthropicReply } from '../_lib/knowledge.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => ({}));
  const message = (body.message || '').toString().trim();
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message) {
    return Response.json({ success: false, error: 'Message is required.' }, { status: 400 });
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
    return Response.json({ success: true, reply, mode });
  } catch (err) {
    console.error('Chat error:', err.message);
    return Response.json({ success: true, reply: ruleBasedReply(message), mode: 'rules-fallback' });
  }
}
