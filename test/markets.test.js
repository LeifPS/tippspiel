import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, isValidPick, pointsFor, describeMarkets, MARKETS, EXACT_POINTS } from '../src/markets.js';

// Beispiel: Heim gewinnt 2:1 (3 Tore, beide treffen, Sieg mit 1 Tor Unterschied)
test('2:1 wird in allen Märkten richtig gewertet', () => {
  const ev = (m, p) => evaluate(m, p, 2, 1);
  assert.equal(ev('1x2', '1').won, true);
  assert.equal(ev('1x2', 'X').won, false);
  assert.equal(ev('dc', '1X').won, true);
  assert.equal(ev('dc', '12').won, true);
  assert.equal(ev('dc', 'X2').won, false);
  assert.equal(ev('hcp_home', 'H1').won, true);
  assert.equal(ev('hcp_home', 'H2').won, false);
  assert.equal(ev('hcp_away', 'A1').won, false);
  assert.equal(ev('ou15', 'O').won, true);
  assert.equal(ev('ou25', 'O').won, true);
  assert.equal(ev('ou35', 'U').won, true);
  assert.equal(ev('btts', 'Y').won, true);
  assert.equal(ev('win_ou25', '1O').won, true);
  assert.equal(ev('win_ou25', '1U').won, false);
  assert.deepEqual(ev('exact', '2:1'), { won: true, points: EXACT_POINTS.common });
  assert.equal(ev('exact', '1:2').won, false);
});

test('0:0 und Auswärtssieg', () => {
  assert.equal(evaluate('btts', 'N', 0, 0).won, true);
  assert.equal(evaluate('ou15', 'U', 0, 0).won, true);
  assert.equal(evaluate('win_ou25', 'XU', 0, 0).won, true);
  assert.equal(evaluate('exact', '0:0', 0, 0).points, EXACT_POINTS.rare);
  // 0:3 Auswärtssieg: Handicap Gast -1 mit 2+ Toren
  assert.equal(evaluate('hcp_away', 'A2', 0, 3).won, true);
  assert.equal(evaluate('dc', 'X2', 0, 3).won, true);
  assert.equal(evaluate('dc', '1X', 0, 3).won, false);
  assert.equal(evaluate('win_ou25', '2O', 0, 3).won, true);
});

test('Ungültige Tipps bringen keine Punkte', () => {
  assert.equal(isValidPick('1x2', 'Z'), false);
  assert.equal(isValidPick('nope', '1'), false);
  assert.equal(isValidPick('exact', '10:1'), false);
  assert.equal(isValidPick('exact', '3:3'), true);
  assert.deepEqual(evaluate('1x2', 'Z', 1, 0), { won: false, points: 0 });
});

test('Exakte Ergebnisse haben Seltenheitsstufen', () => {
  assert.equal(pointsFor('exact', '1:0'), EXACT_POINTS.common);
  assert.equal(pointsFor('exact', '3:1'), EXACT_POINTS.rare);
  assert.equal(pointsFor('exact', '5:4'), EXACT_POINTS.veryRare);
});

test('Pro Markt gewinnt höchstens eine Option (Doppelte Chance: zwei, Handicap: manchmal keine)', () => {
  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      for (const m of MARKETS) {
        const winners = m.wins(h, a);
        if (m.id === 'dc') assert.equal(winners.length, 2, `${m.id} ${h}:${a}`);
        else if (m.id.startsWith('hcp')) assert.ok(winners.length <= 1, `${m.id} ${h}:${a}`);
        else assert.equal(winners.length, 1, `${m.id} ${h}:${a}`);
        if (m.kind !== 'score') {
          for (const w of winners) assert.ok(m.options.some((o) => o.id === w), `${m.id} ${h}:${a} ${w}`);
        }
      }
    }
  }
});

test('Beschriftungen setzen die Teamnamen ein', () => {
  const d = describeMarkets({ home_name: 'Bayern', away_name: 'Dortmund' });
  const hcp = d.find((m) => m.id === 'hcp_home');
  assert.equal(hcp.label, 'Handicap Bayern −1');
  assert.equal(hcp.options[0].label, 'Bayern gewinnt mit 2+ Toren');
  assert.ok(!JSON.stringify(d).includes('{h}'));
  assert.ok(!JSON.stringify(d).includes('{a}'));
});

test('Heim und Gast bringen in jedem Markt gleich viele Punkte', () => {
  const pts = (m, id) => MARKETS.find((x) => x.id === m).options.find((o) => o.id === id).points;
  assert.equal(pts('1x2', '1'), pts('1x2', '2'));
  assert.equal(pts('hcp_home', 'H2'), pts('hcp_away', 'A2'));
  assert.equal(pts('hcp_home', 'H1'), pts('hcp_away', 'A1'));
  assert.equal(pts('dc', '1X'), pts('dc', 'X2'));
  assert.equal(pts('win_ou25', '1O'), pts('win_ou25', '2O'));
  assert.equal(pts('win_ou25', '1U'), pts('win_ou25', '2U'));
  assert.ok(pts('1x2', 'X') > pts('1x2', '1'), 'das seltenere Remis bringt mehr');
});

// Kein Tipp darf "nur besser" sein als ein anderer:
// - gewinnt ein Tipp A immer mit, sobald Tipp B gewinnt (B ist ein Teil von A), muss B mehr Punkte bringen als A
// - zwei Tipps mit genau demselben Ergebnis wären doppelt und dürfen nicht vorkommen
test('Kein Tipp ist strikt besser als ein anderer, und es gibt keine doppelten Tipps', () => {
  const G = 13;
  const opts = [];
  for (const m of MARKETS) {
    const list = m.kind === 'score'
      ? Array.from({ length: 100 }, (_, i) => ({ id: `${Math.floor(i / 10)}:${i % 10}`, label: `${Math.floor(i / 10)}:${i % 10}` }))
      : m.options;
    for (const o of list) {
      const set = new Set();
      for (let h = 0; h < G; h++) for (let a = 0; a < G; a++) if (m.wins(h, a).includes(o.id)) set.add(h * G + a);
      opts.push({ name: `${m.id}/${o.id}`, set, pts: pointsFor(m.id, o.id) });
    }
  }
  const subset = (x, y) => [...x].every((v) => y.has(v));
  for (let i = 0; i < opts.length; i++) {
    for (let j = 0; j < opts.length; j++) {
      if (i === j) continue;
      const a = opts[i];
      const b = opts[j];
      if (!subset(a.set, b.set)) continue; // a ist ein Teil von b: b gewinnt immer mit
      assert.ok(a.set.size !== b.set.size, `${a.name} und ${b.name} sind derselbe Tipp`);
      assert.ok(a.pts > b.pts, `${a.name} (${a.pts}) muss mehr bringen als ${b.name} (${b.pts})`);
    }
  }
});
