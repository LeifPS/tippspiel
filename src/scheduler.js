// Planer für das API-Budget von football-data.org (Free-Tarif: 10 Aufrufe pro Minute).
//
// Kernidee: Der Sammelendpunkt /v4/matches liefert alle 12 Free-Wettbewerbe in EINEM Aufruf
// für einen Datumsbereich (max. 10 Tage). Statt 12 Einzelaufrufen pro Runde reicht also ein Aufruf
// pro Zeitfenster. Das Budget geht dadurch vor allem in Aktualität:
//   - Ergebnisfenster (gestern bis morgen): jede Minute, solange Spiele laufen oder gleich starten
//   - Horizont-Fenster (heute bis +27 Tage): in drei Stücken, nach hinten hin seltener
// Fällige Aufträge werden nach Dringlichkeit sortiert und nur im Rahmen des freien Budgets gestartet.

export const RATE = { perMinute: 10, reserve: 1 };

const DAY = 86400;
const STANDINGS_INTERVAL = 6 * 3600;

export const toIsoDay = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

// Ein Fenster darf höchstens 9 Tage Abstand haben (API-Maximum ist 10)
function windowJobs(now, activity) {
  const today = Math.floor(now / DAY) * DAY;
  const resultsInterval = activity.live > 0 ? 60 : activity.soon > 0 ? 600 : 3600;
  return [
    { key: 'win:results', interval: resultsInterval, from: today - DAY, to: today + DAY },
    { key: 'win:h0', interval: 1200, from: today, to: today + 9 * DAY },
    { key: 'win:h1', interval: 3 * 3600, from: today + 9 * DAY, to: today + 18 * DAY },
    { key: 'win:h2', interval: 6 * 3600, from: today + 18 * DAY, to: today + 27 * DAY },
  ];
}

export function availableBudget({ callsLastMinute, perMinute = RATE.perMinute, reserve = RATE.reserve }) {
  return Math.max(0, perMinute - reserve - callsLastMinute);
}

// lastRun: { [key]: unixSeconds }, activity: { live, soon }
export function planJobs({ now, lastRun, activity, budget, competitions = [] }) {
  if (budget <= 0) return [];
  const due = [];
  // Tabellenstände (Grundlage der Punkte) ändern sich langsam: alle 6 Stunden, nach den Spielfenstern
  for (const code of competitions) {
    const key = `st:${code}`;
    const last = lastRun[key] ?? 0;
    const age = now - last;
    if (age >= STANDINGS_INTERVAL) due.push({ key, code, urgency: last === 0 ? 1e9 : age / STANDINGS_INTERVAL });
  }
  for (const job of windowJobs(now, activity)) {
    const last = lastRun[job.key] ?? 0;
    const age = now - last;
    if (age >= job.interval) {
      due.push({
        key: job.key,
        dateFrom: toIsoDay(job.from),
        dateTo: toIsoDay(job.to),
        urgency: last === 0 ? Infinity : age / job.interval,
      });
    }
  }
  due.sort((a, b) => b.urgency - a.urgency);
  return due.slice(0, budget).map(({ key, dateFrom, dateTo, code }) => (code ? { key, code } : { key, dateFrom, dateTo }));
}
