// ==========================================================================
// Storage — namespaced localStorage wrapper
// ==========================================================================

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
      // Silently ignore — quota or privacy mode
    }
  },

  remove(k) {
    try { localStorage.removeItem(key(k)); }
    catch { /* ignore */ }
  },

  clear() {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(NS + '.')) toRemove.push(k);
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
  },
};
