import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOdds, expectedGoals, loadOdds, scoreMatrix } from '../src/odds.js';
import { describeMarkets, pointsFor } from '../src/markets.js';
import { upsertStandings } from '../src/sync.js';
import { makeD1 } from './helpers/d1.js';

const MU = 1.4;
const strong = { played: 12, goals_for: 33, goals_against: 9 };
const weak = { played: 12, goals_for: 9, goals_against: 30 };
const average = { played: 12, goals_for: 17, goals_against: 17 };

test('Wahrscheinlichkeiten ergeben zusammen 1', () => {
  const m = scoreMatrix(1.6, 1.1);
  const total = m.flat().reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('Favorit bringt weniger Punkte als der Außenseiter', () => {
  const l = expectedGoals(strong, weak, MU);
  const o = buildOdds(l.home, l.away);
  assert.ok(o.options['1x2']['1'] < o.options['1x2']['2'], 'Sieg des Favoriten bringt weniger');
  assert.ok(o.options['1x2']['1'] <= 2);
  assert.ok(o.options['1x2']['2'] >= 8);
  // Umgekehrt: der Heimklub ist der Außenseiter
  const l2 = expectedGoals(weak, strong, MU);
  const o2 = buildOdds(l2.home, l2.away);
  assert.ok(o2.options['1x2']['1'] > o2.options['1x2']['2']);
});

test('Ausgeglichene Teams: Heimsieg bringt etwas weniger als Auswärtssieg, Remis am meisten', () => {
  const l = expectedGoals(average, average, MU);
  const o = buildOdds(l.home, l.away);
  assert.ok(o.options['1x2']['1'] <= o.options['1x2']['2']);
  assert.ok(o.options['1x2']['X'] >= o.options['1x2']['1']);
  assert.ok(o.options['1x2']['1'] >= 2 && o.options['1x2']['1'] <= 3);
});

test('Punkte sind fair: die Kehrwerte aller Optionen eines Markts ergeben etwa 1', () => {
  const l = expectedGoals(strong, average, MU);
  const o = buildOdds(l.home, l.away);
  const sum = Object.values(o.options['1x2']).reduce((a, p) => a + 1 / p, 0);
  assert.ok(sum > 0.8 && sum < 1.25, `Summe ${sum}`);
  assert.ok(o.exact['1:1'] > o.options['1x2']['X']);
  assert.ok(o.exact['9:9'] <= 60);
});

test('pointsFor und describeMarkets nutzen die berechneten Punkte, sonst die festen', () => {
  const l = expectedGoals(strong, weak, MU);
  const odds = buildOdds(l.home, l.away);
  assert.equal(pointsFor('1x2', '2', odds), odds.options['1x2']['2']);
  assert.equal(pointsFor('1x2', '2'), 3);
  assert.equal(pointsFor('exact', '2:0', odds), odds.exact['2:0']);
  const mk = describeMarkets({ home_name: 'A', away_name: 'B' }, odds).find((x) => x.id === '1x2');
  assert.equal(mk.options.find((o) => o.id === '2').points, odds.options['1x2']['2']);
  const fixed = describeMarkets({ home_name: 'A', away_name: 'B' }).find((x) => x.id === 'exact');
  assert.equal(fixed.exactTable['1:0'], 9);
});

test('loadOdds liest den Tabellenstand, ohne Daten gibt es null', async () => {
  const db = makeD1();
  const match = { competition: 'BL1', home_id: 1, away_id: 2 };
  assert.equal(await loadOdds(db, match), null);
  await upsertStandings(db, 'BL1', [
    { team_id: 1, ...strong, points: 30 },
    { team_id: 2, ...weak, points: 8 },
    { team_id: 3, ...average, points: 18 },
  ]);
  const odds = await loadOdds(db, match);
  assert.ok(odds.options['1x2']['1'] < odds.options['1x2']['2']);
  assert.equal(await loadOdds(db, { ...match, away_id: 99 }), null);
});
