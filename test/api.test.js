import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from './helpers/d1.js';
import { handleApi } from '../src/api.js';
import { settleMatches, upsertMatches } from '../src/sync.js';

const NOW = Date.UTC(2026, 10, 5, 12, 0) / 1000; // Donnerstag, 5. Nov 2026
const KICKOFF = NOW + 6 * 3600;

const apiMatch = (over = {}) => ({
  id: 1001,
  utcDate: new Date(KICKOFF * 1000).toISOString(),
  status: 'TIMED',
  matchday: 10,
  stage: 'REGULAR_SEASON',
  competition: { id: 2002, code: 'BL1', name: 'Bundesliga', emblem: 'bl1.png' },
  area: { name: 'Germany' },
  homeTeam: { id: 5, name: 'FC Bayern München', shortName: 'Bayern', tla: 'FCB', crest: 'b.png' },
  awayTeam: { id: 4, name: 'Borussia Dortmund', shortName: 'Dortmund', tla: 'BVB', crest: 'd.png' },
  score: { duration: 'REGULAR', fullTime: { home: null, away: null } },
  ...over,
});

function setup() {
  const db = makeD1();
  const env = { DB: db };
  const call = async (method, path, { body, token, now = NOW } = {}) => {
    const res = await handleApi(
      new Request(`https://tipp.test${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      now,
    );
    return { status: res.status, data: await res.json() };
  };
  return { db, env, call };
}

async function family(call) {
  const a = await call('POST', '/api/register', { body: { name: 'Leif', pin: '1234', groupName: 'Familie Schmale' } });
  assert.equal(a.status, 201);
  const code = a.data.group.code;
  const b = await call('POST', '/api/register', { body: { name: 'Mia', pin: '4321', groupCode: code } });
  assert.equal(b.status, 201);
  return { code, leif: a.data.token, mia: b.data.token };
}

test('Registrierung, Gruppenliste und Anmeldung', async () => {
  const { call } = setup();
  const { code } = await family(call);
  assert.match(code, /^[A-Z2-9]{6}$/);

  const info = await call('GET', `/api/group/${code}`);
  assert.deepEqual(info.data.members.map((m) => m.name), ['Leif', 'Mia']);
  assert.equal((await call('GET', '/api/group/ZZZZZZ')).status, 404);

  assert.equal((await call('POST', '/api/register', { body: { name: 'leif', pin: '1111', groupCode: code } })).status, 409);
  assert.equal((await call('POST', '/api/register', { body: { name: 'X', pin: '1111', groupCode: code } })).status, 400);
  assert.equal((await call('POST', '/api/register', { body: { name: 'Tom', pin: '12', groupCode: code } })).status, 400);
  assert.equal((await call('POST', '/api/register', { body: { name: 'Tom', pin: '1111', groupCode: 'AAAAAA' } })).status, 404);

  const ok = await call('POST', '/api/login', { body: { groupCode: code, name: 'mia', pin: '4321' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.player.name, 'Mia');
  assert.equal(ok.data.coins, 0);
});

test('Nach 5 falschen PINs wird kurz gesperrt, danach geht es wieder', async () => {
  const { call } = setup();
  const { code } = await family(call);
  for (let i = 0; i < 5; i++) {
    const r = await call('POST', '/api/login', { body: { groupCode: code, name: 'Mia', pin: '0000' } });
    assert.equal(r.status, 401);
  }
  const locked = await call('POST', '/api/login', { body: { groupCode: code, name: 'Mia', pin: '4321' } });
  assert.equal(locked.status, 429);
  const later = await call('POST', '/api/login', { body: { groupCode: code, name: 'Mia', pin: '4321' }, now: NOW + 61 });
  assert.equal(later.status, 200);
});

test('Ohne Anmeldung kein Zugriff', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/matches')).status, 401);
  assert.equal((await call('GET', '/api/matches', { token: 'x'.repeat(40) })).status, 401);
});

test('Tippen: Märkte, Tippschluss, Sichtbarkeit der Tipps anderer', async () => {
  const { db, call } = setup();
  const { leif, mia } = await family(call);
  await upsertMatches(db, [apiMatch()], NOW);

  const list = await call('GET', '/api/matches', { token: leif });
  assert.equal(list.data.matches.length, 1);
  assert.equal(list.data.matches[0].locked, false);
  assert.equal(list.data.competitions[0].code, 'BL1');

  const detail = await call('GET', '/api/matches/1001', { token: leif });
  assert.equal(detail.data.markets.length, 10);
  assert.equal(detail.data.group.others, null);

  const put = (token, market, pick, now = NOW) =>
    call('PUT', '/api/matches/1001/tips', { token, body: { market, pick }, now });

  assert.equal((await put(leif, '1x2', '1')).status, 200);
  assert.equal((await put(leif, 'exact', '2:1')).data.myTips.exact.potential, 9);
  const swapped = await put(leif, '1x2', 'X'); // ändern geht, und ein Tipp in einem anderen Markt ersetzt den alten
  assert.equal(swapped.data.myTips['1x2'].pick, 'X');
  assert.deepEqual(Object.keys(swapped.data.myTips), ['1x2']);
  assert.equal((await put(leif, '1x2', 'Q')).status, 400);
  assert.equal((await put(leif, 'gibtsnicht', '1')).status, 400);
  assert.equal((await put(mia, '1x2', '2')).status, 200);

  // Vor Anpfiff sieht Mia nur, wie viele getippt haben
  const before = await call('GET', '/api/matches/1001', { token: mia });
  assert.equal(before.data.group.tippers, 2);
  assert.equal(before.data.group.others, null);

  // Tipp löschen
  assert.equal(Object.keys((await put(leif, 'exact', null)).data.myTips).length, 1);

  // Nach Anpfiff geschlossen, dafür sind die Tipps der anderen sichtbar
  assert.equal((await put(leif, '1x2', '1', KICKOFF)).status, 403);
  const after = await call('GET', '/api/matches/1001', { token: mia, now: KICKOFF + 60 });
  assert.equal(after.data.match.locked, true);
  assert.equal(after.data.group.others[0].name, 'Leif');
  assert.equal(after.data.group.others[0].tips[0].pick, 'X');
});

test('Verschobene Spiele sind nicht tippbar', async () => {
  const { db, call } = setup();
  const { leif } = await family(call);
  await upsertMatches(db, [apiMatch({ status: 'POSTPONED' })], NOW);
  const r = await call('PUT', '/api/matches/1001/tips', { token: leif, body: { market: '1x2', pick: '1' } });
  assert.equal(r.status, 409);
});

test('Wertung, Rangliste, Münzen und Shop', async () => {
  const { db, call } = setup();
  const { leif, mia } = await family(call);
  await upsertMatches(db, [apiMatch()], NOW);
  const put = (token, market, pick) => call('PUT', '/api/matches/1001/tips', { token, body: { market, pick } });
  await put(leif, '1x2', '1'); // wird ersetzt: pro Spiel zählt nur ein Tipp
  await put(leif, 'exact', '2:1'); // 9 Punkte
  await put(mia, '1x2', 'X'); // wird ersetzt
  await put(mia, 'ou25', 'O'); // 2 Punkte

  await upsertMatches(
    db,
    [apiMatch({ status: 'FINISHED', score: { duration: 'REGULAR', fullTime: { home: 2, away: 1 } } })],
    KICKOFF + 7200,
  );
  assert.equal(await settleMatches(db), 1);

  const lb = await call('GET', '/api/leaderboard', { token: mia, now: KICKOFF + 8000 });
  assert.deepEqual(lb.data.rows.map((r) => [r.name, r.rank, r.points, r.exact]), [['Leif', 1, 9, 1], ['Mia', 2, 2, 0]]);
  assert.equal(lb.data.rows[1].me, true);
  assert.equal(lb.data.rows[0].hitRate, 100);
  const week = await call('GET', '/api/leaderboard?period=week', { token: mia, now: KICKOFF + 8000 });
  assert.equal(week.data.rows[0].points, 9);
  const nextWeek = await call('GET', '/api/leaderboard?period=week', { token: mia, now: KICKOFF + 8 * 86400 });
  assert.equal(nextWeek.data.rows[0].points, 0);

  // Münzen = gewonnene Punkte minus Ausgaben
  const me = await call('GET', '/api/me', { token: leif });
  assert.equal(me.data.coins, 9);
  assert.equal(me.data.level.level, 1);

  // Mia hat nur 2 Münzen: der Kauf scheitert
  assert.equal((await call('POST', '/api/shop/buy', { token: mia, body: { item: 'a1' } })).status, 402);
  // Gratis-Items, unbekannte Items und zu teure Items werden abgelehnt
  assert.equal((await call('POST', '/api/shop/buy', { token: leif, body: { item: 'o1' } })).status, 400);
  assert.equal((await call('POST', '/api/shop/buy', { token: leif, body: { item: 'nix' } })).status, 404);
  assert.equal((await call('POST', '/api/shop/buy', { token: leif, body: { item: 'a1' } })).status, 402);

  // Mehr Punkte per Direkt-Eintrag, damit der Kauf klappt
  await db.prepare("UPDATE tips SET points = 100 WHERE player_id = 1 AND market = 'exact'").run();
  const bought = await call('POST', '/api/shop/buy', { token: leif, body: { item: 'a1' } });
  assert.equal(bought.status, 200);
  assert.equal(bought.data.coins, 60); // 100 Punkte minus 40 für das Stirnband
  assert.deepEqual(bought.data.owned, ['a1']);
  assert.equal((await call('POST', '/api/shop/buy', { token: leif, body: { item: 'a1' } })).status, 409);

  // Anziehen: gekauftes Item geht, ungekauftes nicht
  const me2 = await call('GET', '/api/me', { token: leif });
  const avatar = { ...me2.data.player.avatar, accessory: 'a1' };
  assert.equal((await call('POST', '/api/profile', { token: leif, body: { avatar } })).status, 200);
  assert.equal((await call('POST', '/api/profile', { token: leif, body: { avatar: { ...avatar, accessory: 'a7' } } })).status, 400);
  assert.equal((await call('POST', '/api/profile', { token: leif, body: { frame: 'f4' } })).status, 400);
  assert.equal((await call('POST', '/api/profile', { token: leif, body: { frame: 'f1' } })).status, 200);

  // Titel: "Stammtipper" braucht 100 Punkte (Leif hat jetzt 100)
  assert.equal((await call('POST', '/api/profile', { token: leif, body: { title: 'regular' } })).data.player.title, 'regular');
  assert.equal((await call('POST', '/api/profile', { token: leif, body: { title: 'legend' } })).status, 400);
  assert.equal((await call('POST', '/api/profile', { token: mia, body: { title: 'regular' } })).status, 400);

  const shop = await call('GET', '/api/shop', { token: leif });
  assert.equal(shop.data.catalog.accessory.find((i) => i.id === 'a1').owned, true);
  assert.equal(shop.data.catalog.accessory.find((i) => i.id === 'a7').owned, false);
  assert.equal(shop.data.catalog.outfit.find((i) => i.id === 'o1').owned, true);
});

test('Gruppen sind getrennt: fremde sehen weder Rangliste noch Tipps', async () => {
  const { db, call } = setup();
  const { leif } = await family(call);
  const other = await call('POST', '/api/register', { body: { name: 'Fremd', pin: '9999', groupName: 'Andere' } });
  await upsertMatches(db, [apiMatch()], NOW);
  await call('PUT', '/api/matches/1001/tips', { token: leif, body: { market: '1x2', pick: '1' } });
  const lb = await call('GET', '/api/leaderboard', { token: other.data.token });
  assert.deepEqual(lb.data.rows.map((r) => r.name), ['Fremd']);
  const d = await call('GET', '/api/matches/1001', { token: other.data.token, now: KICKOFF + 60 });
  assert.deepEqual(d.data.group.others, []);
  assert.equal(d.data.group.tippers, 0);
});

test('Abmelden macht den Token ungültig', async () => {
  const { call } = setup();
  const { leif } = await family(call);
  assert.equal((await call('GET', '/api/me', { token: leif })).status, 200);
  await call('POST', '/api/logout', { token: leif });
  assert.equal((await call('GET', '/api/me', { token: leif })).status, 401);
});

test('Der Gründer legt fest, welche Wettbewerbe die Gruppe tippt', async () => {
  const { db, call } = setup();
  const { leif, mia, code } = await family(call);
  await upsertMatches(
    db,
    [
      apiMatch(),
      apiMatch({
        id: 1002,
        competition: { id: 2021, code: 'PL', name: 'Premier League', emblem: 'pl.png' },
        homeTeam: { id: 57, name: 'Arsenal', shortName: 'Arsenal', tla: 'ARS', crest: 'a.png' },
        awayTeam: { id: 61, name: 'Chelsea', shortName: 'Chelsea', tla: 'CHE', crest: 'c.png' },
      }),
    ],
    NOW,
  );

  // Leif hat die Gruppe angelegt, Mia ist nur Mitglied
  assert.equal((await call('GET', '/api/me', { token: leif })).data.group.isFounder, true);
  assert.equal((await call('GET', '/api/me', { token: mia })).data.group.isFounder, false);
  assert.equal((await call('GET', '/api/group/settings', { token: mia })).data.isFounder, false);

  // Anfangs sind alle 12 Wettbewerbe an
  const s0 = await call('GET', '/api/group/settings', { token: leif });
  assert.equal(s0.data.competitions.length, 12);
  assert.ok(s0.data.competitions.every((c) => c.enabled));
  assert.equal(s0.data.competitions.find((c) => c.code === 'PL').upcoming, 1);
  assert.equal((await call('GET', '/api/matches', { token: mia })).data.matches.length, 2);

  // Mia darf nichts ändern, falsche Eingaben werden abgelehnt
  assert.equal((await call('POST', '/api/group/settings', { token: mia, body: { competitions: ['BL1'] } })).status, 403);
  assert.equal((await call('POST', '/api/group/settings', { token: leif, body: { competitions: [] } })).status, 400);
  assert.equal((await call('POST', '/api/group/settings', { token: leif, body: { competitions: ['XYZ'] } })).status, 400);
  assert.equal((await call('POST', '/api/group/settings', { token: leif, body: {} })).status, 400);

  // Nur Bundesliga: die Premier League verschwindet für alle in der Gruppe
  const saved = await call('POST', '/api/group/settings', { token: leif, body: { competitions: ['BL1'] } });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.competitions.filter((c) => c.enabled).map((c) => c.code), ['BL1']);
  const list = await call('GET', '/api/matches', { token: mia });
  assert.deepEqual(list.data.matches.map((m) => m.competition), ['BL1']);
  assert.deepEqual(list.data.competitions.map((c) => c.code), ['BL1']);
  assert.equal((await call('GET', '/api/matches/1002', { token: mia })).status, 403);
  assert.equal((await call('PUT', '/api/matches/1002/tips', { token: mia, body: { market: '1x2', pick: '1' } })).status, 403);
  assert.equal((await call('PUT', '/api/matches/1001/tips', { token: mia, body: { market: '1x2', pick: '1' } })).status, 200);

  // Eine andere Gruppe bleibt davon unberührt
  const other = await call('POST', '/api/register', { body: { name: 'Fremd', pin: '9999', groupName: 'Andere' } });
  assert.equal((await call('GET', '/api/matches', { token: other.data.token })).data.matches.length, 2);
  assert.equal(other.data.group.isFounder, true);

  // Alle wieder an: gespeichert wird "alle" (null)
  const all = ['WC', 'CL', 'BL1', 'DED', 'BSA', 'PD', 'FL1', 'ELC', 'PPL', 'EC', 'SA', 'PL'];
  assert.equal((await call('POST', '/api/group/settings', { token: leif, body: { competitions: all } })).status, 200);
  assert.equal(db.raw.prepare('SELECT competitions c FROM groups WHERE code = ?').get(code).c, null);
  assert.equal((await call('GET', '/api/matches', { token: mia })).data.matches.length, 2);
});
