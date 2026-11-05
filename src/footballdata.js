// Client und Normalisierung für football-data.org (API v4)

const BASE = 'https://api.football-data.org/v4';

export async function fetchMatches(token, { dateFrom, dateTo }, fetchImpl = fetch) {
  const url = `${BASE}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const res = await fetchImpl(url, { headers: { 'X-Auth-Token': token } });
  const available = Number(res.headers.get('X-Requests-Available-Minute'));
  if (res.status === 429) {
    const wait = Number(res.headers.get('X-RequestCounter-Reset'));
    return { ok: false, rateLimited: true, retryAfter: Number.isFinite(wait) && wait > 0 ? wait : 60 };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
  }
  const json = await res.json();
  return {
    ok: true,
    matches: Array.isArray(json.matches) ? json.matches : [],
    available: Number.isFinite(available) ? available : null,
  };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pair = (p) => (p && num(p.home) !== null && num(p.away) !== null ? { home: p.home, away: p.away } : null);

// Tore nach 90 Minuten. Null, wenn sie sich nicht sicher bestimmen lassen
// (z. B. Verlängerung/Elfmeterschießen ohne getrennte Angabe der regulären Spielzeit).
export function regularTimeGoals(score) {
  if (!score) return null;
  const regular = pair(score.regularTime);
  if (regular) return regular;
  if (score.duration === 'REGULAR' || score.duration == null) return pair(score.fullTime);
  return null;
}

export function normalizeMatch(m, now = Math.floor(Date.now() / 1000)) {
  if (!m?.id || !m.homeTeam?.id || !m.awayTeam?.id || !m.utcDate) return null;
  const kickoff = Math.floor(Date.parse(m.utcDate) / 1000);
  if (!Number.isFinite(kickoff)) return null;
  const goals = m.status === 'FINISHED' ? regularTimeGoals(m.score) : null;
  return {
    competition: {
      code: m.competition?.code ?? String(m.competition?.id ?? '?'),
      name: m.competition?.name ?? 'Wettbewerb',
      emblem: m.competition?.emblem ?? null,
      area: m.area?.name ?? null,
    },
    match: {
      id: m.id,
      competition: m.competition?.code ?? String(m.competition?.id ?? '?'),
      matchday: num(m.matchday),
      stage: m.stage ?? null,
      kickoff,
      status: m.status ?? 'SCHEDULED',
      home_id: m.homeTeam.id,
      home_name: m.homeTeam.shortName || m.homeTeam.name,
      home_tla: m.homeTeam.tla ?? null,
      home_crest: m.homeTeam.crest ?? null,
      away_id: m.awayTeam.id,
      away_name: m.awayTeam.shortName || m.awayTeam.name,
      away_tla: m.awayTeam.tla ?? null,
      away_crest: m.awayTeam.crest ?? null,
      duration: m.score?.duration ?? null,
      home_goals: goals?.home ?? null,
      away_goals: goals?.away ?? null,
      updated_at: now,
    },
  };
}
