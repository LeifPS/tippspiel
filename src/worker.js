import { handleApi } from './api.js';
import { runSync } from './sync.js';

async function syncIfStale(env) {
  try {
    const row = await env.DB.prepare("SELECT last_run FROM sync_state WHERE key = 'sync:heartbeat'").first();
    if (!row || Math.floor(Date.now() / 1000) - row.last_run > 90) await runSync(env);
  } catch (err) {
    console.error('Sync bei Aufruf fehlgeschlagen', err);
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      // Zweitweg: Falls der Cron ausfällt, stößt ein Seitenaufruf den Sync an (der Scheduler hält das API-Budget selbst ein)
      if (request.method === 'GET' && pathname === '/api/matches' && ctx?.waitUntil) {
        ctx.waitUntil(syncIfStale(env));
      }
      return handleApi(request, env);
    }
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
