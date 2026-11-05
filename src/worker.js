import { handleApi } from './api.js';
import { runSync } from './sync.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleApi(request, env);
    // Alles andere liefert das Asset-Binding aus (public/)
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Nicht gefunden', { status: 404 });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runSync(env).catch((err) => {
        console.error('Sync fehlgeschlagen', err);
      }),
    );
  },
};
