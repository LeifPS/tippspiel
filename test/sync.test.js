import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.js';
import { runSync, settleMatches, upsertMatches } from '../src/sync.js';
import { normalizeMatch, regularTimeGoals } from '../src/footballdata.js';

const NOW = Date.UTC(2026, 10, 5, 20, 0) / 1000;

const apiMatch = (over = {}) => ({
  id: 1001,
  utcDate: '2026-11-05T18:30:00Z',
  status: 'TIMED',
  matchday: 10,
  stage: 'REGULAR_SEASON',
  competition: { id: 2002, code: 'BL1', name: 'Bundesliga', emblem: 'bl1.png' },
  area: { name: 'Germany' },
  homeTeam: { id: 5, name: 'FC Bayern München', shortName: 'Bayern', tla: 'FCB', crest: 'b.png' },
  awayTeam: { id: 4, name: 'Borussia Dortmund', shortName: 'Dortmund', tla: 'BVB', crest: 'd.png' },
  score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
  ...over,
});

const finished = (home, away, extra = {}) =>
  apiMatch({ status: 'FINISHED', score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home, away }, ...extra } });

async function addPlayerWithTips(db, matchId, tips) {
  await db
    .prepare("INSERT INTO groups (code, name, created_at) VALUES ('FAM', 'Familie', 0)")
    .run();
  await db
    .prepare("INSERT INTO players (id, group_code, name, salt, pin_hash, created_at) VALUES (1, 'FAM', 'Leif', 's', 'h', 0)")
    .run();
  for (const [market, pick, potential] of tips) {
    await db
      .prepare('INSERT INTO tips (player_id, match_id, market, pick, potential, created_at) VALUES (1, ?, ?, ?, ?, 0)')
      .bind(matchId, market, pick, potential)
      .run();
  }
}

const tipRows = async (db) =>
  (await db.prepare('SELECT market, status, points FROM tips ORDER BY market').all()).results;

test('regularTimeGoals: Elfmeterschießen ohne regularTime ist nicht sicher bestimmbar', () => {
  assert.deepEqual(regularTimeGoals({ duration: 'REGULAR', fullTime: { home: 2, away: 1 } }), { home: 2, away: 1 });
  assert.equal(regularTimeGoals({ duration: 'PENALTY_SHOOTOUT', fullTime: { home: 5, away: 4 } }), null);
  assert.deepEqual(
    regularTimeGoals({ duration: 'PENALTY_SHOOTOUT', fullTime: { home: 5, away: 4 }, regularTime: { home: 1, away: 1 } }),
    { home: 1, away: 1 },
  );
  assert.equal(regularTimeGoals({ duration: 'REGULAR', fullTime: { home: null, away: null } }), null);
});

test('normalizeMatch überspringt Spiele ohne feste Paarung', () => {
  assert.equal(normalizeMatch(apiMatch({ homeTeam: { id: null, name: null } })), null);
  const n = normalizeMatch(apiMatch(), NOW);
  assert.equal(n.match.home_name, 'Bayern');
  assert.equal(n.match.kickoff, Date.UTC(2026, 10, 5, 18, 30) / 1000);
  assert.equal(n.competition.code, 'BL1');
});

test('upsertMatches schreibt nur geänderte Zeilen', async () => {
  const db = makeD1();
  await upsertMatches(db, [apiMatch()], NOW);
  const before = db.raw.prepare('SELECT updated_at FROM matches WHERE id = 1001').get().updated_at;
  await upsertMatches(db, [apiMatch()], NOW + 600); // unverändert
  assert.equal(db.raw.prepare('SELECT updated_at FROM matches WHERE id = 1001').get().updated_at, before);
  await upsertMatches(db, [apiMatch({ status: 'IN_PLAY' })], NOW + 1200); // geändert
  const row = db.raw.prepare('SELECT status, updated_at FROM matches WHERE id = 1001').get();
  assert.equal(row.status, 'IN_PLAY');
  assert.equal(row.updated_at, NOW + 1200);
});

test('Wertung: Endstand 2:1 vergibt Punkte, Verlierer-Tipps null', async () => {
  const db = makeD1();
  await upsertMatches(db, [apiMatch()], NOW);
  await addPlayerWithTips(db, 1001, [
    ['1x2', '1', 2],
    ['1x2x', 'X', 4],
    ['exact', '2:1', 9],
    ['btts', 'N', 2],
  ]);
  assert.equal(await settleMatches(db), 0); // Spiel noch offen
  await upsertMatches(db, [finished(2, 1)], NOW + 1);
  assert.equal(await settleMatches(db), 1);
  const rows = await tipRows(db);
  assert.deepEqual(rows.find((r) => r.market === '1x2'), { market: '1x2', status: 'won', points: 3 });
  assert.deepEqual(rows.find((r) => r.market === 'exact'), { market: 'exact', status: 'won', points: 9 });
  assert.deepEqual(rows.find((r) => r.market === 'btts'), { market: 'btts', status: 'lost', points: 0 });
  assert.equal(await settleMatches(db), 0); // nicht doppelt werten
});

test('Korrigierter Endstand wird neu gewertet', async () => {
  const db = makeD1();
  await upsertMatches(db, [finished(2, 1)], NOW);
  await addPlayerWithTips(db, 1001, [['1x2', '1', 2]]);
  await settleMatches(db);
  assert.equal((await tipRows(db))[0].status, 'won');
  await upsertMatches(db, [finished(1, 1)], NOW + 5);
  assert.equal(await settleMatches(db), 1);
  assert.deepEqual((await tipRows(db))[0], { market: '1x2', status: 'lost', points: 0 });
});

test('Absage und Elfmeterschießen ohne reguläre Zeit: Tipps verfallen ohne Punkte (void)', async () => {
  const db = makeD1();
  await upsertMatches(
    db,
    [
      apiMatch({ id: 1, status: 'CANCELLED' }),
      apiMatch({
        id: 2,
        status: 'FINISHED',
        score: { duration: 'PENALTY_SHOOTOUT', fullTime: { home: 5, away: 4 } },
      }),
    ],
    NOW,
  );
  await db.prepare("INSERT INTO groups (code, name, created_at) VALUES ('FAM','F',0)").run();
  await db.prepare("INSERT INTO players (id, group_code, name, salt, pin_hash, created_at) VALUES (1,'FAM','L','s','h',0)").run();
  for (const id of [1, 2]) {
    await db.prepare("INSERT INTO tips VALUES (1, ?, '1x2', '1', 2, 'open', 0, 0)").bind(id).run();
  }
  await settleMatches(db);
  const rows = (await db.prepare('SELECT match_id, status, points FROM tips ORDER BY match_id').all()).results;
  assert.deepEqual(rows, [
    { match_id: 1, status: 'void', points: 0 },
    { match_id: 2, status: 'void', points: 0 },
  ]);
});

test('runSync: ohne Token passiert nichts, mit Token läuft das Budget korrekt', async () => {
  const db = makeD1();
  assert.deepEqual(await runSync({ DB: db }, NOW), { skipped: 'kein API-Token gesetzt' });

  const seen = [];
  const fetchMatches = async (_t, job) => {
    seen.push(job.key);
    return { ok: true, matches: [apiMatch()], available: 8 };
  };
  const r1 = await runSync({ DB: db, FOOTBALL_DATA_TOKEN: 'x' }, NOW, { fetchMatches });
  assert.equal(r1.jobs.length, 4); // alle vier Fenster beim ersten Start
  assert.equal(db.raw.prepare('SELECT COUNT(*) c FROM matches').get().c, 1);

  // Direkt danach (gleiche Minute): nichts fällig, Budget wird nicht angefasst
  seen.length = 0;
  const r2 = await runSync({ DB: db, FOOTBALL_DATA_TOKEN: 'x' }, NOW + 5, { fetchMatches });
  assert.equal(r2.jobs.length, 0);
  assert.equal(seen.length, 0);
});

test('runSync: HTTP 429 sperrt weitere Aufrufe bis Ablauf', async () => {
  const db = makeD1();
  let calls = 0;
  const fetchMatches = async () => {
    calls++;
    return { ok: false, rateLimited: true, retryAfter: 45 };
  };
  const env = { DB: db, FOOTBALL_DATA_TOKEN: 'x' };
  const r1 = await runSync(env, NOW, { fetchMatches });
  assert.equal(calls, 1);
  assert.equal(r1.jobs[0].rateLimited, true);
  const r2 = await runSync(env, NOW + 10, { fetchMatches });
  assert.ok(r2.skipped);
  assert.equal(calls, 1);
  await runSync(env, NOW + 60, { fetchMatches });
  assert.equal(calls, 2);
});

test('runSync: Budget pro Minute wird nie überschritten', async () => {
  const db = makeD1();
  const env = { DB: db, FOOTBALL_DATA_TOKEN: 'x' };
  let calls = 0;
  const fetchMatches = async () => {
    calls++;
    return { ok: true, matches: [], available: null };
  };
  // 10 Minuten lang, Ergebnisfenster ist wegen "live" jede Minute fällig
  await upsertMatches(db, [apiMatch({ status: 'IN_PLAY', utcDate: '2026-11-05T19:30:00Z' })], NOW);
  for (let i = 0; i < 10; i++) await runSync(env, NOW + i * 60, { fetchMatches });
  const perMinute = db.raw.prepare('SELECT ts, COUNT(*) c FROM api_calls GROUP BY ts').all();
  for (const row of perMinute) assert.ok(row.c <= 9, `${row.ts}: ${row.c}`);
  assert.ok(calls >= 10 + 3); // 4 Fenster zu Beginn plus jede Minute das Ergebnisfenster
});

test('Fehlerhafte Antwort (z. B. 403) wird protokolliert und das Fenster erst später wiederholt', async () => {
  const db = makeD1();
  const env = { DB: db, FOOTBALL_DATA_TOKEN: 'x' };
  const fetchMatches = async () => ({ ok: false, status: 403, error: 'forbidden' });
  const r = await runSync(env, NOW, { fetchMatches });
  assert.equal(r.jobs.length, 4);
  const err = db.raw.prepare("SELECT value FROM sync_state WHERE key = 'api:last_error'").get();
  assert.match(err.value, /403/);
});
