// Holt Spieldaten von football-data.org, schreibt sie in D1 und wertet Tipps aus.
import { fetchMatches as defaultFetch, fetchStandings as defaultStandings, normalizeMatch } from './footballdata.js';
import { availableBudget, planJobs, RATE } from './scheduler.js';
import { evaluate } from './markets.js';

const nowSec = () => Math.floor(Date.now() / 1000);

async function setState(db, key, lastRun, value = null) {
  await db
    .prepare(
      `INSERT INTO sync_state (key, last_run, value) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET last_run = excluded.last_run, value = excluded.value`,
    )
    .bind(key, lastRun, value)
    .run();
}

async function loadState(db) {
  const { results } = await db.prepare('SELECT key, last_run, value FROM sync_state').all();
  const state = {};
  for (const r of results) state[r.key] = { lastRun: r.last_run, value: r.value };
  return state;
}

// Wie "heiß" ist der Spielplan gerade? Steuert, wie oft das Ergebnisfenster aktualisiert wird.
export async function loadActivity(db, now) {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kickoff <= ? AND kickoff >= ?
                           AND status NOT IN ('FINISHED','AWARDED','CANCELLED','POSTPONED') THEN 1 ELSE 0 END), 0) AS live,
         COALESCE(SUM(CASE WHEN kickoff > ? AND kickoff <= ? THEN 1 ELSE 0 END), 0) AS soon
       FROM matches`,
    )
    .bind(now + 600, now - 6 * 3600, now, now + 86400)
    .first();
  return { live: row?.live ?? 0, soon: row?.soon ?? 0 };
}

// Schreibt nur geänderte Zeilen (schont das Schreib-Kontingent von D1)
const MATCH_UPSERT = `
INSERT INTO matches (id, competition, matchday, stage, kickoff, status,
  home_id, home_name, home_tla, home_crest, away_id, away_name, away_tla, away_crest,
  duration, home_goals, away_goals, updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  competition = excluded.competition, matchday = excluded.matchday, stage = excluded.stage,
  kickoff = excluded.kickoff, status = excluded.status,
  home_name = excluded.home_name, home_tla = excluded.home_tla, home_crest = excluded.home_crest,
  away_name = excluded.away_name, away_tla = excluded.away_tla, away_crest = excluded.away_crest,
  duration = excluded.duration, home_goals = excluded.home_goals, away_goals = excluded.away_goals,
  updated_at = excluded.updated_at
WHERE matches.competition IS NOT excluded.competition OR matches.matchday IS NOT excluded.matchday
  OR matches.stage IS NOT excluded.stage OR matches.kickoff IS NOT excluded.kickoff
  OR matches.status IS NOT excluded.status OR matches.home_name IS NOT excluded.home_name
  OR matches.home_crest IS NOT excluded.home_crest OR matches.away_name IS NOT excluded.away_name
  OR matches.away_crest IS NOT excluded.away_crest OR matches.duration IS NOT excluded.duration
  OR matches.home_goals IS NOT excluded.home_goals OR matches.away_goals IS NOT excluded.away_goals`;

const COMPETITION_UPSERT = `
INSERT INTO competitions (code, name, emblem, area) VALUES (?,?,?,?)
ON CONFLICT(code) DO UPDATE SET name = excluded.name, emblem = excluded.emblem, area = excluded.area
WHERE competitions.name IS NOT excluded.name OR competitions.emblem IS NOT excluded.emblem
  OR competitions.area IS NOT excluded.area`;

export async function upsertStandings(db, comp, rows) {
  const stmts = rows.map((r) =>
    db
      .prepare(
        `INSERT INTO standings (comp, team_id, played, goals_for, goals_against, points) VALUES (?,?,?,?,?,?)
         ON CONFLICT(comp, team_id) DO UPDATE SET played = excluded.played, goals_for = excluded.goals_for,
           goals_against = excluded.goals_against, points = excluded.points
         WHERE standings.played IS NOT excluded.played OR standings.goals_for IS NOT excluded.goals_for
           OR standings.goals_against IS NOT excluded.goals_against OR standings.points IS NOT excluded.points`,
      )
      .bind(comp, r.team_id, r.played, r.goals_for, r.goals_against, r.points),
  );
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
}

export async function upsertMatches(db, rawMatches, now) {
  const comps = new Map();
  const statements = [];
  let accepted = 0;
  for (const raw of rawMatches) {
    const n = normalizeMatch(raw, now);
    if (!n) continue; // z. B. K.-o.-Spiele, deren Paarung noch offen ist
    accepted++;
    comps.set(n.competition.code, n.competition);
    const m = n.match;
    statements.push(
      db
        .prepare(MATCH_UPSERT)
        .bind(
          m.id, m.competition, m.matchday, m.stage, m.kickoff, m.status,
          m.home_id, m.home_name, m.home_tla, m.home_crest,
          m.away_id, m.away_name, m.away_tla, m.away_crest,
          m.duration, m.home_goals, m.away_goals, m.updated_at,
        ),
    );
  }
  const compStatements = [...comps.values()].map((c) =>
    db.prepare(COMPETITION_UPSERT).bind(c.code, c.name, c.emblem, c.area),
  );
  const all = [...compStatements, ...statements];
  for (let i = 0; i < all.length; i += 50) await db.batch(all.slice(i, i + 50));
  return accepted;
}

const SETTLE_KEY_SQL = `CASE WHEN status = 'FINISHED' AND home_goals IS NOT NULL AND away_goals IS NOT NULL
  THEN 'F:' || home_goals || ':' || away_goals ELSE 'V' END`;

// Wertet alle Spiele aus, deren Endstand sich seit der letzten Wertung geändert hat.
// Nachträgliche Korrekturen der API werden dadurch automatisch neu gewertet.
export async function settleMatches(db) {
  const { results: pending } = await db
    .prepare(
      `SELECT id, status, home_goals, away_goals FROM matches
       WHERE status IN ('FINISHED','AWARDED','CANCELLED')
         AND (settled_key IS NULL OR settled_key != ${SETTLE_KEY_SQL})`,
    )
    .all();

  let settled = 0;
  for (const m of pending) {
    const hasResult = m.status === 'FINISHED' && m.home_goals !== null && m.away_goals !== null;
    const key = hasResult ? `F:${m.home_goals}:${m.away_goals}` : 'V';
    const { results: tips } = await db
      .prepare('SELECT player_id, market, pick, potential FROM tips WHERE match_id = ?')
      .bind(m.id)
      .all();
    const updates = tips.map((t) => {
      let status = 'void';
      let points = 0;
      if (hasResult) {
        const r = evaluate(t.market, t.pick, m.home_goals, m.away_goals);
        status = r.won ? 'won' : 'lost';
        // Es zählen die Punkte, die beim Tippen angezeigt wurden (potential)
        points = r.won ? (t.potential ?? r.points) : 0;
      }
      return db
        .prepare('UPDATE tips SET status = ?, points = ? WHERE player_id = ? AND match_id = ? AND market = ?')
        .bind(status, points, t.player_id, m.id, t.market);
    });
    updates.push(db.prepare('UPDATE matches SET settled_key = ? WHERE id = ?').bind(key, m.id));
    for (let i = 0; i < updates.length; i += 50) await db.batch(updates.slice(i, i + 50));
    settled++;
  }
  return settled;
}

export async function runSync(env, now = nowSec(), deps = {}) {
  const db = env.DB;
  const doFetch = deps.fetchMatches ?? defaultFetch;
  if (!env.FOOTBALL_DATA_TOKEN) {
    await setState(db, 'sync:heartbeat', now, 'kein Token');
    return { skipped: 'kein API-Token gesetzt' };
  }
  await setState(db, 'sync:heartbeat', now, 'ok');

  const state = await loadState(db);
  const blockedUntil = Number(state['api:blocked']?.value ?? 0);
  if (blockedUntil > now) return { skipped: 'API-Limit erreicht, warte', until: blockedUntil };

  const calls = await db.prepare('SELECT COUNT(*) AS c FROM api_calls WHERE ts > ?').bind(now - 60).first();
  const budget = availableBudget({ callsLastMinute: calls?.c ?? 0 });

  const lastRun = Object.fromEntries(Object.entries(state).map(([k, v]) => [k, v.lastRun]));
  const activity = await loadActivity(db, now);
  const { results: comps } = await db.prepare('SELECT code FROM competitions').all();
  const jobs = planJobs({ now, lastRun, activity, budget, competitions: comps.map((c) => c.code) });

  const report = { budget, activity, jobs: [], settled: 0 };
  for (const job of jobs) {
    await db.prepare('INSERT INTO api_calls (ts) VALUES (?)').bind(now).run();
    const res = job.code
      ? await (deps.fetchStandings ?? defaultStandings)(env.FOOTBALL_DATA_TOKEN, job.code)
      : await doFetch(env.FOOTBALL_DATA_TOKEN, job);
    if (res.rateLimited) {
      await setState(db, 'api:blocked', now, String(now + res.retryAfter + 2));
      report.jobs.push({ key: job.key, rateLimited: true });
      break;
    }
    if (!res.ok) {
      await setState(db, 'api:last_error', now, `${job.key}: HTTP ${res.status} ${res.error ?? ''}`.trim());
      await setState(db, job.key, now, 'error');
      report.jobs.push({ key: job.key, error: res.status });
      continue;
    }
    if (job.code) {
      await upsertStandings(db, job.code, res.rows);
      await setState(db, job.key, now, String(res.rows.length));
      report.jobs.push({ key: job.key, rows: res.rows.length });
      if (res.available !== null && res.available <= RATE.reserve) break;
      continue;
    }
    const accepted = await upsertMatches(db, res.matches, now);
    await setState(db, job.key, now, String(accepted));
    report.jobs.push({ key: job.key, received: res.matches.length, accepted });
    if (res.available !== null && res.available <= RATE.reserve) break; // API meldet: Minutenbudget fast leer
  }

  report.settled = await settleMatches(db);
  await db.prepare('DELETE FROM api_calls WHERE ts < ?').bind(now - 3600).run();
  return report;
}

export async function syncHealth(db, { tokenSet = null } = {}) {
  const state = await loadState(db);
  const counts = await db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN settled_key IS NULL AND status != 'FINISHED' THEN 1 ELSE 0 END),0) AS open_matches
       FROM matches`,
    )
    .first();
  return {
    matches: counts?.total ?? 0,
    tokenSet,
    heartbeat: state['sync:heartbeat'] ? { at: state['sync:heartbeat'].lastRun, status: state['sync:heartbeat'].value } : null,
    lastRuns: Object.fromEntries(
      Object.entries(state)
        .filter(([k]) => k.startsWith('win:'))
        .map(([k, v]) => [k, v.lastRun]),
    ),
    lastError: state['api:last_error']?.value ?? null,
    blockedUntil: Number(state['api:blocked']?.value ?? 0) || null,
  };
}
