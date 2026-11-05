// Lokaler Testserver mit Beispieldaten (SQLite im Speicher). Kein Cloudflare-Konto und kein API-Key nötig.
// Start: node --no-warnings dev/server.mjs   (Port 8787, oder PORT=...)
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeD1 } from '../test/helpers/d1.js';
import { handleApi } from '../src/api.js';
import { settleMatches, upsertMatches, upsertStandings } from '../src/sync.js';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const db = makeD1();
const env = { DB: db };
const now = () => Math.floor(Date.now() / 1000);

const T = {
  bay: [5, 'Bayern', 'FCB'], bvb: [4, 'Dortmund', 'BVB'], rbl: [721, 'Leipzig', 'RBL'], b04: [3, 'Leverkusen', 'B04'],
  ars: [57, 'Arsenal', 'ARS'], che: [61, 'Chelsea', 'CHE'], liv: [64, 'Liverpool', 'LIV'], mci: [65, 'Man City', 'MCI'],
  rea: [86, 'Real Madrid', 'RMA'], bar: [81, 'Barcelona', 'FCB'], int: [108, 'Inter', 'INT'], mil: [98, 'Milan', 'MIL'],
  psg: [524, 'Paris SG', 'PSG'], atm: [78, 'Atlético', 'ATM'],
};
const COMPS = {
  BL1: { id: 2002, code: 'BL1', name: 'Bundesliga' }, PL: { id: 2021, code: 'PL', name: 'Premier League' },
  CL: { id: 2001, code: 'CL', name: 'Champions League' }, PD: { id: 2014, code: 'PD', name: 'La Liga' },
  SA: { id: 2019, code: 'SA', name: 'Serie A' },
};
let nextId = 5000;
const mk = (comp, home, away, offsetSec, extra = {}) => ({
  id: nextId++,
  utcDate: new Date((now() + offsetSec) * 1000).toISOString(),
  status: 'TIMED',
  matchday: 11,
  stage: 'REGULAR_SEASON',
  competition: COMPS[comp],
  area: { name: 'Welt' },
  homeTeam: { id: T[home][0], name: T[home][1], shortName: T[home][1], tla: T[home][2], crest: null },
  awayTeam: { id: T[away][0], name: T[away][1], shortName: T[away][1], tla: T[away][2], crest: null },
  score: { duration: 'REGULAR', fullTime: { home: null, away: null } },
  ...extra,
});
const done = (h, a) => ({ status: 'FINISHED', score: { duration: 'REGULAR', fullTime: { home: h, away: a } } });
const H = 3600;
const D = 86400;

const matches = [
  mk('BL1', 'bay', 'bvb', -D - 3 * H, done(3, 1)),
  mk('PL', 'liv', 'mci', -D - 5 * H, done(0, 0)),
  mk('PD', 'rea', 'bar', -2 * D, done(2, 2)),
  mk('BL1', 'rbl', 'b04', -40 * 60, { status: 'IN_PLAY' }),
  mk('BL1', 'bay', 'rbl', 3 * H),
  mk('PL', 'ars', 'che', 5 * H),
  mk('CL', 'psg', 'atm', D + 2 * H, { matchday: 5, stage: 'LEAGUE_STAGE' }),
  mk('CL', 'int', 'mil', D + 2 * H),
  mk('CL', 'rea', 'liv', D + 4 * H),
  mk('SA', 'int', 'mil', 2 * D + H),
  mk('PD', 'bar', 'atm', 2 * D + 3 * H),
];

await upsertMatches(db, matches, now());
// Beispiel-Tabellen, damit die Punkte nach Teamstärke sichtbar werden
const st = (id, played, gf, ga) => ({ team_id: id, played, goals_for: gf, goals_against: ga, points: 0 });
await upsertStandings(db, 'BL1', [st(5, 10, 32, 8), st(4, 10, 20, 14), st(721, 10, 18, 12), st(3, 10, 22, 12)]);
await upsertStandings(db, 'PL', [st(57, 10, 24, 7), st(61, 10, 15, 14), st(64, 10, 20, 12), st(65, 10, 22, 11)]);

const call = async (method, path, body, token) => {
  const res = await handleApi(
    new Request(`http://x${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }),
    env,
  );
  return res.json();
};

const a = await call('POST', '/api/register', { name: 'Leif', pin: '1234', groupName: 'Familie Schmale' });
const code = a.group.code;
const b = await call('POST', '/api/register', { name: 'Mia', pin: '4321', groupCode: code });
const c = await call('POST', '/api/register', { name: 'Tom', pin: '1111', groupCode: code });
const tips = (token, id, list) => Promise.all(list.map(([market, pick]) => call('PUT', `/api/matches/${id}/tips`, { market, pick }, token)));

// Tipps auf bereits gespielte Spiele direkt eintragen (die API sperrt nach dem Anpfiff)
const addTip = (pid, mid, market, pick, potential) =>
  db.prepare('INSERT OR REPLACE INTO tips (player_id, match_id, market, pick, potential, created_at) VALUES (?,?,?,?,?,?)').bind(pid, mid, market, pick, potential, now()).run();
for (const [pid, picks] of [[1, [['1x2', '1', 2], ['exact', '3:1', 13], ['btts', 'Y', 2], ['ou35', 'O', 3]]], [2, [['1x2', 'X', 4], ['exact', '2:1', 9]]], [3, [['1x2', '1', 2]]]]) {
  for (const [market, pick, pot] of picks) await addTip(pid, 5000, market, pick, pot);
}
await addTip(1, 5001, '1x2', 'X', 4);
await addTip(1, 5001, 'ou25', 'U', 2);
await addTip(2, 5003, '1x2', '2', 3);
await settleMatches(db);
// Nur für die Vorschau: Leif bekommt Bonuspunkte, damit sich der Shop ausprobieren lässt
await db.prepare("UPDATE tips SET points = points + 100 WHERE player_id = 1 AND market = 'exact' AND match_id = 5000").run();

await tips(a.token, 5004, [['1x2', '1'], ['exact', '2:1'], ['dc', '1X']]);
await tips(b.token, 5004, [['1x2', 'X']]);
await tips(a.token, 5005, [['btts', 'Y']]);

await writeFile(join(ROOT, '..', 'dev', 'tokens.json'), JSON.stringify({ code, leif: a.token, mia: b.token, tom: c.token, openMatch: 5004, doneMatch: 5000, liveMatch: 5003 }, null, 2));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok) => { let d = ''; req.on('data', (x) => (d += x)); req.on('end', () => ok(d)); });
    const r = await handleApi(new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body }), env);
    res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(await r.text());
  }
  const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
  try {
    const file = await readFile(join(ROOT, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end('Nicht gefunden');
  }
}).listen(PORT, () => console.log(`Tippspiel-Testserver: http://localhost:${PORT}  (Gruppencode ${code})`));
