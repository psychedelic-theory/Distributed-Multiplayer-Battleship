/**
 * format.js — Small formatters.
 */

/**
 * Format an ISO timestamp or Date into HH:MM:SS (local).
 */
export function formatClock(value) {
  if (!value) return '--:--:--';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString([], {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Produce compact relative time (e.g. "2m ago", "just now").
 */
export function relativeTime(value) {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 5)   return 'just now';
  if (diff < 60)  return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

/**
 * Get initials for an avatar bubble.
 */
export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/[\s_]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Convert a numeric column (0..25) into the letter "A"..."Z".
 */
export function colLetter(col) {
  return String.fromCharCode(65 + col);
}

/**
 * Normalize a base URL — strip trailing slashes, validate protocol.
 */
export function normalizeBaseUrl(url) {
  if (!url) return '';
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) {
    u = 'https://' + u;
  }
  // strip trailing slash(es)
  u = u.replace(/\/+$/, '');
  return u;
}

/**
 * Format accuracy as a percent string.
 * Server returns either 0..1 OR 0..100. We normalize defensively.
 */
export function formatAccuracy(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}
