# Tippspiel

Familien-Tippspiel für die 12 kostenlosen Wettbewerbe von football-data.org (Bundesliga, Premier League, La Liga,
Serie A, Ligue 1, Eredivisie, Primeira Liga, Championship, Serie A Brasilien, Champions League, EM, WM).
Jeder tippt auf dem eigenen Handy, es gibt eine gemeinsame Rangliste, Münzen, Avatare, Rahmen und Titel.

## Aufbau

- `public/` Oberfläche (reines HTML, CSS und JavaScript, keine Build-Stufe)
- `src/api.js` Konto (Name und PIN), Spiele, Tipps mit Tippschluss, Rangliste, Profil, Shop
- `src/markets.js` alle Tippmärkte mit ihren Punkten und der Wertung
- `src/scheduler.js` verteilt das API-Budget von 10 Aufrufen pro Minute
- `src/sync.js` holt Spiele, schreibt sie in D1 und wertet Tipps aus
- `migrations/` Datenbankschema (Cloudflare D1)
- `dev/server.mjs` lokaler Testserver mit Beispieldaten, `dev/shots.mjs` und `dev/flows.mjs` Browser-Prüfungen

## Tippmärkte (alle nach 90 Minuten)

| Markt | Optionen (Punkte) |
| --- | --- |
| Spielausgang | Heim 2, Remis 4, Gast 3 |
| Doppelte Chance | Heim/Remis 1, Heim/Gast 1, Remis/Gast 2 |
| Handicap Heim −1 | 2+ Tore Vorsprung 4, genau 1 Tor 4, gewinnt nicht 2 |
| Handicap Gast −1 | 2+ Tore Vorsprung 5, genau 1 Tor 4, gewinnt nicht 1 |
| Über/Unter 1,5 | Über 1, Unter 4 |
| Über/Unter 2,5 | Über 2, Unter 2 |
| Über/Unter 3,5 | Über 3, Unter 1 |
| Treffen beide Teams | Ja 2, Nein 2 |
| Sieger & Über/Unter 2,5 | zwischen 4 und 8 Punkte |
| Genaues Ergebnis | häufige Ergebnisse 9, seltene 13, sehr seltene 20 |

Die Zahlen stehen in `src/markets.js` und lassen sich dort ändern. Verlängerung und Elfmeterschießen zählen nicht;
liefert die API die reguläre Spielzeit nicht getrennt, werden die Tipps dieses Spiels nicht gewertet (ohne Punkteabzug).

## API-Budget (10 Aufrufe pro Minute)

Der Sammelendpunkt `/v4/matches` liefert alle 12 Wettbewerbe in einem Aufruf für bis zu 10 Tage.
Pro Minute läuft ein Cron, der nach Dringlichkeit entscheidet:

- Ergebnisfenster (gestern bis morgen): jede Minute, solange Spiele laufen; sonst alle 10 oder 60 Minuten
- Horizont: heute bis +9 Tage alle 20 Minuten, danach +9 bis +18 alle 3 Stunden, +18 bis +27 alle 6 Stunden
- höchstens 9 von 10 Aufrufen pro Minute (1 Reserve), gezählt über ein gleitendes 60-Sekunden-Fenster
- bei HTTP 429 wird bis zum Ablauf des Limits pausiert

Der Free-Tarif liefert Scores verzögert und ohne Live-Daten. Wertungen kommen deshalb ein paar Minuten nach Abpfiff.

## Einrichtung

1. Repo mit Cloudflare verbinden (Workers & Pages, Create, Import a repository). Die Datenbank `tippspiel` ist in `wrangler.toml` eingetragen.
2. Secret setzen: `npx wrangler secret put FOOTBALL_DATA_TOKEN --name tippspiel`
3. Nach dem ersten Deploy ist die Seite unter `https://tippspiel.<dein-account>.workers.dev` erreichbar.
   Nach spätestens ein bis zwei Minuten stehen die ersten Spiele da (`/api/health` zeigt den Stand).

Neue Migrationen werden mit `npx wrangler d1 execute tippspiel --remote --file migrations/000X_name.sql` eingespielt.

## Lokal ausprobieren

```
npm test                                  # Logik-Tests (Märkte, Scheduler, Sync, API)
node --no-warnings dev/server.mjs         # Testserver auf http://localhost:8787 mit Beispieldaten
```
