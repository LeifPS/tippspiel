// Screenshots der wichtigsten Ansichten (Handy-Format) gegen den lokalen Testserver
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const t = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url)));
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];

async function shot(name, { token, hash = '', full = true, actions } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/fonts\.g|crest|Failed to load resource/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  if (token) await ctx.addInitScript((tok) => localStorage.setItem('tippspiel.token', tok), token);
  await page.goto(`http://localhost:8787/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  if (actions) await actions(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  await ctx.close();
}

await shot('01-welcome', { full: false });
await shot('02-spiele', { token: t.leif, hash: '#/spiele' });
await shot('03-spiel-offen', { token: t.leif, hash: `#/spiel/${t.openMatch}`, actions: async (p) => { await p.click('details.group:nth-of-type(3) summary'); } });
await shot('04-spiel-beendet', { token: t.mia, hash: `#/spiel/${t.doneMatch}`, actions: async (p) => { for (const s of await p.$$('details.group:not([open]) summary')) await s.click(); } });
await shot('05-rangliste', { token: t.mia, hash: '#/rangliste', actions: async (p) => { await p.click('text=Gesamt'); await p.waitForTimeout(300); } });
await shot('06-ich', { token: t.leif, hash: '#/ich' });
await shot('07-ich-trikot', { token: t.leif, hash: '#/ich', actions: async (p) => { await p.click('button.chip:has-text("Trikot")'); } });
await shot('08-ich-rahmen', { token: t.leif, hash: '#/ich', actions: async (p) => { await p.click('button.chip:has-text("Rahmen")'); } });
await shot('09-ich-zubehoer', { token: t.leif, hash: '#/ich', actions: async (p) => { await p.click('button.chip:has-text("Zubehör")'); } });
await browser.close();
console.log(errors.length ? 'FEHLER:\n' + errors.join('\n') : 'keine JS-Fehler');
