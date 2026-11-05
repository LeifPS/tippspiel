// Punkte nach Teamstärke: aus dem Tabellenstand werden erwartete Tore für beide Teams geschätzt,
// daraus die Wahrscheinlichkeit jeder Tipp-Option berechnet. Punkte = 1 / Wahrscheinlichkeit (gerundet):
// Favoriten bringen wenig, Außenseiter viel, und jede Option ist im Schnitt gleich viel wert.
import { MARKETS } from './markets.js';

const MAX_GOALS = 10;
const PRIOR_GAMES = 6; // so viele "durchschnittliche" Spiele zählen als Vorwissen mit
const HOME_BOOST = 1.12;
const AWAY_BOOST = 0.9;
const OPTION_CAP = 30;
const EXACT_CAP = 60;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// team: { played, goals_for, goals_against }, mu: Tore pro Team und Spiel im Wettbewerb
export function expectedGoals(home, away, mu) {
  const att = (t) => (t.goals_for + PRIOR_GAMES * mu) / ((t.played + PRIOR_GAMES) * mu);
  const def = (t) => (t.goals_against + PRIOR_GAMES * mu) / ((t.played + PRIOR_GAMES) * mu);
  return {
    home: clamp(mu * HOME_BOOST * att(home) * def(away), 0.3, 4),
    away: clamp(mu * AWAY_BOOST * att(away) * def(home), 0.3, 4),
  };
}

function poisson(lambda) {
  const p = [Math.exp(-lambda)];
  for (let k = 1; k <= MAX_GOALS; k++) p.push((p[k - 1] * lambda) / k);
  return p;
}

// Wahrscheinlichkeit jedes Endstands 0:0 bis 10:10 (unabhängige Poisson-Tore, normiert)
export function scoreMatrix(lambdaHome, lambdaAway) {
  const ph = poisson(lambdaHome);
  const pa = poisson(lambdaAway);
  let sum = 0;
  const m = ph.map((a) => pa.map((b) => { sum += a * b; return a * b; }));
  return m.map((row) => row.map((v) => v / sum));
}

const toPoints = (p, cap) => clamp(Math.round(1 / Math.max(p, 1e-9)), 1, cap);

// Gibt { options: { [markt]: { [option]: punkte } }, exact: { 'h:a': punkte } } zurück
export function buildOdds(lambdaHome, lambdaAway) {
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  const options = {};
  for (const mk of MARKETS) {
    if (mk.kind === 'score') continue;
    const probs = Object.fromEntries(mk.options.map((o) => [o.id, 0]));
    for (let h = 0; h <= MAX_GOALS; h++) {
      for (let a = 0; a <= MAX_GOALS; a++) {
        for (const id of mk.wins(h, a)) if (id in probs) probs[id] += matrix[h][a];
      }
    }
    options[mk.id] = Object.fromEntries(Object.entries(probs).map(([id, p]) => [id, toPoints(p, OPTION_CAP)]));
  }
  const exact = {};
  for (let h = 0; h <= 9; h++) for (let a = 0; a <= 9; a++) exact[`${h}:${a}`] = toPoints(matrix[h][a], EXACT_CAP);
  return { options, exact };
}

// Liest den Tabellenstand beider Teams. Null, wenn dafür keine Daten da sind (dann gelten die festen Punkte).
export async function loadOdds(db, match) {
  const { results } = await db
    .prepare('SELECT team_id, played, goals_for, goals_against FROM standings WHERE comp = ? AND team_id IN (?, ?)')
    .bind(match.competition, match.home_id, match.away_id)
    .all();
  const home = results.find((r) => r.team_id === match.home_id);
  const away = results.find((r) => r.team_id === match.away_id);
  if (!home || !away) return null;
  const lg = await db
    .prepare('SELECT SUM(goals_for) AS gf, SUM(played) AS pl FROM standings WHERE comp = ?')
    .bind(match.competition)
    .first();
  if (!lg?.pl || !lg.gf) return null;
  const mu = lg.gf / lg.pl;
  const lambda = expectedGoals(home, away, mu);
  return buildOdds(lambda.home, lambda.away);
}
