import { runSync, syncHealth } from './sync.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json(await syncHealth(env.DB));
    return json({ error: 'Nicht gefunden' }, 404);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runSync(env).catch((err) => {
        console.error('Sync fehlgeschlagen', err);
      }),
    );
  },
};
