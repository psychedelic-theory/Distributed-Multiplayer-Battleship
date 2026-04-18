/**
 * storage.js — Wrapped localStorage. Safe-failing.
 */

const NS = 'battleship.v1';

function key(k) { return `${NS}.${k}`; }

export const storage = {
  get(k, fallback = null) {
    try {
      const raw = localStorage.getItem(key(k));
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(k, value) {
    try {
      localStorage.setItem(key(k), JSON.stringify(value));
    } catch {
      /* ignore quota errors */
    }
  },

  remove(k) {
    try { localStorage.removeItem(key(k)); } catch {}
  },
};
