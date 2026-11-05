// Tippmärkte. Alle Wertungen beziehen sich auf die reguläre Spielzeit (90 Minuten).
// Jede Option hat ihre eigene feste Punktzahl: seltenere Ausgänge bringen mehr Punkte.

const EXACT_COMMON = new Set(['1:0', '0:1', '1:1', '2:1', '1:2', '2:0', '0:2']);
const EXACT_RARE = new Set(['0:0', '2:2', '3:0', '0:3', '3:1', '1:3', '3:2', '2:3']);
export const EXACT_POINTS = { common: 9, rare: 13, veryRare: 20 };

const sign = (h, a) => (h > a ? '1' : h < a ? '2' : 'X');
const opt = (id, label, points) => ({ id, label, points });

export const MARKETS = [
  {
    id: '1x2',
    group: 'Klassisch',
    label: 'Spielausgang',
    hint: 'Wer liegt nach 90 Minuten vorn?',
    options: [opt('1', '{h}', 2), opt('X', 'Unentschieden', 4), opt('2', '{a}', 3)],
    wins: (h, a) => [sign(h, a)],
  },
  {
    id: 'dc',
    group: 'Klassisch',
    label: 'Doppelte Chance',
    hint: 'Zwei von drei Ausgängen zählen',
    options: [opt('1X', '{h} oder Remis', 1), opt('12', '{h} oder {a}', 1), opt('X2', 'Remis oder {a}', 2)],
    wins: (h, a) => (h > a ? ['1X', '12'] : h < a ? ['12', 'X2'] : ['1X', 'X2']),
  },
  {
    id: 'hcp_home',
    group: 'Handicap',
    label: 'Handicap {h} −1',
    hint: '{h} startet mit einem Tor Rückstand',
    options: [
      opt('H2', '{h} gewinnt mit 2+ Toren', 4),
      opt('H1', '{h} gewinnt mit genau 1 Tor', 4),
      opt('HN', '{h} gewinnt nicht', 2),
    ],
    wins: (h, a) => (h - a >= 2 ? ['H2'] : h - a === 1 ? ['H1'] : ['HN']),
  },
  {
    id: 'hcp_away',
    group: 'Handicap',
    label: 'Handicap {a} −1',
    hint: '{a} startet mit einem Tor Rückstand',
    options: [
      opt('A2', '{a} gewinnt mit 2+ Toren', 5),
      opt('A1', '{a} gewinnt mit genau 1 Tor', 4),
      opt('AN', '{a} gewinnt nicht', 1),
    ],
    wins: (h, a) => (a - h >= 2 ? ['A2'] : a - h === 1 ? ['A1'] : ['AN']),
  },
  {
    id: 'ou15',
    group: 'Tore',
    label: 'Über/Unter 1,5 Tore',
    hint: 'Gesamtzahl der Tore beider Teams',
    options: [opt('O', 'Über 1,5', 1), opt('U', 'Unter 1,5', 4)],
    wins: (h, a) => [h + a >= 2 ? 'O' : 'U'],
  },
  {
    id: 'ou25',
    group: 'Tore',
    label: 'Über/Unter 2,5 Tore',
    hint: 'Gesamtzahl der Tore beider Teams',
    options: [opt('O', 'Über 2,5', 2), opt('U', 'Unter 2,5', 2)],
    wins: (h, a) => [h + a >= 3 ? 'O' : 'U'],
  },
  {
    id: 'ou35',
    group: 'Tore',
    label: 'Über/Unter 3,5 Tore',
    hint: 'Gesamtzahl der Tore beider Teams',
    options: [opt('O', 'Über 3,5', 3), opt('U', 'Unter 3,5', 1)],
    wins: (h, a) => [h + a >= 4 ? 'O' : 'U'],
  },
  {
    id: 'btts',
    group: 'Tore',
    label: 'Treffen beide Teams?',
    hint: 'Schießen {h} und {a} jeweils mindestens ein Tor?',
    options: [opt('Y', 'Ja, beide treffen', 2), opt('N', 'Nein', 2)],
    wins: (h, a) => [h > 0 && a > 0 ? 'Y' : 'N'],
  },
  {
    id: 'win_ou25',
    group: 'Kombi',
    label: 'Sieger & Über/Unter 2,5',
    hint: 'Beide Teile müssen stimmen',
    options: [
      opt('1O', '{h} & Über 2,5', 4),
      opt('1U', '{h} & Unter 2,5', 4),
      opt('XO', 'Remis & Über 2,5', 8),
      opt('XU', 'Remis & Unter 2,5', 5),
      opt('2O', '{a} & Über 2,5', 6),
      opt('2U', '{a} & Unter 2,5', 7),
    ],
    wins: (h, a) => [`${sign(h, a)}${h + a >= 3 ? 'O' : 'U'}`],
  },
  {
    id: 'exact',
    group: 'Ergebnis',
    label: 'Genaues Ergebnis',
    hint: 'Der exakte Endstand nach 90 Minuten',
    kind: 'score',
    options: [],
    wins: (h, a) => [`${h}:${a}`],
  },
];

const BY_ID = new Map(MARKETS.map((m) => [m.id, m]));

export function marketById(id) {
  return BY_ID.get(id) ?? null;
}

const SCORE_RE = /^[0-9]:[0-9]$/;

export function isValidPick(marketId, pick) {
  const m = marketById(marketId);
  if (!m || typeof pick !== 'string') return false;
  if (m.kind === 'score') return SCORE_RE.test(pick);
  return m.options.some((o) => o.id === pick);
}

export function pointsFor(marketId, pick) {
  const m = marketById(marketId);
  if (!m || !isValidPick(marketId, pick)) return 0;
  if (m.kind === 'score') {
    if (EXACT_COMMON.has(pick)) return EXACT_POINTS.common;
    if (EXACT_RARE.has(pick)) return EXACT_POINTS.rare;
    return EXACT_POINTS.veryRare;
  }
  return m.options.find((o) => o.id === pick).points;
}

// Wertet einen Tipp gegen das 90-Minuten-Ergebnis aus
export function evaluate(marketId, pick, home, away) {
  const m = marketById(marketId);
  if (!m || !isValidPick(marketId, pick)) return { won: false, points: 0 };
  const won = m.wins(home, away).includes(pick);
  return { won, points: won ? pointsFor(marketId, pick) : 0 };
}

const fill = (text, match) =>
  text.replaceAll('{h}', match.home_name ?? match.home ?? 'Heim').replaceAll('{a}', match.away_name ?? match.away ?? 'Gast');

// Märkte für die Oberfläche, Teamnamen sind bereits eingesetzt
export function describeMarkets(match) {
  return MARKETS.map((m) => ({
    id: m.id,
    group: m.group,
    kind: m.kind ?? 'choice',
    label: fill(m.label, match),
    hint: fill(m.hint, match),
    options: m.options.map((o) => ({ id: o.id, label: fill(o.label, match), points: o.points })),
    ...(m.kind === 'score' ? { exactPoints: EXACT_POINTS } : {}),
  }));
}
