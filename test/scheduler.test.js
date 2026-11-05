import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableBudget, planJobs, toIsoDay } from '../src/scheduler.js';

const NOW = Date.UTC(2026, 10, 5, 15, 30) / 1000; // 5. Nov 2026, 15:30 UTC

test('Budget: 10 pro Minute minus Reserve minus bereits genutzte Aufrufe', () => {
  assert.equal(availableBudget({ callsLastMinute: 0 }), 9);
  assert.equal(availableBudget({ callsLastMinute: 4 }), 5);
  assert.equal(availableBudget({ callsLastMinute: 12 }), 0);
});

test('Erster Start: alle vier Fenster sind fällig, höchstens so viele wie Budget', () => {
  const all = planJobs({ now: NOW, lastRun: {}, activity: { live: 0, soon: 0 }, budget: 9 });
  assert.equal(all.length, 4);
  const limited = planJobs({ now: NOW, lastRun: {}, activity: { live: 0, soon: 0 }, budget: 2 });
  assert.equal(limited.length, 2);
  assert.deepEqual(planJobs({ now: NOW, lastRun: {}, activity: { live: 0, soon: 0 }, budget: 0 }), []);
});

test('Fenster sind höchstens 9 Tage breit und decken 27 Tage ab', () => {
  const jobs = planJobs({ now: NOW, lastRun: {}, activity: { live: 0, soon: 0 }, budget: 9 });
  for (const j of jobs) {
    const span = (Date.parse(j.dateTo) - Date.parse(j.dateFrom)) / 86400000;
    assert.ok(span <= 9, `${j.key} ${span}`);
  }
  const h2 = jobs.find((j) => j.key === 'win:h2');
  assert.equal(h2.dateTo, '2026-12-02');
  assert.equal(jobs.find((j) => j.key === 'win:results').dateFrom, '2026-11-04');
});

test('Laufende Spiele: Ergebnisfenster jede Minute, sonst seltener', () => {
  const fresh = { 'win:results': NOW - 61, 'win:h0': NOW - 5, 'win:h1': NOW - 5, 'win:h2': NOW - 5 };
  const live = planJobs({ now: NOW, lastRun: fresh, activity: { live: 3, soon: 5 }, budget: 9 });
  assert.deepEqual(live.map((j) => j.key), ['win:results']);
  const quiet = planJobs({ now: NOW, lastRun: fresh, activity: { live: 0, soon: 0 }, budget: 9 });
  assert.deepEqual(quiet, []);
  const soon = planJobs({ now: NOW, lastRun: { ...fresh, 'win:results': NOW - 601 }, activity: { live: 0, soon: 2 }, budget: 9 });
  assert.deepEqual(soon.map((j) => j.key), ['win:results']);
});

test('Dringlichkeit: das am längsten überfällige Fenster kommt zuerst', () => {
  const lastRun = { 'win:results': NOW - 130, 'win:h0': NOW - 1300, 'win:h1': NOW - 5, 'win:h2': NOW - 5 };
  const jobs = planJobs({ now: NOW, lastRun, activity: { live: 1, soon: 1 }, budget: 1 });
  assert.equal(jobs[0].key, 'win:results'); // 130/60 > 1300/1200
});

test('toIsoDay', () => {
  assert.equal(toIsoDay(NOW), '2026-11-05');
});
