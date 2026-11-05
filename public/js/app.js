import { api, ApiError, getToken, setToken } from './api.js';
import { avatarEl } from './avatar.js';
import { confirmSheet, dayLabel, fmtTime, h, icon, toast } from './ui.js';

const root = document.getElementById('app');
const GROUP_KEY = 'tippspiel.group';
const state = { me: null, group: null, filter: { tab: 'upcoming', comp: null }, wardrobe: 'hair' };
let renderId = 0;
let refreshTimer = null;

const nowSec = () => Math.floor(Date.now() / 1000);
const mount = (el) => root.replaceChildren(el);

const rememberGroup = (code) => {
  try {
    localStorage.setItem(GROUP_KEY, code);
  } catch {
    /* ignorieren */
  }
};
const savedGroup = () => {
  try {
    return localStorage.getItem(GROUP_KEY);
  } catch {
    return null;
  }
};

const STAGES = {
  GROUP_STAGE: 'Gruppenphase', LEAGUE_STAGE: 'Ligaphase', PLAYOFFS: 'Playoffs', LAST_16: 'Achtelfinale', LAST_32: 'Sechzehntelfinale',
  QUARTER_FINALS: 'Viertelfinale', SEMI_FINALS: 'Halbfinale', FINAL: 'Finale', THIRD_PLACE: 'Spiel um Platz 3',
};
const roundText = (m) => (m.matchday && m.stage !== 'FINAL' ? `Spieltag ${m.matchday}` : (STAGES[m.stage] ?? ''));

// ---------- Bausteine ----------

function crest(team, size) {
  const fallback = () => h('span', { class: 'crest-fallback', style: size ? `width:${size}px;height:${size}px` : null }, (team.tla ?? team.name ?? '?').slice(0, 3));
  if (!team.crest) return fallback();
  const img = h('img', { class: 'crest', src: team.crest, alt: '', loading: 'lazy', width: size ?? 24, height: size ?? 24 });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

function tabLink(tab, label, ico, active) {
  return h('a', { class: 'tab', href: `#/${tab}`, 'aria-current': active === tab ? 'page' : null }, icon(ico, 24), label);
}

function tabbar(active) {
  return h(
    'div',
    { class: 'tabbar' },
    h('nav', { 'aria-label': 'Hauptmenü' }, tabLink('spiele', 'Spiele', 'ball', active), tabLink('rangliste', 'Rangliste', 'trophy', active), tabLink('ich', 'Ich', 'shirt', active)),
  );
}

function topBar() {
  return h(
    'header',
    { class: 'top' },
    h('div', null, h('div', { class: 'brand' }, 'Tippspiel'), h('div', { class: 'group' }, state.group?.name ?? '')),
    h('a', { class: 'coins', href: '#/ich', 'aria-label': `${state.me.coins} Münzen, zur Garderobe` }, icon('coin', 22), String(state.me.coins)),
  );
}

const shell = (tab, ...content) => h('div', { class: 'shell' }, ...content, tabbar(tab));

function loading(text = 'Lädt …') {
  return h('div', { class: 'loading', role: 'status' }, text);
}

function errorBox(err, retry) {
  return h('div', { class: 'empty' }, h('h2', null, 'Das hat nicht geklappt'), h('p', null, err.message), retry && h('div', { style: 'margin-top:16px' }, h('button', { class: 'btn small', onclick: retry }, 'Noch einmal versuchen')));
}

// ---------- Start ----------

async function boot() {
  if (getToken()) {
    try {
      const me = await api('/api/me');
      state.me = me;
      state.group = me.group;
      rememberGroup(me.group.code);
    } catch {
      /* Anmeldung abgelaufen: Willkommensseite */
    }
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('auth-lost', () => {
    state.me = null;
    render();
    toast('Bitte melde dich neu an.');
  });
  render();
}

function render() {
  clearTimeout(refreshTimer);
  const id = ++renderId;
  if (!state.me) return renderWelcome(id);
  const [view = 'spiele', arg] = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  if (view === 'spiel' && /^\d+$/.test(arg ?? '')) return viewMatch(id, Number(arg));
  if (view === 'rangliste') return viewLeaderboard(id);
  if (view === 'ich') return viewMe(id);
  return viewMatches(id);
}

// ---------- Willkommen und Anmeldung ----------

function pitchHero() {
  const lines = `<svg class="lines" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2.5"><circle cx="200" cy="150" r="74"/><path d="M0 150 H400"/><circle cx="200" cy="150" r="4" fill="#fff" fill-opacity=".4"/><path d="M110 0 V36 H290 V0" /><path d="M110 300 V264 H290 V300"/></svg>`;
  const el = h('div', { class: 'pitch' }, h('h1', null, 'Tippspiel'), h('p', null, 'Tippt die Spiele der großen Ligen und sammelt Punkte. Wer liegt am Ende vorn?'));
  el.insertAdjacentHTML('afterbegin', lines);
  return el;
}

function pinPad({ title, onDone }) {
  let digits = '';
  const dots = h('div', { class: 'pindots', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i')));
  const status = h('div', { class: 'sr-only', 'aria-live': 'polite' });
  const paint = () => {
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i < digits.length));
    status.textContent = `${digits.length} von 4 Ziffern`;
  };
  const press = (d) => {
    if (digits.length >= 4) return;
    digits += d;
    paint();
    if (digits.length === 4) setTimeout(() => onDone(digits), 120);
  };
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('button', { type: 'button', onclick: () => press(String(n)) }, String(n)));
  const back = h('button', { type: 'button', class: 'quiet', onclick: () => { digits = digits.slice(0, -1); paint(); } }, 'Löschen');
  const el = h('div', { class: 'panel', style: 'padding:0' }, title && h('h2', null, title), dots, status, h('div', { class: 'pinpad' }, keys, back, h('button', { type: 'button', onclick: () => press('0') }, '0'), h('span')));
  return { el, reset: () => { digits = ''; paint(); } };
}

function renderWelcome(id) {
  const go = (step, ctx = {}) => {
    if (id !== renderId) return;
    mount(h('div', { class: 'welcome' }, pitchHero(), step(ctx)));
  };

  const start = () => {
    const code = savedGroup();
    if (code) return joinWith(code, true);
    return go(startPanel);
  };

  const startPanel = () =>
    h(
      'div',
      { class: 'panel' },
      h('h2', null, 'Los geht’s'),
      h('p', { class: 'lead' }, 'Jede Familie hat ihre eigene Gruppe mit einem Code.'),
      h('button', { class: 'btn', onclick: () => go(codePanel) }, 'Gruppe beitreten'),
      h('button', { class: 'btn ghost', onclick: () => go(createPanel) }, 'Neue Gruppe starten'),
    );

  const codePanel = (ctx = {}) => {
    const input = h('input', { class: 'code', id: 'code', maxlength: '6', autocomplete: 'off', autocapitalize: 'characters', inputmode: 'text', value: ctx.code ?? '' });
    const err = h('div');
    const submit = async (e) => {
      e?.preventDefault();
      const code = input.value.trim().toUpperCase();
      if (code.length !== 6) return err.replaceChildren(h('div', { class: 'error' }, 'Der Gruppencode hat 6 Zeichen.'));
      await joinWith(code, false, err);
    };
    return h(
      'form',
      { class: 'panel', onsubmit: submit, novalidate: true },
      h('button', { type: 'button', class: 'backlink', onclick: () => go(startPanel) }, icon('back', 20), 'Zurück'),
      h('h2', null, 'Gruppencode eingeben'),
      h('div', { class: 'field' }, h('label', { for: 'code' }, 'Code'), input, h('span', { class: 'help' }, 'Den Code zeigt die Rangliste in der Gruppe an.')),
      err,
      h('button', { class: 'btn', type: 'submit' }, 'Weiter'),
    );
  };

  async function joinWith(code, quiet, errBox) {
    try {
      const info = await api(`/api/group/${code}`);
      rememberGroup(info.group.code);
      go(() => membersPanel(info));
    } catch (e) {
      if (quiet) {
        try {
          localStorage.removeItem(GROUP_KEY);
        } catch {
          /* ignorieren */
        }
        return go(startPanel);
      }
      errBox?.replaceChildren(h('div', { class: 'error' }, e.message));
    }
  }

  const membersPanel = (info) =>
    h(
      'div',
      { class: 'panel' },
      h('h2', null, info.group.name),
      h('p', { class: 'lead' }, info.members.length ? 'Tippe auf dich, um weiterzumachen.' : 'Hier ist noch niemand. Leg dein Konto an.'),
      h(
        'div',
        { class: 'members' },
        info.members.map((m) => h('button', { class: 'member', onclick: () => go(() => loginPanel(info, m)) }, avatarEl(m.avatar, m.frame, 64), m.name)),
        h('button', { class: 'member add', onclick: () => go(() => registerNamePanel({ info })) }, icon('plus', 28), 'Neu hier'),
      ),
      h('button', { class: 'backlink', onclick: () => { try { localStorage.removeItem(GROUP_KEY); } catch { /* ignorieren */ } go(startPanel); } }, 'Andere Gruppe wählen'),
    );

  const loginPanel = (info, member) => {
    const err = h('div');
    const pad = pinPad({
      onDone: async (pin) => {
        try {
          const res = await api('/api/login', { method: 'POST', body: { groupCode: info.group.code, name: member.name, pin } });
          finishLogin(res);
        } catch (e) {
          err.replaceChildren(h('div', { class: 'error' }, e.message));
          pad.reset();
        }
      },
    });
    return h(
      'div',
      { class: 'panel' },
      h('button', { class: 'backlink', onclick: () => go(() => membersPanel(info)) }, icon('back', 20), 'Zurück'),
      h('div', { class: 'who-big' }, avatarEl(member.avatar, member.frame, 88), member.name),
      h('p', { class: 'lead', style: 'text-align:center' }, 'Gib deine PIN ein.'),
      err,
      pad.el,
    );
  };

  const registerNamePanel = (ctx) => {
    const { info, create } = ctx;
    const name = h('input', { id: 'name', maxlength: '16', autocomplete: 'off', value: ctx.name ?? '' });
    const groupName = create ? h('input', { id: 'gname', maxlength: '24', autocomplete: 'off', value: ctx.groupName ?? 'Familie' }) : null;
    const err = h('div');
    const next = (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (n.length < 2) return err.replaceChildren(h('div', { class: 'error' }, 'Der Name braucht mindestens 2 Zeichen.'));
      go(() => registerPinPanel({ ...ctx, name: n, groupName: groupName?.value.trim() || 'Familie' }));
    };
    return h(
      'form',
      { class: 'panel', onsubmit: next, novalidate: true },
      h('button', { type: 'button', class: 'backlink', onclick: () => go(create ? startPanel : () => membersPanel(info)) }, icon('back', 20), 'Zurück'),
      h('h2', null, create ? 'Neue Gruppe' : 'Willkommen in der Gruppe'),
      groupName && h('div', { class: 'field' }, h('label', { for: 'gname' }, 'Name der Gruppe'), groupName),
      h('div', { class: 'field' }, h('label', { for: 'name' }, 'Dein Name'), name, h('span', { class: 'help' }, 'So sehen dich die anderen in der Rangliste.')),
      err,
      h('button', { class: 'btn', type: 'submit' }, 'Weiter'),
    );
  };

  const registerPinPanel = (ctx, first = null) => {
    const err = h('div');
    const pad = pinPad({
      title: first ? 'PIN wiederholen' : 'Wähle eine PIN',
      onDone: async (pin) => {
        if (!first) return go(() => registerPinPanel(ctx, pin));
        if (pin !== first) {
          go(() => registerPinPanel(ctx, null));
          return toast('Die PINs waren nicht gleich. Versuche es noch einmal.');
        }
        try {
          const res = await api('/api/register', {
            method: 'POST',
            body: { name: ctx.name, pin, ...(ctx.create ? { groupName: ctx.groupName } : { groupCode: ctx.info.group.code }) },
          });
          finishLogin(res, ctx.create);
        } catch (e) {
          err.replaceChildren(h('div', { class: 'error' }, e.message));
          pad.reset();
        }
      },
    });
    return h(
      'div',
      { class: 'panel' },
      h('button', { class: 'backlink', onclick: () => go(() => registerNamePanel({ ...ctx })) }, icon('back', 20), 'Zurück'),
      h('p', { class: 'lead' }, first ? 'Tippe die gleiche PIN noch einmal.' : 'Vier Ziffern, die du dir gut merken kannst.'),
      err,
      pad.el,
    );
  };

  const createPanel = () => registerNamePanel({ create: true });

  function finishLogin(res, isNewGroup = false) {
    setToken(res.token);
    state.me = res;
    state.group = res.group;
    rememberGroup(res.group.code);
    location.hash = '#/spiele';
    render();
    if (isNewGroup) {
      confirmSheet({
        title: 'Deine Gruppe ist bereit',
        text: `Der Gruppencode lautet ${res.group.code}. Mit diesem Code kommen alle anderen dazu. Du findest ihn später in der Rangliste.`,
        confirmLabel: 'Los geht’s',
        cancelLabel: null,
      });
    }
  }

  start();
}

// ---------- Spiele ----------

const isDone = (m) => m.status === 'FINISHED' || m.status === 'CANCELLED' || m.status === 'AWARDED';

function matchRow(m, now, compById) {
  const finished = m.status === 'FINISHED';
  const tipState = h('div', { class: 'tipstate' });
  if (finished) {
    if (m.myTips > 0) tipState.append(h('span', { class: `pts ${m.myPoints > 0 ? 'won' : 'off'}` }, m.myPoints > 0 ? `+${m.myPoints}` : '0'), h('span', null, `${m.myTips} ${m.myTips === 1 ? 'Tipp' : 'Tipps'}`));
    else tipState.append(h('span', null, 'Nicht getippt'));
  } else if (m.status === 'POSTPONED' || m.status === 'CANCELLED' || m.status === 'SUSPENDED') {
    tipState.append(h('span', null, m.status === 'POSTPONED' ? 'Verschoben' : 'Abgesagt'));
  } else if (m.locked) {
    tipState.append(icon('lock', 18), h('span', null, m.myTips > 0 ? `${m.myTips} ${m.myTips === 1 ? 'Tipp' : 'Tipps'}` : 'Geschlossen'));
  } else if (m.myTips > 0) {
    tipState.append(icon('check', 20), h('span', null, `${m.myTips} ${m.myTips === 1 ? 'Tipp' : 'Tipps'}`));
  } else {
    tipState.append(h('span', { class: 'todo' }, 'Jetzt tippen'));
  }
  const comp = compById.get(m.competition);
  return h(
    'button',
    { class: 'fixture', onclick: () => { location.hash = `#/spiel/${m.id}`; } },
    h('div', { class: 'time' }, finished ? 'Ende' : fmtTime(m.kickoff), !finished && m.locked && m.status === 'IN_PLAY' ? h('small', null, 'läuft') : null),
    h(
      'div',
      null,
      h('div', { class: 'comp' }, comp?.emblem && h('img', { src: comp.emblem, alt: '', loading: 'lazy', width: 14, height: 14 }), comp?.name ?? m.competition),
      h('div', { class: 'trow' }, crest(m.home), h('span', { class: 'name' }, m.home.name), finished && m.score ? h('span', { class: 'goal' }, m.score.home) : null),
      h('div', { class: 'trow' }, crest(m.away), h('span', { class: 'name' }, m.away.name), finished && m.score ? h('span', { class: 'goal' }, m.score.away) : null),
    ),
    tipState,
  );
}

async function viewMatches(id) {
  mount(shell('spiele', topBar(), loading('Spiele werden geladen …')));
  let data;
  try {
    data = await api('/api/matches?back=7&ahead=14');
  } catch (e) {
    if (id !== renderId) return;
    return mount(shell('spiele', topBar(), errorBox(e, () => render())));
  }
  if (id !== renderId) return;
  const now = data.now;
  const compById = new Map(data.competitions.map((c) => [c.code, c]));
  if (state.filter.comp && !compById.has(state.filter.comp)) state.filter.comp = null;

  const draw = () => {
    const f = state.filter;
    const inComp = (m) => !f.comp || m.competition === f.comp;
    const upcoming = data.matches.filter((m) => !isDone(m) && m.kickoff > now - 4 * 3600 && inComp(m));
    const results = data.matches.filter((m) => !upcoming.includes(m) && inComp(m)).sort((a, b) => b.kickoff - a.kickoff);
    const list = f.tab === 'upcoming' ? upcoming : results;

    const seg = h('div', { class: 'bar' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Anzeige' },
      h('button', { 'aria-pressed': f.tab === 'upcoming', onclick: () => { f.tab = 'upcoming'; draw(); } }, 'Kommende Spiele'),
      h('button', { 'aria-pressed': f.tab === 'results', onclick: () => { f.tab = 'results'; draw(); } }, 'Ergebnisse'),
    ));
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Wettbewerb' },
      h('button', { class: 'chip', 'aria-pressed': !f.comp, onclick: () => { f.comp = null; draw(); } }, 'Alle'),
      data.competitions.map((c) => h('button', { class: 'chip', 'aria-pressed': f.comp === c.code, onclick: () => { f.comp = c.code; draw(); } }, c.emblem && h('img', { src: c.emblem, alt: '', loading: 'lazy' }), c.name)),
    );

    const body = h('div');
    if (!list.length) {
      body.append(
        h('div', { class: 'empty' },
          h('h2', null, f.tab === 'upcoming' ? 'Gerade keine Spiele' : 'Noch keine Ergebnisse'),
          h('p', null, data.matches.length === 0 ? 'Der Spielplan wird gerade geladen. Das dauert beim ersten Mal ein paar Minuten, schau gleich noch einmal rein.' : 'In diesem Filter gibt es nichts zu sehen. Wähle oben einen anderen Wettbewerb.')),
      );
    }
    let lastDay = '';
    for (const m of list) {
      const label = dayLabel(m.kickoff, now);
      if (label !== lastDay) {
        body.append(h('div', { class: 'day' }, label));
        lastDay = label;
      }
      body.append(matchRow(m, now, compById));
    }
    const page = [topBar(), h('div', { class: 'page-title' }, h('h1', null, f.tab === 'upcoming' ? 'Spiele zum Tippen' : 'Ergebnisse'), h('p', null, f.tab === 'upcoming' ? 'Tippschluss ist jeweils der Anpfiff.' : 'Die letzten Tage mit deinen Punkten.')), seg, chips, body];
    const y = window.scrollY;
    mount(shell('spiele', ...page));
    window.scrollTo(0, y);
  };
  draw();
  refreshTimer = setTimeout(() => id === renderId && render(), 60000);
}

// ---------- Spiel-Detail ----------

const COMMON = new Set(['1:0', '0:1', '1:1', '2:1', '1:2', '2:0', '0:2']);
const RARE = new Set(['0:0', '2:2', '3:0', '0:3', '3:1', '1:3', '3:2', '2:3']);
const exactPts = (key, t) => (COMMON.has(key) ? t.common : RARE.has(key) ? t.rare : t.veryRare);

async function viewMatch(id, matchId) {
  mount(shell('spiele', h('div', { class: 'hero' }, h('button', { class: 'back', onclick: () => { location.hash = '#/spiele'; } }, icon('back', 20), 'Spiele')), loading()));
  let data;
  try {
    data = await api(`/api/matches/${matchId}`);
  } catch (e) {
    if (id !== renderId) return;
    return mount(shell('spiele', h('div', { class: 'hero' }, h('button', { class: 'back', onclick: () => { location.hash = '#/spiele'; } }, icon('back', 20), 'Spiele')), errorBox(e, () => render())));
  }
  if (id !== renderId) return;

  const m = data.match;
  const finished = m.status === 'FINISHED' && m.score;
  const open = new Set([data.markets[0]?.group, ...data.markets.filter((mk) => data.myTips[mk.id]).map((mk) => mk.group)]);
  const exactDraft = (() => {
    const saved = data.myTips.exact?.pick;
    const [hh, aa] = (saved ?? '1:1').split(':').map(Number);
    return { h: hh, a: aa };
  })();
  const sectionsEl = h('div', { class: 'section' });
  const tipNote = h('div', { class: 'tipnote' });
  const drawTipNote = () => {
    const mk = data.markets.find((x) => data.myTips[x.id]);
    const tip = mk && data.myTips[mk.id];
    const pickLabel = mk ? (mk.kind === 'score' ? tip.pick.replace(':', ' : ') : (mk.options.find((o) => o.id === tip.pick)?.label ?? tip.pick)) : '';
    tipNote.replaceChildren(
      mk
        ? h('p', null, h('b', null, 'Dein Tipp: '), `${mk.label}, ${pickLabel}`, m.locked ? '' : '. Ein Tipp in einem anderen Markt ersetzt ihn.')
        : h('p', null, m.locked ? 'Du hast bei diesem Spiel nicht getippt.' : 'Pro Spiel zählt ein Tipp. Such dir den Markt aus, bei dem du dir am sichersten bist.'),
    );
  };

  const setPick = async (market, pick) => {
    if (m.locked) return;
    try {
      const res = await api(`/api/matches/${matchId}/tips`, { method: 'PUT', body: { market, pick } });
      data.myTips = res.myTips;
      drawSections();
    } catch (e) {
      toast(e.message);
    }
  };

  const resultText = (t) => (t.status === 'won' ? `Richtig, +${t.points} Punkte` : t.status === 'lost' ? 'Leider falsch' : t.status === 'void' ? 'Nicht gewertet' : null);

  function choiceMarket(mk) {
    const tip = data.myTips[mk.id];
    return h('div', { class: 'market' },
      h('h3', null, mk.label),
      h('p', { class: 'hint' }, mk.hint),
      h('div', { class: `picks ${mk.id === '1x2' ? 'three' : ''}`, role: 'group', 'aria-label': mk.label },
        mk.options.map((o) => {
          const mine = tip?.pick === o.id;
          const cls = ['pick', mine && m.locked ? tip.status === 'won' ? 'won' : tip.status === 'lost' ? 'lost' : tip.status === 'void' ? 'void' : '' : ''].filter(Boolean).join(' ');
          return h('button', { class: cls, 'aria-pressed': mine, disabled: m.locked, onclick: () => setPick(mk.id, mine ? null : o.id) },
            h('span', { class: 'label' }, o.label, mine && m.locked && resultText(tip) ? h('div', { class: 'res' }, resultText(tip)) : null),
            h('span', { class: 'foot' },
              mine && !m.locked ? icon('check', 20) : null,
              h('span', { class: `pts ${mine && tip.status === 'won' ? 'won' : ''}` }, o.points)),
          );
        }),
      ),
    );
  }

  function exactMarket(mk) {
    const tip = data.myTips.exact;
    const saved = tip?.pick;
    const key = `${exactDraft.h}:${exactDraft.a}`;
    const stepper = (side, label) => {
      const v = exactDraft[side];
      return h('div', { class: 'col' },
        h('button', { class: 'step', 'aria-label': `${label} Tor mehr`, disabled: m.locked || v >= 9, onclick: () => { exactDraft[side] = v + 1; drawSections(); } }, icon('plus', 22)),
        h('div', { class: 'digit', 'aria-live': 'polite' }, m.locked && saved ? saved.split(':')[side === 'h' ? 0 : 1] : String(v)),
        h('button', { class: 'step', 'aria-label': `${label} Tor weniger`, disabled: m.locked || v <= 0, onclick: () => { exactDraft[side] = v - 1; drawSections(); } }, icon('minus', 22)),
        h('div', { class: 'who' }, label),
      );
    };
    const pts = exactPts(key, mk.exactPoints);
    const foot = [];
    if (m.locked) {
      foot.push(h('div', { class: 'info' }, saved ? [h('span', { class: `pts ${tip.status === 'won' ? 'won' : tip.status === 'lost' || tip.status === 'void' ? 'off' : ''}` }, tip.status === 'won' ? `+${tip.points}` : tip.potential), h('span', null, resultText(tip) ?? 'Dein Tipp zählt nach dem Abpfiff')] : h('span', null, 'Du hast kein Ergebnis getippt.')));
    } else {
      foot.push(
        h('div', { class: 'info' }, h('span', { class: 'pts' }, pts), h('span', null, saved === key ? 'Gespeichert' : 'bei genauem Treffer')),
        h('div', { style: 'display:flex;gap:8px' },
          saved && h('button', { class: 'btn ghost small', onclick: () => setPick('exact', null) }, 'Entfernen'),
          h('button', { class: 'btn small', disabled: saved === key, onclick: () => setPick('exact', key) }, saved ? 'Ändern' : 'Speichern'),
        ),
      );
    }
    return h('div', { class: 'market' },
      h('h3', null, mk.label),
      h('p', { class: 'hint' }, mk.hint),
      h('div', { class: 'led', role: 'group', 'aria-label': 'Ergebnis' }, stepper('h', m.home.name), h('div', { class: 'colon', 'aria-hidden': 'true' }, ':'), stepper('a', m.away.name)),
      h('div', { class: 'led-foot' }, foot),
    );
  }

  function drawSections() {
    drawTipNote();
    const groups = [];
    for (const mk of data.markets) {
      let g = groups.find((x) => x.name === mk.group);
      if (!g) groups.push((g = { name: mk.group, markets: [] }));
      g.markets.push(mk);
    }
    sectionsEl.replaceChildren(
      ...groups.map((g) => {
        const count = g.markets.filter((mk) => data.myTips[mk.id]).length;
        const d = h('details', { class: 'group', open: open.has(g.name) },
          h('summary', null, g.name, h('span', { class: 'right' }, count ? `${count} getippt` : 'Offen', icon('down', 20))),
          h('div', { class: 'group-body' }, g.markets.map((mk) => (mk.kind === 'score' ? exactMarket(mk) : choiceMarket(mk)))),
        );
        d.addEventListener('toggle', () => (d.open ? open.add(g.name) : open.delete(g.name)));
        return d;
      }),
    );
  }
  drawSections();

  const note = (() => {
    if (finished) return null;
    if (m.status === 'POSTPONED' || m.status === 'CANCELLED' || m.status === 'SUSPENDED') return [icon('clock', 20), 'Dieses Spiel ist verschoben oder abgesagt. Tippen ist gerade nicht möglich.'];
    if (m.locked) return [icon('lock', 20), 'Der Anpfiff war schon. Deine Tipps sind gespeichert und zählen nach dem Abpfiff.'];
    return [icon('clock', 20), `Tippschluss ist der Anpfiff um ${fmtTime(m.kickoff)} Uhr. Bis dahin kannst du deine Tipps ändern.`];
  })();

  const others = (() => {
    const g = data.group;
    if (!g.others) {
      return h('div', { class: 'others' }, h('h2', null, 'Die anderen'), h('p', { class: 'muted' }, `${g.tippers} von ${g.members} haben schon getippt. Ihre Tipps siehst du ab dem Anpfiff.`));
    }
    if (!g.others.length) return null;
    return h('div', { class: 'others' }, h('h2', null, 'Die anderen'),
      g.others.map((p) => h('div', { class: 'other' }, avatarEl(p.avatar, p.frame, 44),
        h('div', null, h('div', { class: 'who' }, p.name),
          h('ul', null, p.tips.map((t) => {
            const mk = data.markets.find((x) => x.id === t.market);
            const label = mk?.kind === 'score' ? t.pick.replace(':', ' : ') : (mk?.options.find((o) => o.id === t.pick)?.label ?? t.pick);
            return h('li', { class: t.status }, h('span', null, mk?.label ?? t.market), h('b', null, t.status === 'won' ? `${label}, +${t.points}` : label));
          })),
        ))),
    );
  })();

  mount(shell('spiele',
    h('div', { class: 'hero' },
      h('div', { class: 'nav' }, h('button', { class: 'back', onclick: () => { location.hash = '#/spiele'; } }, icon('back', 20), 'Spiele'), h('span', { class: 'where' }, [m.competitionName, roundText(m)].filter(Boolean).join(', '))),
      h('div', { class: 'versus' },
        h('div', { class: 'side' }, crest(m.home, 56), m.home.name),
        h('div', { class: 'mid' }, finished ? `${m.score.home}:${m.score.away}` : fmtTime(m.kickoff), h('small', null, finished ? 'Endstand nach 90 Minuten' : dayLabel(m.kickoff, nowSec()))),
        h('div', { class: 'side' }, crest(m.away, 56), m.away.name),
      ),
      note && h('div', { class: 'locknote' }, note),
    ),
    tipNote,
    sectionsEl,
    others,
  ));
}

// ---------- Rangliste ----------

async function viewLeaderboard(id) {
  const period = state.period ?? 'week';
  mount(shell('rangliste', topBar(), loading()));
  let data;
  try {
    data = await api(`/api/leaderboard?period=${period}`);
  } catch (e) {
    if (id !== renderId) return;
    return mount(shell('rangliste', topBar(), errorBox(e, () => render())));
  }
  if (id !== renderId) return;
  const setPeriod = (p) => { state.period = p; render(); };
  const rows = data.rows.map((r) =>
    h('div', { class: `rank-row ${r.me ? 'me' : ''} ${r.rank === 1 ? 'first' : ''}` },
      h('div', { class: 'rank' }, r.rank),
      avatarEl(r.avatar, r.frame, 52),
      h('div', null, h('div', { class: 'nm' }, r.name), h('div', { class: 'sub' }, r.hitRate === null ? 'Noch nichts gewertet' : `${r.hitRate} % richtig, ${r.exact} genau`)),
      h('div', { class: 'score' }, r.points, h('small', null, 'Punkte')),
    ));
  mount(shell('rangliste', topBar(),
    h('div', { class: 'page-title' }, h('h1', null, 'Rangliste'), h('p', null, period === 'week' ? 'Diese Woche, Montag bis Sonntag.' : 'Alle Spiele zusammen.')),
    h('div', { class: 'bar' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Zeitraum' },
      h('button', { 'aria-pressed': period === 'week', onclick: () => setPeriod('week') }, 'Diese Woche'),
      h('button', { 'aria-pressed': period === 'all', onclick: () => setPeriod('all') }, 'Gesamt'))),
    h('div', { style: 'margin-top:12px;border-top:1px solid var(--linie)' }, rows),
    h('div', { class: 'empty' }, h('h2', null, 'Mehr Mitspieler'), h('p', null, `Gruppencode: ${state.group.code}. Wer ihn eingibt, spielt in dieser Gruppe mit.`)),
  ));
}

// ---------- Ich: Profil, Garderobe, Shop ----------

const WARDROBE = [
  ['hair', 'Frisur'], ['hairColor', 'Haarfarbe'], ['skin', 'Haut'], ['eyes', 'Augen'], ['mouth', 'Mund'],
  ['outfit', 'Trikot'], ['accessory', 'Zubehör'], ['bg', 'Hintergrund'], ['frame', 'Rahmen'], ['title', 'Titel'],
];

async function viewMe(id) {
  mount(shell('ich', loading()));
  let shop;
  try {
    shop = await api('/api/shop');
  } catch (e) {
    if (id !== renderId) return;
    return mount(shell('ich', errorBox(e, () => render())));
  }
  if (id !== renderId) return;

  // Nur der Gründer der Gruppe stellt ein, welche Wettbewerbe getippt werden
  let settings = null;
  if (state.me.group?.isFounder) {
    try {
      settings = await api('/api/group/settings');
    } catch {
      settings = null;
    }
    if (id !== renderId) return;
  }
  const savedComps = new Set(settings?.competitions.filter((c) => c.enabled).map((c) => c.code));
  const pickedComps = new Set(savedComps);

  const saveComps = async () => {
    try {
      settings = await api('/api/group/settings', { method: 'POST', body: { competitions: [...pickedComps] } });
      savedComps.clear();
      pickedComps.clear();
      for (const c of settings.competitions) if (c.enabled) { savedComps.add(c.code); pickedComps.add(c.code); }
      toast('Gespeichert. Das gilt jetzt für die ganze Gruppe.');
      draw();
    } catch (e) {
      toast(e.message);
    }
  };

  function compSettings() {
    const changed = pickedComps.size !== savedComps.size || [...pickedComps].some((c) => !savedComps.has(c));
    return h('div', { class: 'comp-settings' },
      h('h2', { class: 'wardrobe-title' }, 'Wettbewerbe deiner Gruppe'),
      h('p', { class: 'wardrobe-sub' }, 'Du hast die Gruppe gegründet und bestimmst, welche Wettbewerbe getippt werden. Das gilt für alle in der Gruppe.'),
      h('div', { class: 'titlelist' },
        settings.competitions.map((c) => h('button', { class: 'titlerow', 'aria-pressed': pickedComps.has(c.code), onclick: () => { if (pickedComps.has(c.code)) pickedComps.delete(c.code); else pickedComps.add(c.code); draw(); } },
          h('div', null, h('div', { class: 'nm' }, c.name), h('div', { class: 'need' }, c.upcoming ? `${c.upcoming} ${c.upcoming === 1 ? 'Spiel' : 'Spiele'} in den nächsten 14 Tagen` : 'Gerade keine Spiele')),
          pickedComps.has(c.code) ? icon('check', 22) : null,
        ))),
      h('div', { class: 'save-row' },
        h('button', { class: 'btn', disabled: !changed || pickedComps.size === 0, onclick: saveComps }, 'Auswahl speichern'),
        pickedComps.size === 0 ? h('p', { class: 'muted' }, 'Wähle mindestens einen Wettbewerb aus.') : null),
    );
  }

  const apply = (profile) => {
    state.me = { ...state.me, ...profile };
  };

  const equip = async (key, item) => {
    try {
      const body = key === 'frame' ? { frame: item.id } : key === 'title' ? { title: item.id } : { avatar: { ...state.me.player.avatar, [key]: item.id } };
      apply(await api('/api/profile', { method: 'POST', body }));
      draw();
    } catch (e) {
      toast(e.message);
    }
  };

  const buy = async (key, item) => {
    const coins = state.me.coins;
    if (coins < item.price) {
      return toast(`Dir fehlen noch ${item.price - coins} Münzen. Münzen bekommst du für richtige Tipps.`);
    }
    const preview = key === 'frame' ? avatarEl(state.me.player.avatar, item.id, 96) : avatarEl({ ...state.me.player.avatar, [key]: item.id }, state.me.player.frame, 96);
    const ok = await confirmSheet({ title: `${item.name} kaufen?`, text: `Das kostet ${item.price} Münzen. Du hast ${coins}.`, confirmLabel: `Für ${item.price} Münzen kaufen`, preview });
    if (!ok) return;
    try {
      apply(await api('/api/shop/buy', { method: 'POST', body: { item: item.id } }));
      shop.catalog[key].find((i) => i.id === item.id).owned = true;
      await equip(key, item);
      toast(`${item.name} gehört jetzt dir.`);
    } catch (e) {
      toast(e.message);
    }
  };

  function itemsFor(key) {
    const me = state.me.player;
    return h('div', { class: 'items' },
      shop.catalog[key].map((item) => {
        const equipped = key === 'frame' ? me.frame === item.id : me.avatar[key] === item.id;
        const preview = key === 'frame' ? avatarEl(me.avatar, item.id, 64) : avatarEl({ ...me.avatar, [key]: item.id }, me.frame, 64);
        return h('button', { class: `item ${item.owned ? '' : 'locked'}`, 'aria-pressed': equipped, 'aria-label': `${item.name}${item.owned ? '' : `, ${item.price} Münzen`}`, onclick: () => (item.owned ? equip(key, item) : buy(key, item)) },
          equipped && h('span', { class: 'badge' }, icon('check', 14)),
          preview,
          h('span', null, item.name),
          item.owned ? h('span', { class: 'own' }, item.price === 0 ? 'Gratis' : 'Im Besitz') : h('span', { class: 'price' }, icon('lock', 14), h('span', { class: 'pts' }, item.price)),
        );
      }),
    );
  }

  function titlesList() {
    return h('div', { class: 'titlelist' },
      shop.titles.map((t) => h('button', { class: 'titlerow', 'aria-pressed': state.me.player.title === t.id, disabled: !t.unlocked, onclick: () => equip('title', t) },
        h('div', null, h('div', { class: 'nm' }, t.name), h('div', { class: 'need' }, t.unlocked ? t.need : `Freischalten: ${t.need}`)),
        state.me.player.title === t.id ? icon('check', 22) : !t.unlocked ? icon('lock', 20) : null,
      )));
  }

  function draw() {
    const me = state.me;
    const titleName = shop.titles.find((t) => t.id === me.player.title)?.name ?? '';
    const lv = me.level;
    const tab = state.wardrobe;
    const page = shell('ich',
      h('div', { class: 'me-head' },
        avatarEl(me.player.avatar, me.player.frame, 104),
        h('div', null,
          h('h1', null, me.player.name),
          h('div', { class: 'title' }, `${titleName}, Stufe ${lv.level}`),
          h('div', { class: 'level' }, h('div', { class: 'row' }, h('span', null, 'Nächste Stufe'), h('span', null, `${me.stats.points} / ${lv.next} Punkte`)),
            h('div', { class: 'track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(lv.progress * 100) }, h('div', { class: 'fill', style: `width:${Math.max(2, Math.round(lv.progress * 100))}%` }))),
        ),
      ),
      h('div', { class: 'facts' },
        h('div', { class: 'fact' }, h('b', null, me.stats.points), h('span', null, 'Punkte')),
        h('div', { class: 'fact' }, h('b', null, me.coins), h('span', null, 'Münzen')),
        h('div', { class: 'fact' }, h('b', null, me.stats.won), h('span', null, 'Richtige Tipps')),
      ),
      h('h2', { class: 'wardrobe-title' }, 'Garderobe'),
      h('p', { class: 'wardrobe-sub' }, 'Alles, was du für Münzen kaufst, gehört dir für immer.'),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Kategorie' }, WARDROBE.map(([k, label]) => h('button', { class: 'chip', 'aria-pressed': tab === k, onclick: () => { state.wardrobe = k; draw(); } }, label))),
      tab === 'title' ? titlesList() : itemsFor(tab),
      settings ? compSettings() : null,
      h('div', { class: 'logout' }, h('button', { class: 'btn ghost', onclick: logout }, icon('out', 20), 'Abmelden')),
    );
    const y = window.scrollY;
    mount(page);
    window.scrollTo(0, y);
  }
  draw();
}

async function logout() {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch {
    /* auch bei Fehler lokal abmelden */
  }
  setToken(null);
  state.me = null;
  location.hash = '';
  render();
}

boot();
