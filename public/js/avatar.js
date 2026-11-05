// Avatare werden komplett als SVG gezeichnet (keine Emojis, keine Bilddateien).
// Die IDs entsprechen dem Katalog in src/cosmetics.js.

let counter = 0;

const SKIN = { s1: '#f6dcc8', s2: '#eac29a', s3: '#d9a066', s4: '#b9783f', s5: '#8a5530', s6: '#5a3720' };
const SKIN_SHADE = { s1: '#e3bfa4', s2: '#d3a577', s3: '#bf8449', s4: '#9a5f2e', s5: '#6f4223', s6: '#472b18' };
const HAIR = { c1: '#1b1b1f', c2: '#5b3a22', c3: '#a47c3b', c4: '#e6c15a', c5: '#b8431f', c6: '#9aa1a6', c7: '#2f6fe0', c8: '#e9559e' };

// ---------- Hintergründe ----------
function background(id, u) {
  switch (id) {
    case 'b2': {
      const stars = [[18, 20], [74, 14], [60, 30], [30, 38], [84, 44], [12, 56], [48, 12]]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#fff" opacity=".85"/>`).join('');
      return `<defs><linearGradient id="bg${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1b3d"/><stop offset="1" stop-color="#2c3d78"/></linearGradient></defs><rect width="100" height="100" fill="url(#bg${u})"/>${stars}`;
    }
    case 'b3':
      return `<defs><linearGradient id="bg${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6b26b"/><stop offset="1" stop-color="#6f5aa8"/></linearGradient></defs><rect width="100" height="100" fill="url(#bg${u})"/>`;
    case 'b4':
      return `<rect width="100" height="100" fill="#b9d3e6"/><path d="M0 62 Q50 46 100 62 V100 H0Z" fill="#46566a"/><path d="M0 70 Q50 55 100 70" stroke="#6d809a" stroke-width="2" fill="none"/>${Array.from({ length: 14 }, (_, i) => `<circle cx="${6 + i * 7}" cy="${66 + Math.sin(i) * 2}" r="1.2" fill="#f2c94c" opacity=".8"/>`).join('')}`;
    case 'b5':
      return `<defs><linearGradient id="bg${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a45"/><stop offset="1" stop-color="#ffcf6a"/></linearGradient></defs><rect width="100" height="100" fill="url(#bg${u})"/><circle cx="50" cy="66" r="20" fill="#fff3b0" opacity=".9"/>`;
    case 'b6':
      return `<rect width="100" height="100" fill="#101820"/><path d="M18 0 L48 100 L-4 100Z M82 0 L104 100 L52 100Z" fill="#fff" opacity=".13"/><circle cx="18" cy="6" r="6" fill="#fff" opacity=".9"/><circle cx="82" cy="6" r="6" fill="#fff" opacity=".9"/>`;
    case 'b7':
      return `<defs><radialGradient id="bg${u}" cx=".5" cy=".4" r=".75"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#c9921a"/></radialGradient></defs><rect width="100" height="100" fill="url(#bg${u})"/>`;
    case 'b8':
      return `<rect width="100" height="100" fill="#0b1d2a"/><path d="M0 40 C25 15 45 55 70 28 S100 30 100 30 V50 C80 62 60 36 40 62 S0 56 0 56Z" fill="#2ee6a6" opacity=".55"/><path d="M0 58 C22 38 48 72 72 48 S100 52 100 52 V66 C80 78 58 56 38 78 S0 72 0 72Z" fill="#6a7bff" opacity=".4"/>`;
    default: {
      // b1: Rasen mit Mähstreifen
      const stripes = Array.from({ length: 5 }, (_, i) => `<rect x="${i * 20}" width="10" height="100" fill="#000" opacity=".07"/>`).join('');
      return `<rect width="100" height="100" fill="#3c9a62"/>${stripes}`;
    }
  }
}

// ---------- Trikots ----------
const BODY = 'M14 100 C14 80 30 72 50 72 C70 72 86 80 86 100 Z';

function outfit(id, u) {
  const clip = `<clipPath id="body${u}"><path d="${BODY}"/></clipPath>`;
  const inner = (content) => `${clip}<g clip-path="url(#body${u})">${content}</g>`;
  const collar = (fill, stroke = 'none') => `<path d="M40 72 Q50 85 60 72 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
  switch (id) {
    case 'o2':
      return inner(`<rect width="100" height="100" fill="#f4f5f6"/><rect x="14" y="72" width="72" height="3" fill="#1f2f5c" opacity=".0"/><path d="M14 90 H86" stroke="#1f2f5c" stroke-width="2.4"/>${collar('#1f2f5c')}`);
    case 'o3': {
      const s = Array.from({ length: 8 }, (_, i) => `<rect x="${14 + i * 9}" y="70" width="4.5" height="32" fill="#fff"/>`).join('');
      return inner(`<rect width="100" height="100" fill="#2b5fd9"/>${s}${collar('#fff')}`);
    }
    case 'o4':
      return inner(`<rect width="100" height="100" fill="#ffd21f"/><rect x="14" y="70" width="14" height="32" fill="#1b1b1b"/><rect x="72" y="70" width="14" height="32" fill="#1b1b1b"/>${collar('#1b1b1b')}`);
    case 'o5':
      return inner(`<rect width="100" height="100" fill="#171717"/><path d="M26 72 L22 100 M74 72 L78 100" stroke="#e0b030" stroke-width="3"/>${collar('#e0b030')}`);
    case 'o6': {
      const s = Array.from({ length: 5 }, (_, i) => `<rect x="14" y="${74 + i * 6}" width="72" height="3" fill="#0f5a2e"/>`).join('');
      return inner(`<rect width="100" height="100" fill="#1d8a4a"/>${s}${collar('#f4f5f6')}`);
    }
    case 'o7':
      return inner(`<rect width="100" height="100" fill="#6ec6ff"/><path d="M14 92 H86" stroke="#fff" stroke-width="2.4"/>${collar('#fff')}`);
    case 'o8':
      return inner(`<rect width="100" height="100" fill="#ff8a1f"/>${collar('#1b1b1b')}<path d="M30 72 L27 100" stroke="#1b1b1b" stroke-width="2.4"/><path d="M70 72 L73 100" stroke="#1b1b1b" stroke-width="2.4"/>`);
    case 'o9': {
      const cells = [];
      for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) if ((r + c) % 2 === 0) cells.push(`<rect x="${14 + c * 7.2}" y="${72 + r * 5.2}" width="7.2" height="5.2" fill="#d73535"/>`);
      return inner(`<rect width="100" height="100" fill="#f4f5f6"/>${cells.join('')}${collar('#1f2f5c')}`);
    }
    case 'o10':
      return inner(`<defs><linearGradient id="gold${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset=".5" stop-color="#e0a82a"/><stop offset="1" stop-color="#a87412"/></linearGradient></defs><rect width="100" height="100" fill="url(#gold${u})"/><path d="M14 80 L86 92 M14 90 L86 100" stroke="#8a5c08" stroke-width="2" opacity=".5"/><path d="M50 84 l2 4.4 4.8.5-3.6 3.2 1 4.7-4.2-2.4-4.2 2.4 1-4.7-3.6-3.2 4.8-.5z" fill="#fff6c8"/>${collar('#8a5c08')}`);
    default: // o1
      return inner(`<rect width="100" height="100" fill="#d73535"/>${collar('#fff')}<path d="M14 94 H86" stroke="#fff" stroke-width="2.2" opacity=".9"/>`);
  }
}

// ---------- Haare ----------
const CAP = 'M33 45 C31 27 42 21 50 21 C58 21 69 27 67 45 C64 38 60 34 50 34 C40 34 36 38 33 45 Z';

function hairBack(id, c) {
  switch (id) {
    case 'h6':
      return `<circle cx="50" cy="37" r="25" fill="${c}"/>`;
    case 'h8':
      return `<path d="M29 42 C24 64 27 86 33 92 L67 92 C73 86 76 64 71 42 C67 22 33 22 29 42 Z" fill="${c}"/>`;
    case 'h3':
      return `<path d="M62 30 C84 26 88 54 76 64 C80 50 74 42 62 38 Z" fill="${c}"/>`;
    default:
      return '';
  }
}

function hairFront(id, c) {
  switch (id) {
    case 'h0':
      return '';
    case 'h2':
      return [[36, 35, 7], [44, 28, 7], [56, 28, 7], [64, 35, 7], [33, 44, 5], [67, 44, 5], [50, 26, 7]]
        .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('');
    case 'h4':
      return `<path d="M35 40 C32 24 46 16 57 20 C68 23 69 31 66 40 C60 32 46 30 35 40 Z" fill="${c}"/><path d="M33 46 C32 40 34 36 36 34 L36 46Z M67 46 C68 40 66 36 64 34 L64 46Z" fill="${c}" opacity=".55"/>`;
    case 'h5':
      return `<path d="${CAP}" fill="${c}"/>${[0, 1, 2, 3].map((i) => `<ellipse cx="${70 + (i % 2)}" cy="${62 + i * 7}" rx="3.4" ry="4" fill="${c}"/>`).join('')}<rect x="68" y="88" width="6" height="2.4" rx="1" fill="#e23b3b"/>`;
    case 'h6':
      return `<path d="M34 42 C36 33 42 30 50 30 C58 30 64 33 66 42 C62 37 58 35 50 35 C42 35 38 37 34 42Z" fill="${c}"/>`;
    case 'h7':
      return `<path d="M33 45 C33 38 38 32 50 32 C62 32 67 38 67 45 C64 40 58 36 50 36 C42 36 36 40 33 45Z" fill="${c}" opacity=".3"/><path d="M43 33 L45 12 L49.5 24 L52 8 L55 24 L59 12 L58 33 Z" fill="${c}"/>`;
    case 'h8':
      return `<path d="M33 46 C31 28 42 21 52 21 C62 22 69 30 67 46 C64 36 56 31 46 32 C41 33 36 38 33 46Z" fill="${c}"/>`;
    case 'h9':
      return `<path d="${CAP}" fill="${c}"/><circle cx="50" cy="17" r="7.5" fill="${c}"/><rect x="43" y="22" width="14" height="2.6" rx="1.2" fill="#e23b3b"/>`;
    case 'h3':
      return `<path d="${CAP}" fill="${c}"/>`;
    default: // h1
      return `<path d="${CAP}" fill="${c}"/>`;
  }
}

// ---------- Gesicht ----------
function face(eyes, mouth, shade, hair) {
  const brow = (d) => `<path d="${d}" stroke="${hair}" stroke-width="1.8" stroke-linecap="round" fill="none"/>`;
  let e;
  switch (eyes) {
    case 'e2':
      e = `<ellipse cx="42" cy="47.5" rx="2" ry="2.3" fill="#1d1d1d"/><ellipse cx="58" cy="47.5" rx="2" ry="2.3" fill="#1d1d1d"/>${brow('M37.5 42 L46 44.2')}${brow('M62.5 42 L54 44.2')}`;
      break;
    case 'e3':
      e = `<path d="M38.5 47.5 Q42 44 45.5 47.5" stroke="#1d1d1d" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M54.5 47.5 Q58 44 61.5 47.5" stroke="#1d1d1d" stroke-width="2" stroke-linecap="round" fill="none"/>${brow('M38 41.5 Q42 39.5 46 41.5')}${brow('M54 40 Q58 36.5 62.5 39.5')}`;
      break;
    case 'e4':
      e = `<circle cx="42" cy="47" r="4.2" fill="#fff"/><circle cx="58" cy="47" r="4.2" fill="#fff"/><circle cx="42" cy="47.4" r="2.1" fill="#1d1d1d"/><circle cx="58" cy="47.4" r="2.1" fill="#1d1d1d"/>${brow('M37.5 39.8 Q42 37.5 46 39.8')}${brow('M54 39.8 Q58 37.5 62.5 39.8')}`;
      break;
    default:
      e = `<ellipse cx="42" cy="47.5" rx="2.2" ry="2.8" fill="#1d1d1d"/><ellipse cx="58" cy="47.5" rx="2.2" ry="2.8" fill="#1d1d1d"/><circle cx="42.8" cy="46.4" r=".8" fill="#fff"/><circle cx="58.8" cy="46.4" r=".8" fill="#fff"/>${brow('M38 41.8 Q42 40 46 41.8')}${brow('M54 41.8 Q58 40 62 41.8')}`;
  }
  let m;
  switch (mouth) {
    case 'm2':
      m = `<path d="M43 55 Q50 67 57 55 Z" fill="#7a2a24"/><path d="M44.4 55.4 Q50 58.4 55.6 55.4 L55.2 57.4 Q50 60 44.8 57.4Z" fill="#fff"/>`;
      break;
    case 'm3':
      m = `<path d="M45 58.5 H55" stroke="#8a3b2a" stroke-width="2" stroke-linecap="round"/>`;
      break;
    case 'm4':
      m = `<ellipse cx="50" cy="58.5" rx="3.4" ry="4.4" fill="#7a2a24"/>`;
      break;
    default:
      m = `<path d="M44 56 Q50 62 56 56" stroke="#8a3b2a" stroke-width="2" stroke-linecap="round" fill="none"/>`;
  }
  const nose = `<path d="M50 49.5 Q47.6 54.2 51.2 54.2" stroke="${shade}" stroke-width="1.5" stroke-linecap="round" fill="none"/>`;
  return e + nose + m;
}

// ---------- Zubehör ----------
function accessory(id) {
  switch (id) {
    case 'a1':
      return `<path d="M32.5 38 Q50 30 67.5 38 L67.5 43 Q50 35 32.5 43 Z" fill="#e23b3b"/><path d="M32.8 40.4 Q50 32.6 67.2 40.4" stroke="#fff" stroke-width="1.4" fill="none"/>`;
    case 'a2':
      return `<circle cx="42" cy="47.5" r="6.2" fill="#fff" fill-opacity=".18" stroke="#222" stroke-width="1.6"/><circle cx="58" cy="47.5" r="6.2" fill="#fff" fill-opacity=".18" stroke="#222" stroke-width="1.6"/><path d="M48.2 47 Q50 45.6 51.8 47" stroke="#222" stroke-width="1.6" fill="none"/><path d="M35.8 46.6 L32.6 45.2M64.2 46.6 L67.4 45.2" stroke="#222" stroke-width="1.6"/>`;
    case 'a3':
      return `<rect x="35" y="43" width="13.5" height="9" rx="3.6" fill="#16161a"/><rect x="51.5" y="43" width="13.5" height="9" rx="3.6" fill="#16161a"/><path d="M48.5 46 H51.5" stroke="#16161a" stroke-width="1.8"/><path d="M38 45.4 L42 45.4M54.5 45.4 L58.5 45.4" stroke="#fff" stroke-width="1" opacity=".5" stroke-linecap="round"/>`;
    case 'a4':
      return `<path d="M32 40 C31 20 69 20 68 40 Z" fill="#2b4fd8"/><path d="M60 39.5 Q82 38 80 44.4 L57 43Z" fill="#1d37a3"/><circle cx="50" cy="22.5" r="2.2" fill="#1d37a3"/><path d="M50 22 V39" stroke="#1d37a3" stroke-width=".9" opacity=".6"/>`;
    case 'a5':
      return `<path d="M17 86 L31 82 L32.6 91 L18.6 95 Z" fill="#ffd21f" stroke="#1b1b1b" stroke-width="1.3"/><path d="M24 84 L25.4 93" stroke="#1b1b1b" stroke-width="1.4"/>`;
    case 'a6':
      return `<path d="M30.5 47 C29 16 71 16 69.5 47" stroke="#26262b" stroke-width="3.2" fill="none" stroke-linecap="round"/><rect x="26" y="42" width="8" height="15" rx="4" fill="#26262b"/><rect x="66" y="42" width="8" height="15" rx="4" fill="#26262b"/><rect x="28" y="45" width="3.6" height="9" rx="1.8" fill="#e23b3b"/><rect x="68.4" y="45" width="3.6" height="9" rx="1.8" fill="#e23b3b"/>`;
    case 'a7':
      return `<path d="M35 31 L36.6 13 L43.4 22 L50 9 L56.6 22 L63.4 13 L65 31 Z" fill="#ffc62e" stroke="#b88a00" stroke-width="1.2" stroke-linejoin="round"/><circle cx="50" cy="26" r="2" fill="#e23b3b"/><circle cx="41" cy="27" r="1.4" fill="#3b82f6"/><circle cx="59" cy="27" r="1.4" fill="#3b82f6"/>`;
    default:
      return '';
  }
}

// ---------- Rahmen ----------
function frameSvg(id, u) {
  const ring = (stroke, w, r = 47) => `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${stroke}" stroke-width="${w}"/>`;
  const grad = (a, b, c) =>
    `<defs><linearGradient id="fr${u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${c ?? b}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
  switch (id) {
    case 'f1':
      return ring('#f4f5f2', 3, 48.2) + ring('#0e3b2c', 1, 46);
    case 'f2':
      return grad('#f0b47a', '#7d4719') + ring(`url(#fr${u})`, 6.4) + ring('#5a300e', 1, 43.8);
    case 'f3':
      return grad('#ffffff', '#7e8b96', '#c9d2d9') + ring(`url(#fr${u})`, 6.4) + ring('#5d6872', 1, 43.8);
    case 'f4':
      return grad('#fff4b0', '#c88a0c', '#f2c230') + ring(`url(#fr${u})`, 6.4) + ring('#8a5c08', 1, 43.8);
    case 'f5':
      return ring('#2f8f5b', 6.4) + `<circle cx="50" cy="50" r="47" fill="none" stroke="#1b6a41" stroke-width="6.4" stroke-dasharray="7.4 7.4"/>` + ring('#fff', 1.2, 43.6);
    case 'f6': {
      const flames = Array.from({ length: 14 }, (_, i) => {
        const a = (360 / 14) * i;
        const s = i % 2 ? 1 : 0.78;
        return `<path transform="rotate(${a} 50 50) translate(50 50) scale(${s})" d="M-4.4 -42 C-6 -46 -3 -49 -1 -54 C0 -51 1 -50 2 -52 C4 -48 5 -45 4.4 -42Z" fill="#ff8a1f"/><path transform="rotate(${a} 50 50) translate(50 50) scale(${s})" d="M-2.2 -42 C-3 -45 -1 -47 0 -50 C1.6 -47 2.6 -45 2.2 -42Z" fill="#ffd54a"/>`;
      }).join('');
      return ring('#9a2a0c', 6) + flames;
    }
    case 'f7': {
      const gems = [[50, 3.6], [96.4, 50], [50, 96.4], [3.6, 50]]
        .map(([x, y]) => `<path transform="translate(${x} ${y})" d="M0 -4.4 L2.4 0 L0 4.4 L-2.4 0Z" fill="#fff"/>`).join('');
      return grad('#d9faff', '#3a8dff', '#7fd8ff') + ring(`url(#fr${u})`, 6.6) + `<circle cx="50" cy="50" r="46.6" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.6" stroke-dasharray="2.4 5.2"/>` + gems;
    }
    default:
      return '';
  }
}

export function avatarSvg(avatar = {}, frame = 'f0', size = 64) {
  const u = ++counter;
  const a = {
    skin: 's2', hair: 'h1', hairColor: 'c2', eyes: 'e1', mouth: 'm1', outfit: 'o1', accessory: 'a0', bg: 'b1', ...avatar,
  };
  const skin = SKIN[a.skin] ?? SKIN.s2;
  const shade = SKIN_SHADE[a.skin] ?? SKIN_SHADE.s2;
  const hair = HAIR[a.hairColor] ?? HAIR.c2;
  const radius = frame === 'f0' || !frame ? 50 : 43.6;
  const ears = `<circle cx="33.2" cy="49" r="3.6" fill="${skin}"/><circle cx="66.8" cy="49" r="3.6" fill="${skin}"/>`;
  const head = `<ellipse cx="50" cy="46.5" rx="17" ry="19.5" fill="${skin}"/>`;
  const neck = `<rect x="43.5" y="60" width="13" height="16" rx="3" fill="${shade}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-hidden="true">
<defs><clipPath id="av${u}"><circle cx="50" cy="50" r="${radius}"/></clipPath></defs>
<g clip-path="url(#av${u})">${background(a.bg, u)}${hairBack(a.hair, hair)}${neck}${outfit(a.outfit, u)}${ears}${head}${face(a.eyes, a.mouth, shade, hair)}${hairFront(a.hair, hair)}${accessory(a.accessory)}</g>
${frameSvg(frame, u)}</svg>`;
}

export function avatarEl(avatar, frame, size = 48, className = '') {
  const span = document.createElement('span');
  span.className = `avatar ${className}`.trim();
  span.style.width = span.style.height = `${size}px`;
  span.innerHTML = avatarSvg(avatar, frame, size);
  return span;
}
