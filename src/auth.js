// Konten ohne E-Mail: Name + 4-stellige PIN innerhalb einer Gruppe (Familie).
const enc = new TextEncoder();

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

export const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(12)));
export const hashPin = (salt, pin) => sha256(`${salt}:${pin}`);
export const newToken = () => crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '');

// Ohne 0/O/1/I, damit sich der Code leicht abtippen lässt
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newGroupCode() {
  return [...crypto.getRandomValues(new Uint8Array(6))].map((x) => ALPHABET[x % ALPHABET.length]).join('');
}

export const NAME_RE = /^[\p{L}\p{N} ._-]{2,16}$/u;
export const PIN_RE = /^\d{4}$/;

export const MAX_FAILS = 5;
export const LOCK_SECONDS = 60;
