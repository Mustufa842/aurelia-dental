export async function onRequestGet(context) {
  const { env } = context;
  return Response.json({
    success: true,
    status: 'ok',
    aiMode: env.ANTHROPIC_API_KEY ? 'live-anthropic' : 'rule-based',
    time: new Date().toISOString(),
  });
}
