// Kosmetik-Katalog (Avatare, Outfits, Rahmen) und Titel. Die Grafiken selbst zeichnet das Frontend per SVG;
// der Server kennt nur IDs, Namen und Preise und prüft, was jemand tragen darf.

const free = (id, name) => ({ id, name, price: 0 });
const paid = (id, name, price) => ({ id, name, price });

export const CATALOG = {
  skin: [
    free('s1', 'Porzellan'), free('s2', 'Sand'), free('s3', 'Honig'),
    free('s4', 'Bronze'), free('s5', 'Kaffee'), free('s6', 'Ebenholz'),
  ],
  hair: [
    free('h0', 'Glatze'), free('h1', 'Kurz'), free('h2', 'Locken'), free('h3', 'Pferdeschwanz'),
    paid('h4', 'Undercut', 60), paid('h5', 'Zopf', 60), paid('h6', 'Afro', 90),
    paid('h7', 'Irokese', 140), paid('h8', 'Langhaar', 90), paid('h9', 'Dutt', 80),
  ],
  hairColor: [
    free('c1', 'Schwarz'), free('c2', 'Braun'), free('c3', 'Dunkelblond'), free('c4', 'Blond'),
    free('c5', 'Rot'), free('c6', 'Grau'), paid('c7', 'Blau', 40), paid('c8', 'Pink', 40),
  ],
  eyes: [free('e1', 'Freundlich'), free('e2', 'Entschlossen'), free('e3', 'Verschmitzt'), free('e4', 'Staunend')],
  mouth: [free('m1', 'Lächeln'), free('m2', 'Grinsen'), free('m3', 'Neutral'), free('m4', 'Staunen')],
  outfit: [
    free('o1', 'Heimtrikot Rot'), free('o2', 'Auswärts Weiß'), free('o3', 'Blau-Weiß gestreift'),
    paid('o4', 'Gelb-Schwarz', 80), paid('o5', 'Schwarz-Gold', 150), paid('o6', 'Grün gestreift', 80),
    paid('o7', 'Himmelblau', 100), paid('o8', 'Orange', 100), paid('o9', 'Retro-Karo', 200),
    paid('o10', 'Goldene Legende', 400),
  ],
  accessory: [
    free('a0', 'Keine'), paid('a1', 'Stirnband', 40), paid('a2', 'Brille', 60), paid('a3', 'Sonnenbrille', 100),
    paid('a4', 'Kappe', 120), paid('a5', 'Kapitänsbinde', 150), paid('a6', 'Kopfhörer', 180), paid('a7', 'Krone', 500),
  ],
  bg: [
    free('b1', 'Rasen'), free('b2', 'Nacht'), free('b3', 'Dämmerung'), paid('b4', 'Stadion', 50),
    paid('b5', 'Sonnenuntergang', 80), paid('b6', 'Flutlicht', 120), paid('b7', 'Gold', 250), paid('b8', 'Nordlicht', 300),
  ],
  frame: [
    free('f0', 'Kein Rahmen'), free('f1', 'Schlicht'), paid('f2', 'Bronze', 80), paid('f3', 'Silber', 200),
    paid('f4', 'Gold', 400), paid('f5', 'Rasen', 150), paid('f6', 'Flammen', 600), paid('f7', 'Diamant', 1000),
  ],
};

export const AVATAR_KEYS = ['skin', 'hair', 'hairColor', 'eyes', 'mouth', 'outfit', 'accessory', 'bg'];

export const DEFAULT_AVATAR = {
  skin: 's2', hair: 'h1', hairColor: 'c2', eyes: 'e1', mouth: 'm1', outfit: 'o1', accessory: 'a0', bg: 'b1',
};

const ITEMS = new Map();
for (const [group, list] of Object.entries(CATALOG)) {
  for (const item of list) ITEMS.set(item.id, { ...item, group });
}
export const itemById = (id) => ITEMS.get(id) ?? null;

// Titel schaltet man durch Leistung frei, man kauft sie nicht
export const TITLES = [
  { id: 'rookie', name: 'Neuling', need: 'Von Anfang an dabei', test: () => true },
  { id: 'tipper', name: 'Tipper', need: '10 gewertete Tipps', test: (s) => s.settled >= 10 },
  { id: 'regular', name: 'Stammtipper', need: '100 Punkte', test: (s) => s.points >= 100 },
  { id: 'sniper', name: 'Scharfschütze', need: '3 genaue Ergebnisse', test: (s) => s.exact >= 3 },
  { id: 'kenner', name: 'Fußballkenner', need: '50 richtige Tipps', test: (s) => s.won >= 50 },
  { id: 'orakel', name: 'Orakel', need: '500 Punkte', test: (s) => s.points >= 500 },
  { id: 'maestro', name: 'Ergebnis-Meister', need: '10 genaue Ergebnisse', test: (s) => s.exact >= 10 },
  { id: 'legend', name: 'Legende', need: '2000 Punkte', test: (s) => s.points >= 2000 },
];

export const titleById = (id) => TITLES.find((t) => t.id === id) ?? null;

export function unlockedTitles(stats) {
  return TITLES.filter((t) => t.test(stats)).map((t) => t.id);
}

export function levelFor(points) {
  const level = 1 + Math.floor(Math.sqrt(Math.max(0, points) / 15));
  const floor = 15 * (level - 1) ** 2;
  const next = 15 * level ** 2;
  return { level, floor, next, progress: (points - floor) / (next - floor) };
}

// Prüft einen Avatar-Entwurf; owned ist die Menge gekaufter Item-IDs
export function validateAvatar(avatar, owned) {
  if (!avatar || typeof avatar !== 'object') return null;
  const clean = {};
  for (const key of AVATAR_KEYS) {
    const id = avatar[key];
    const item = itemById(id);
    if (!item || item.group !== key) return null;
    if (item.price > 0 && !owned.has(id)) return null;
    clean[key] = id;
  }
  return clean;
}

export function validateFrame(id, owned) {
  const item = itemById(id);
  if (!item || item.group !== 'frame') return false;
  return item.price === 0 || owned.has(id);
}
