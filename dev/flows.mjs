// Ablauftests im echten Browser gegen den lokalen Testserver: Anmelden, Tippen, Speichern, Kaufen
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const t = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url)));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/fonts\.g|crest|Failed to load resource/.test(m.text()) && errors.push(m.text()));
const log = (s) => console.log('ok  ' + s);

// 1. Beitreten mit Code, Avatar antippen, PIN eingeben
await page.goto('http://localhost:8787/', { waitUntil: 'domcontentloaded' });
await page.click('text=Gruppe beitreten');
await page.fill('#code', t.code.toLowerCase());
await page.click('button:has-text("Weiter")');
await page.waitForSelector('.member:has-text("Mia")');
await page.screenshot({ path: `${out}/f1-mitglieder.png` });
await page.click('.member:has-text("Mia")');
for (const d of '9999') await page.click(`.pinpad button:text-is("${d}")`);
await page.waitForSelector('.error');
assert.match(await page.textContent('.error'), /PIN/);
log('falsche PIN wird abgelehnt');
for (const d of '4321') await page.click(`.pinpad button:text-is("${d}")`);
await page.waitForSelector('text=Spiele zum Tippen');
log('Anmeldung mit richtiger PIN');

// 2. Tippen: Spiel öffnen, Option wählen, wieder abwählen, Ergebnis speichern
await page.click('.fixture:has-text("Arsenal")');
await page.waitForSelector('.picks.three');
const draw = page.locator('.picks.three .pick', { hasText: 'Remis' });
await draw.click();
await page.waitForFunction(() => document.querySelector('.picks.three .pick[aria-pressed="true"]'));
await page.screenshot({ path: `${out}/f2-tipp.png` });
log('Tipp setzen markiert die Option');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.picks.three');
assert.equal(await page.locator('.picks.three .pick[aria-pressed="true"]').count(), 1);
log('Tipp bleibt nach Neuladen erhalten');
await page.locator('.picks.three .pick[aria-pressed="true"]').click();
await page.waitForFunction(() => !document.querySelector('.picks.three .pick[aria-pressed="true"]'));
log('Tipp lässt sich wieder abwählen');

await page.click('details.group:has(summary:has-text("Ergebnis")) summary');
await page.click('.led .col:first-child .step:first-child');
await page.click('.led-foot .btn:has-text("Speichern")');
await page.waitForSelector('.led-foot .info:has-text("Gespeichert")');
log('Genaues Ergebnis speichern');

// Pro Spiel zählt ein Tipp: ein Tipp in einem anderen Markt ersetzt das gespeicherte Ergebnis
await page.waitForSelector('.picks.three', { state: 'attached' });
if (!(await page.locator('.picks.three').isVisible())) await page.click('details.group:has(summary:has-text("Klassisch")) summary');
await page.locator('.picks.three .pick').first().click();
await page.waitForSelector('.tipnote:has-text("Dein Tipp: Spielausgang")');
assert.equal(await page.locator('.led-foot .info:has-text("Gespeichert")').count(), 0);
log('Ein Tipp pro Spiel: neuer Tipp ersetzt den alten');

// 3. Liste zeigt Tippzahl
await page.click('.back');
await page.waitForSelector('.fixture:has-text("Arsenal"):has-text("1 Tipp")');
log('Spieleliste zeigt die Zahl der Tipps');

// 4. Garderobe: Kauf ohne genug Münzen wird erklärt
await page.click('a.tab:has-text("Ich")');
assert.equal(await page.locator('.comp-settings').count(), 0);
log('Mitglieder sehen die Wettbewerbs-Einstellung nicht');
await page.click('button.chip:has-text("Zubehör")');
await page.click('.item:has-text("Krone")');
await page.waitForSelector('#toast.show');
assert.match(await page.textContent('#toast'), /fehlen noch/);
log('Zu teurer Kauf wird abgelehnt');
await page.click('button.chip:has-text("Titel")');
assert.equal(await page.locator('.titlerow:disabled').count() > 0, true);
await page.click('button.chip:has-text("Rahmen")');
await page.click('.item:has-text("Schlicht")');
await page.waitForSelector('.item:has-text("Schlicht")[aria-pressed="true"]');
log('Gratis-Rahmen anziehen');

// 5. Abmelden
await page.click('button:has-text("Abmelden")');
await page.waitForSelector('.member:has-text("Mia")'); // gemerkte Gruppe: direkt die Mitgliederliste
log('Abmelden');

// 6. Leif (mit Münzen): kaufen und anziehen
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
await ctx2.addInitScript((tok) => localStorage.setItem('tippspiel.token', tok), t.leif);
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errors.push(e.message));
await p2.goto('http://localhost:8787/#/ich', { waitUntil: 'domcontentloaded' });
await p2.click('button.chip:has-text("Zubehör")');
await p2.click('.item:has-text("Stirnband")');
await p2.waitForSelector('.sheet');
await p2.screenshot({ path: `${out}/f3-kaufen.png` });
await p2.click('.sheet .btn:has-text("kaufen")');
await p2.waitForSelector('.item:has-text("Stirnband")[aria-pressed="true"]');
assert.equal(await p2.textContent('.fact:nth-child(2) b'), '87'); // 127 Münzen minus 40 fürs Stirnband
log('Kauf mit Bestätigung');

// 7. Gründer stellt die Wettbewerbe ein: ohne Premier League verschwindet das Arsenal-Spiel
await p2.locator('.comp-settings').scrollIntoViewIfNeeded();
await p2.screenshot({ path: `${out}/f4-wettbewerbe.png` });
await p2.click('.comp-settings .titlerow:has-text("Premier League")');
await p2.click('.comp-settings .btn:has-text("Auswahl speichern")');
await p2.waitForFunction(() => /Gespeichert/.test(document.getElementById('toast')?.textContent ?? ''));
await p2.goto('http://localhost:8787/#/spiele', { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('.fixture:has-text("Leipzig")');
assert.equal(await p2.locator('.fixture:has-text("Arsenal")').count(), 0);
log('Gründer schaltet einen Wettbewerb ab, das Spiel verschwindet');
await p2.goto('http://localhost:8787/#/ich', { waitUntil: 'domcontentloaded' });
await p2.click('.comp-settings .titlerow:has-text("Premier League")');
await p2.click('.comp-settings .btn:has-text("Auswahl speichern")');
await p2.waitForFunction(() => /Gespeichert/.test(document.getElementById('toast')?.textContent ?? ''));
log('Wieder einschalten');

// 8. Ligatabellen
await p2.goto('http://localhost:8787/#/tabelle', { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('.league tbody tr:has-text("Bayern")');
await p2.screenshot({ path: `${out}/f5-tabelle.png` });
await p2.click('.chip:has-text("Premier League")');
await p2.waitForSelector('.league tbody tr:has-text("Arsenal")');
assert.equal(await p2.locator('.league tbody tr:has-text("Bayern")').count(), 0);
log('Tabellen: Wettbewerb wechseln');

// 9. Ausfälle zeigen eine Fehlermeldung statt ewig "Lädt …"
await p2.route('**/api/matches/5004', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ match: null, markets: null }) }));
await p2.goto('http://localhost:8787/#/spiel/5004', { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('.empty:has-text("Das hat nicht geklappt")');
assert.equal(await p2.locator('.empty button:has-text("Seite neu laden")').count(), 1);
log('Zeichenfehler: Fehlermeldung statt Dauer-Laden');
await p2.unroute('**/api/matches/5004');
await p2.route('**/api/matches/5004', (route) => route.abort());
await p2.reload({ waitUntil: 'domcontentloaded' });
await p2.waitForSelector('.empty:has-text("Keine Verbindung")');
log('Verbindungsfehler: Fehlermeldung mit erneutem Versuch');

await browser.close();
console.log(errors.length ? 'JS-FEHLER:\n' + errors.join('\n') : 'keine JS-Fehler');
