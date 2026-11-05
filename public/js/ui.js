// Kleine Helfer: DOM-Aufbau, Icons, Datumsformate, Toasts, Bestätigungsfenster

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    // aria-pressed & Co. brauchen den Text "true"/"false", nicht ein leeres Attribut
    if (k.startsWith('aria-') && typeof v === 'boolean') {
      el.setAttribute(k, String(v));
      continue;
    }
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // nur für eigene, statische SVG-Zeichnungen
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Alle Symbole sind selbst gezeichnete Vektoren (keine Emojis)
const ICONS = {
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.8 2.8-1.4 4.4H9.6l-1.4-4.4z"/><path d="M12 7.5V3.2M15.8 10.3l4-1.4M14.4 14.7l2.6 3.4M9.6 14.7L7 18.1M8.2 10.3l-4-1.4"/>',
  trophy: '<path d="M7.5 4h9v5.2a4.5 4.5 0 01-9 0z"/><path d="M7.5 6H4.5v1.6A3 3 0 007.6 10.6M16.5 6h3v1.6a3 3 0 01-3.1 3"/><path d="M12 13.7V17M8.5 20h7M9.5 17h5v3h-5z"/>',
  table: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9.5h16M4 14h16M9.5 9.5V19"/>',
  shirt: '<path d="M8.5 4L3.5 6.8l2 4 2-.9V20h9V9.9l2 .9 2-4L15.5 4a3.6 3.6 0 01-7 0z"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  back: '<path d="M14.5 5l-7 7 7 7"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  chevron: '<path d="M9.5 5l7 7-7 7"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  out: '<path d="M10 4.5H5.5v15H10M14 8l4 4-4 4M18 12H9.5"/>',
};

export function icon(name, size = 22) {
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
  return wrap;
}

const TZ = 'Europe/Berlin';
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const dayKeyFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ });
const longDayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });

export const fmtTime = (ts) => timeFmt.format(ts * 1000);
export const dayKey = (ts) => dayKeyFmt.format(ts * 1000);

export function dayLabel(ts, now) {
  const key = dayKey(ts);
  if (key === dayKey(now)) return 'Heute';
  if (key === dayKey(now + 86400)) return 'Morgen';
  if (key === dayKey(now - 86400)) return 'Gestern';
  return longDayFmt.format(ts * 1000);
}

export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

// Unten einfahrendes Fenster mit zwei Knöpfen
export function confirmSheet({ title, text, confirmLabel, cancelLabel = 'Abbrechen', preview = null }) {
  return new Promise((resolve) => {
    const close = (answer) => {
      root.remove();
      resolve(answer);
    };
    const root = h(
      'div',
      { class: 'sheet-backdrop', onclick: (e) => e.target === root && close(false) },
      h(
        'div',
        { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        preview && h('div', { class: 'preview' }, preview),
        h('h2', null, title),
        text && h('p', { class: 'muted' }, text),
        h(
          'div',
          { class: 'sheet-actions', style: cancelLabel ? null : 'grid-template-columns:1fr' },
          cancelLabel && h('button', { class: 'btn ghost', onclick: () => close(false) }, cancelLabel),
          h('button', { class: 'btn', onclick: () => close(true) }, confirmLabel),
        ),
      ),
    );
    document.body.append(root);
    root.querySelector('.btn:last-child').focus();
  });
}

export const clearEl = (el) => {
  while (el.firstChild) el.firstChild.remove();
  return el;
};
