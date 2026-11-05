import { describeMarkets, isValidPick, marketById, pointsFor } from './markets.js';
import { FREE_COMPETITIONS } from './footballdata.js';
import {
  hashPin, LOCK_SECONDS, MAX_FAILS, NAME_RE, newGroupCode, newSalt, newToken, PIN_RE, sha256,
} from './auth.js';
import {
  CATALOG, DEFAULT_AVATAR, itemById, levelFor, TITLES, titleById, unlockedTitles, validateAvatar, validateFrame,
} from './cosmetics.js';
import { syncHealth } from './sync.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const DAY = 86400;
const startOfUtcDay = (ts) => Math.floor(ts / DAY) * DAY;
const TIPPABLE = new Set(['SCHEDULED', 'TIMED']);
const MAX_PLAYERS_PER_GROUP = 20;

async function readBody(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Ungültige Anfrage');
  return body;
}

const parseJson = (text, fallback) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const publicPlayer = (p) => ({
  id: p.id,
  name: p.name,
  avatar: parseJson(p.avatar, DEFAULT_AVATAR),
  frame: p.frame && p.frame !== 'none' ? p.frame : 'f0', // ältere Zeilen können noch 'none' enthalten
  title: p.title,
});

async function playerStats(db, playerId) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN status = 'won' THEN points END), 0) AS points,
              COUNT(CASE WHEN status IN ('won','lost') THEN 1 END) AS settled,
              COUNT(CASE WHEN status = 'won' THEN 1 END) AS won,
              COUNT(CASE WHEN status = 'won' AND market = 'exact' THEN 1 END) AS exact,
              COUNT(*) AS tips
       FROM tips WHERE player_id = ?`,
    )
    .bind(playerId)
    .first();
  return row ?? { points: 0, settled: 0, won: 0, exact: 0, tips: 0 };
}

async function ownedItems(db, playerId) {
  const { results } = await db.prepare('SELECT item_id FROM inventory WHERE player_id = ?').bind(playerId).all();
  return new Set(results.map((r) => r.item_id));
}

async function profileOf(db, player) {
  const stats = await playerStats(db, player.id);
  return {
    player: publicPlayer(player),
    stats,
    coins: stats.points - player.coins_spent,
    level: levelFor(stats.points),
    titles: unlockedTitles(stats),
    owned: [...(await ownedItems(db, player.id))],
  };
}

async function startSession(db, playerId, now) {
  const token = newToken();
  await db
    .prepare('INSERT INTO sessions (token_hash, player_id, created_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), playerId, now)
    .run();
  // Nur die 10 neuesten Sitzungen pro Person behalten
  await db
    .prepare(
      `DELETE FROM sessions WHERE player_id = ? AND token_hash NOT IN
         (SELECT token_hash FROM sessions WHERE player_id = ? ORDER BY created_at DESC LIMIT 10)`,
    )
    .bind(playerId, playerId)
    .run();
  return token;
}

function bearer(request) {
  const m = /^Bearer ([\w-]{20,200})$/.exec(request.headers.get('authorization') ?? '');
  return m ? m[1] : null;
}

async function authenticate(request, db) {
  const token = bearer(request);
  if (!token) return null;
  return db
    .prepare('SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ?')
    .bind(await sha256(token))
    .first();
}

// ---------- Konto ----------

const COMP_NAMES = {
  WC: 'Weltmeisterschaft', EC: 'Europameisterschaft', CL: 'Champions League', BL1: 'Bundesliga', DED: 'Eredivisie',
  BSA: 'Série A Brasilien', PD: 'La Liga', FL1: 'Ligue 1', ELC: 'Championship', PPL: 'Primeira Liga', SA: 'Serie A', PL: 'Premier League',
};

// Welche Wettbewerbe die Gruppe tippt: Liste von Kürzeln oder null für alle
const enabledCompetitions = (group) => {
  const list = parseJson(group?.competitions, null);
  return Array.isArray(list) ? list : null;
};

const groupView = (group, playerId) => ({ code: group.code, name: group.name, isFounder: group.founder_id === playerId });

async function groupOf(db, player) {
  return db.prepare('SELECT * FROM groups WHERE code = ?').bind(player.group_code).first();
}

async function assertCompetitionOpen(db, player, competition) {
  const enabled = enabledCompetitions(await groupOf(db, player));
  if (enabled && !enabled.includes(competition)) {
    throw new HttpError(403, 'Dieser Wettbewerb ist in deiner Gruppe nicht freigeschaltet.');
  }
}

async function groupSettings(db, player, now) {
  const group = await groupOf(db, player);
  const enabled = enabledCompetitions(group);
  const { results: known } = await db.prepare('SELECT code, name, emblem FROM competitions').all();
  const { results: counts } = await db
    .prepare('SELECT competition AS code, COUNT(*) AS n FROM matches WHERE kickoff > ? AND kickoff < ? GROUP BY competition')
    .bind(now, now + 14 * DAY)
    .all();
  return json({
    isFounder: group.founder_id === player.id,
    competitions: [...FREE_COMPETITIONS].map((code) => {
      const k = known.find((c) => c.code === code);
      return {
        code,
        name: COMP_NAMES[code] ?? k?.name ?? code,
        emblem: k?.emblem ?? null,
        upcoming: counts.find((c) => c.code === code)?.n ?? 0,
        enabled: !enabled || enabled.includes(code),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'de')),
  });
}

async function saveGroupSettings(request, db, player, now) {
  const group = await groupOf(db, player);
  if (group.founder_id !== player.id) throw new HttpError(403, 'Nur der Gründer der Gruppe kann das ändern.');
  const body = await readBody(request);
  const list = Array.isArray(body.competitions) ? [...new Set(body.competitions.map(String))] : null;
  if (!list || list.some((c) => !FREE_COMPETITIONS.has(c))) throw new HttpError(400, 'Unbekannter Wettbewerb.');
  if (list.length === 0) throw new HttpError(400, 'Wähle mindestens einen Wettbewerb aus.');
  const value = list.length === FREE_COMPETITIONS.size ? null : JSON.stringify(list);
  await db.prepare('UPDATE groups SET competitions = ? WHERE code = ?').bind(value, group.code).run();
  return groupSettings(db, player, now);
}

async function register(request, db, now) {
  const body = await readBody(request);
  const name = String(body.name ?? '').trim();
  const pin = String(body.pin ?? '');
  if (!NAME_RE.test(name)) throw new HttpError(400, 'Der Name braucht 2 bis 16 Zeichen (Buchstaben, Zahlen, Leerzeichen).');
  if (!PIN_RE.test(pin)) throw new HttpError(400, 'Die PIN besteht aus genau 4 Ziffern.');

  let code = String(body.groupCode ?? '').trim().toUpperCase();
  let group;
  if (code) {
    group = await db.prepare('SELECT * FROM groups WHERE code = ?').bind(code).first();
    if (!group) throw new HttpError(404, 'Diese Gruppe gibt es nicht. Stimmt der Code?');
    const count = await db.prepare('SELECT COUNT(*) AS c FROM players WHERE group_code = ?').bind(code).first('c');
    if (count >= MAX_PLAYERS_PER_GROUP) throw new HttpError(409, 'Die Gruppe ist voll.');
  } else {
    const groupName = String(body.groupName ?? 'Familie').trim().slice(0, 24) || 'Familie';
    for (let i = 0; i < 5 && !group; i++) {
      code = newGroupCode();
      const res = await db
        .prepare('INSERT OR IGNORE INTO groups (code, name, created_at) VALUES (?, ?, ?)')
        .bind(code, groupName, now)
        .run();
      if (res.meta.changes === 1) group = { code, name: groupName, created: true };
    }
    if (!group) throw new HttpError(500, 'Gruppe konnte nicht angelegt werden');
  }

  const clash = await db
    .prepare('SELECT 1 AS x FROM players WHERE group_code = ? AND lower(name) = lower(?)')
    .bind(group.code, name)
    .first();
  if (clash) throw new HttpError(409, 'Diesen Namen gibt es in der Gruppe schon.');

  const salt = newSalt();
  const res = await db
    .prepare(
      "INSERT INTO players (group_code, name, salt, pin_hash, avatar, frame, created_at) VALUES (?, ?, ?, ?, ?, 'f0', ?)",
    )
    .bind(group.code, name, salt, await hashPin(salt, pin), JSON.stringify(DEFAULT_AVATAR), now)
    .run();
  if (res.meta.changes !== 1) throw new HttpError(500, 'Konto konnte nicht angelegt werden');
  const player = await db
    .prepare('SELECT * FROM players WHERE group_code = ? AND name = ?')
    .bind(group.code, name)
    .first();
  if (group.created) {
    await db.prepare('UPDATE groups SET founder_id = ? WHERE code = ?').bind(player.id, group.code).run();
    group.founder_id = player.id;
  } else {
    group = await db.prepare('SELECT * FROM groups WHERE code = ?').bind(group.code).first();
  }
  const token = await startSession(db, player.id, now);
  return json({ token, group: groupView(group, player.id), ...(await profileOf(db, player)) }, 201);
}

async function login(request, db, now) {
  const body = await readBody(request);
  const code = String(body.groupCode ?? '').trim().toUpperCase();
  const name = String(body.name ?? '').trim();
  const pin = String(body.pin ?? '');
  const player = await db
    .prepare('SELECT * FROM players WHERE group_code = ? AND lower(name) = lower(?)')
    .bind(code, name)
    .first();
  const wrong = new HttpError(401, 'Name oder PIN stimmt nicht.');
  if (!player) throw wrong;
  if (player.locked_until > now) {
    throw new HttpError(429, `Zu viele Versuche. Bitte ${player.locked_until - now} Sekunden warten.`);
  }
  if ((await hashPin(player.salt, pin)) !== player.pin_hash) {
    const fails = player.fails + 1;
    if (fails >= MAX_FAILS) {
      await db.prepare('UPDATE players SET fails = 0, locked_until = ? WHERE id = ?').bind(now + LOCK_SECONDS, player.id).run();
    } else {
      await db.prepare('UPDATE players SET fails = ? WHERE id = ?').bind(fails, player.id).run();
    }
    throw wrong;
  }
  if (player.fails > 0) await db.prepare('UPDATE players SET fails = 0 WHERE id = ?').bind(player.id).run();
  const group = await db.prepare('SELECT * FROM groups WHERE code = ?').bind(code).first();
  const token = await startSession(db, player.id, now);
  return json({ token, group: groupView(group, player.id), ...(await profileOf(db, player)) });
}

// Wer ist schon in der Gruppe? Damit Kinder beim Anmelden einfach ihren Avatar antippen können.
async function groupInfo(db, code) {
  const group = await db.prepare('SELECT * FROM groups WHERE code = ?').bind(code.toUpperCase()).first();
  if (!group) throw new HttpError(404, 'Diese Gruppe gibt es nicht.');
  const { results } = await db
    .prepare('SELECT * FROM players WHERE group_code = ? ORDER BY name COLLATE NOCASE')
    .bind(group.code)
    .all();
  return json({
    group: { code: group.code, name: group.name },
    members: results.map((p) => ({ name: p.name, avatar: parseJson(p.avatar, DEFAULT_AVATAR), frame: p.frame })),
  });
}

// ---------- Spiele und Tipps ----------

function matchView(row, now) {
  const finished = row.status === 'FINISHED' && row.home_goals !== null && row.away_goals !== null;
  return {
    id: row.id,
    competition: row.competition,
    matchday: row.matchday,
    stage: row.stage,
    kickoff: row.kickoff,
    status: row.status,
    duration: row.duration,
    home: { name: row.home_name, tla: row.home_tla, crest: row.home_crest },
    away: { name: row.away_name, tla: row.away_tla, crest: row.away_crest },
    score: finished ? { home: row.home_goals, away: row.away_goals } : null,
    locked: row.kickoff <= now || !TIPPABLE.has(row.status),
  };
}

async function listMatches(url, db, player, now) {
  const clamp = (v, def, max) => Math.min(max, Math.max(0, Number.isFinite(Number(v)) && v !== null ? Number(v) : def));
  const back = clamp(url.searchParams.get('back'), 2, 14);
  const ahead = clamp(url.searchParams.get('ahead'), 10, 30);
  const from = startOfUtcDay(now) - back * DAY;
  const to = startOfUtcDay(now) + (ahead + 1) * DAY;
  const enabled = enabledCompetitions(await groupOf(db, player));
  const inList = enabled ? ` AND m.competition IN (${enabled.map(() => '?').join(',')})` : '';
  const { results } = await db
    .prepare(
      `SELECT m.*,
         (SELECT COUNT(*) FROM tips t WHERE t.match_id = m.id AND t.player_id = ?) AS my_tips,
         (SELECT COALESCE(SUM(t.points), 0) FROM tips t WHERE t.match_id = m.id AND t.player_id = ?) AS my_points
       FROM matches m WHERE m.kickoff >= ? AND m.kickoff < ?${inList}
       ORDER BY m.kickoff, m.id LIMIT 500`,
    )
    .bind(player.id, player.id, from, to, ...(enabled ?? []))
    .all();
  const { results: competitions } = await db
    .prepare(
      `SELECT c.code, c.name, c.emblem, c.area FROM competitions c
       WHERE c.code IN (SELECT DISTINCT competition FROM matches WHERE kickoff >= ? AND kickoff < ?)
       ${enabled ? `AND c.code IN (${enabled.map(() => '?').join(',')})` : ''}
       ORDER BY c.name`,
    )
    .bind(from, to, ...(enabled ?? []))
    .all();
  return json({
    now,
    competitions,
    matches: results.map((r) => ({ ...matchView(r, now), myTips: r.my_tips, myPoints: r.my_points })),
  });
}

async function myTipsFor(db, playerId, matchId) {
  const { results } = await db
    .prepare('SELECT market, pick, status, points, potential FROM tips WHERE player_id = ? AND match_id = ?')
    .bind(playerId, matchId)
    .all();
  return Object.fromEntries(results.map((t) => [t.market, { pick: t.pick, status: t.status, points: t.points, potential: t.potential }]));
}

async function matchDetail(id, db, player, now) {
  const row = await db
    .prepare(
      `SELECT m.*, c.name AS comp_name, c.emblem AS comp_emblem FROM matches m
       LEFT JOIN competitions c ON c.code = m.competition WHERE m.id = ?`,
    )
    .bind(id)
    .first();
  if (!row) throw new HttpError(404, 'Spiel nicht gefunden');
  await assertCompetitionOpen(db, player, row.competition);
  const match = { ...matchView(row, now), competitionName: row.comp_name, competitionEmblem: row.comp_emblem };

  const members = await db.prepare('SELECT COUNT(*) AS c FROM players WHERE group_code = ?').bind(player.group_code).first('c');
  const tippers = await db
    .prepare(
      `SELECT COUNT(DISTINCT t.player_id) AS c FROM tips t JOIN players p ON p.id = t.player_id
       WHERE t.match_id = ? AND p.group_code = ?`,
    )
    .bind(id, player.group_code)
    .first('c');

  // Die Tipps der anderen werden erst nach Tippschluss sichtbar, sonst könnte man abschreiben
  let others = null;
  if (match.locked) {
    const { results } = await db
      .prepare(
        `SELECT p.id, p.name, p.avatar, p.frame, t.market, t.pick, t.status, t.points
         FROM tips t JOIN players p ON p.id = t.player_id
         WHERE t.match_id = ? AND p.group_code = ? AND p.id != ? ORDER BY p.name COLLATE NOCASE`,
      )
      .bind(id, player.group_code, player.id)
      .all();
    const byPlayer = new Map();
    for (const t of results) {
      if (!byPlayer.has(t.id)) byPlayer.set(t.id, { ...publicPlayer({ ...t, title: 'rookie' }), tips: [] });
      byPlayer.get(t.id).tips.push({ market: t.market, pick: t.pick, status: t.status, points: t.points });
    }
    others = [...byPlayer.values()];
  }

  return json({
    match,
    markets: describeMarkets({ home_name: row.home_name, away_name: row.away_name }),
    myTips: await myTipsFor(db, player.id, id),
    group: { members, tippers, others },
  });
}

async function putTip(request, id, db, player, now) {
  const body = await readBody(request);
  const market = String(body.market ?? '');
  if (!marketById(market)) throw new HttpError(400, 'Unbekannter Tipp-Markt');
  const match = await db.prepare('SELECT id, competition, home_id, away_id, kickoff, status FROM matches WHERE id = ?').bind(id).first();
  if (!match) throw new HttpError(404, 'Spiel nicht gefunden');
  await assertCompetitionOpen(db, player, match.competition);
  if (match.kickoff <= now) throw new HttpError(403, 'Anpfiff war schon, Tippen ist nicht mehr möglich.');
  if (!TIPPABLE.has(match.status)) throw new HttpError(409, 'Dieses Spiel ist verschoben oder abgesagt.');

  if (body.pick === null) {
    await db
      .prepare('DELETE FROM tips WHERE player_id = ? AND match_id = ? AND market = ?')
      .bind(player.id, id, market)
      .run();
  } else {
    const pick = String(body.pick ?? '');
    if (!isValidPick(market, pick)) throw new HttpError(400, 'Ungültiger Tipp');
    // Pro Spiel zählt genau ein Tipp: ein Tipp in einem anderen Markt ersetzt den bisherigen
    await db.batch([
      db.prepare('DELETE FROM tips WHERE player_id = ? AND match_id = ? AND market != ?').bind(player.id, id, market),
      db
        .prepare(
          `INSERT INTO tips (player_id, match_id, market, pick, potential, created_at) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(player_id, match_id, market) DO UPDATE SET
             pick = excluded.pick, potential = excluded.potential, created_at = excluded.created_at`,
        )
        .bind(player.id, id, market, pick, pointsFor(market, pick), now),
    ]);
  }
  return json({ myTips: await myTipsFor(db, player.id, id) });
}

// ---------- Rangliste ----------

async function leaderboard(url, db, player, now) {
  const week = url.searchParams.get('period') === 'week';
  const d = new Date(now * 1000);
  const since = week ? startOfUtcDay(now) - ((d.getUTCDay() + 6) % 7) * DAY : 0;
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.avatar, p.frame, p.title,
         COALESCE(SUM(CASE WHEN t.status = 'won' THEN t.points END), 0) AS points,
         COUNT(CASE WHEN t.status IN ('won','lost') THEN 1 END) AS settled,
         COUNT(CASE WHEN t.status = 'won' THEN 1 END) AS won,
         COUNT(CASE WHEN t.status = 'won' AND t.market = 'exact' THEN 1 END) AS exact,
         COUNT(t.market) AS tips,
         (SELECT COALESCE(SUM(a.points), 0) FROM tips a WHERE a.player_id = p.id AND a.status = 'won') AS total_points
       FROM players p
       LEFT JOIN (SELECT t.* FROM tips t JOIN matches m ON m.id = t.match_id WHERE m.kickoff >= ?) t ON t.player_id = p.id
       WHERE p.group_code = ?
       GROUP BY p.id
       ORDER BY points DESC, exact DESC, won DESC, p.name COLLATE NOCASE`,
    )
    .bind(since, player.group_code)
    .all();
  let rank = 0;
  let prev = null;
  const rows = results.map((r, i) => {
    const key = `${r.points}|${r.exact}|${r.won}`;
    if (key !== prev) rank = i + 1;
    prev = key;
    return {
      rank,
      ...publicPlayer(r),
      points: r.points,
      settled: r.settled,
      won: r.won,
      exact: r.exact,
      tips: r.tips,
      hitRate: r.settled > 0 ? Math.round((r.won / r.settled) * 100) : null,
      level: levelFor(r.total_points).level,
      me: r.id === player.id,
    };
  });
  return json({ period: week ? 'week' : 'all', since: week ? since : null, rows });
}

// ---------- Profil und Shop ----------

async function updateProfile(request, db, player) {
  const body = await readBody(request);
  const owned = await ownedItems(db, player.id);
  const stats = await playerStats(db, player.id);
  const sets = [];
  const vals = [];

  if (body.avatar !== undefined) {
    const avatar = validateAvatar(body.avatar, owned);
    if (!avatar) throw new HttpError(400, 'Dieser Avatar enthält etwas, das du noch nicht besitzt.');
    sets.push('avatar = ?');
    vals.push(JSON.stringify(avatar));
  }
  if (body.frame !== undefined) {
    if (!validateFrame(body.frame, owned)) throw new HttpError(400, 'Diesen Rahmen besitzt du noch nicht.');
    sets.push('frame = ?');
    vals.push(body.frame);
  }
  if (body.title !== undefined) {
    if (!titleById(body.title) || !unlockedTitles(stats).includes(body.title)) {
      throw new HttpError(400, 'Diesen Titel hast du noch nicht freigeschaltet.');
    }
    sets.push('title = ?');
    vals.push(body.title);
  }
  if (sets.length) {
    await db.prepare(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, player.id).run();
  }
  const fresh = await db.prepare('SELECT * FROM players WHERE id = ?').bind(player.id).first();
  return json(await profileOf(db, fresh));
}

async function shop(db, player) {
  const profile = await profileOf(db, player);
  const owned = new Set(profile.owned);
  const catalog = Object.fromEntries(
    Object.entries(CATALOG).map(([group, list]) => [
      group,
      list.map((i) => ({ ...i, owned: i.price === 0 || owned.has(i.id) })),
    ]),
  );
  const titles = TITLES.map((t) => ({ id: t.id, name: t.name, need: t.need, unlocked: profile.titles.includes(t.id) }));
  return json({ coins: profile.coins, catalog, titles });
}

async function buy(request, db, player, now) {
  const body = await readBody(request);
  const item = itemById(String(body.item ?? ''));
  if (!item) throw new HttpError(404, 'Diesen Gegenstand gibt es nicht.');
  if (item.price === 0) throw new HttpError(400, 'Der ist gratis, du kannst ihn einfach benutzen.');
  const owned = await ownedItems(db, player.id);
  if (owned.has(item.id)) throw new HttpError(409, 'Den besitzt du schon.');
  const stats = await playerStats(db, player.id);
  // Bedingtes UPDATE: zieht nur ab, wenn das Guthaben wirklich reicht (auch bei parallelen Käufen)
  const res = await db
    .prepare('UPDATE players SET coins_spent = coins_spent + ?1 WHERE id = ?2 AND ?3 - coins_spent >= ?1')
    .bind(item.price, player.id, stats.points)
    .run();
  if (res.meta.changes !== 1) throw new HttpError(402, 'Dafür fehlen dir noch Münzen.');
  await db
    .prepare('INSERT OR IGNORE INTO inventory (player_id, item_id, acquired_at) VALUES (?, ?, ?)')
    .bind(player.id, item.id, now)
    .run();
  const fresh = await db.prepare('SELECT * FROM players WHERE id = ?').bind(player.id).first();
  return json(await profileOf(db, fresh));
}

// ---------- Router ----------

async function route(request, env, now) {
  const db = env.DB;
  const url = new URL(request.url);
  const { pathname: path } = url;
  const method = request.method;

  if (path === '/api/health' && method === 'GET') return json(await syncHealth(db, { tokenSet: Boolean(env.FOOTBALL_DATA_TOKEN) }));
  if (path === '/api/register' && method === 'POST') return register(request, db, now);
  if (path === '/api/login' && method === 'POST') return login(request, db, now);
  const g = /^\/api\/group\/([A-Za-z0-9]{6})$/.exec(path);
  if (g && method === 'GET') return groupInfo(db, g[1]);

  const player = await authenticate(request, db);
  if (!player) throw new HttpError(401, 'Bitte melde dich an.');

  if (path === '/api/me' && method === 'GET') {
    return json({ group: groupView(await groupOf(db, player), player.id), ...(await profileOf(db, player)) });
  }
  if (path === '/api/logout' && method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(bearer(request))).run();
    return json({ ok: true });
  }
  if (path === '/api/group/settings' && method === 'GET') return groupSettings(db, player, now);
  if (path === '/api/group/settings' && method === 'POST') return saveGroupSettings(request, db, player, now);
  if (path === '/api/matches' && method === 'GET') return listMatches(url, db, player, now);
  const m = /^\/api\/matches\/(\d+)$/.exec(path);
  if (m && method === 'GET') return matchDetail(Number(m[1]), db, player, now);
  const t = /^\/api\/matches\/(\d+)\/tips$/.exec(path);
  if (t && method === 'PUT') return putTip(request, Number(t[1]), db, player, now);
  if (path === '/api/leaderboard' && method === 'GET') return leaderboard(url, db, player, now);
  if (path === '/api/profile' && method === 'POST') return updateProfile(request, db, player);
  if (path === '/api/shop' && method === 'GET') return shop(db, player);
  if (path === '/api/shop/buy' && method === 'POST') return buy(request, db, player, now);

  throw new HttpError(404, 'Nicht gefunden');
}

export async function handleApi(request, env, now = Math.floor(Date.now() / 1000)) {
  try {
    return await route(request, env, now);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error('API-Fehler', err);
    return json({ error: 'Interner Fehler' }, 500);
  }
}
