// ==========================================================================
// StatPill — a metric display (label + value)
// ==========================================================================

import { h } from '../../js/utils/dom.js';

/**
 * StatPill({ label, value, small })
 */
export function StatPill({ label, value, small = false } = {}) {
  return h('div', { class: 'stat' },
    h('div', { class: 'stat__label' }, label),
    h('div', { class: small ? 'stat__value stat__value--sm' : 'stat__value' }, value ?? '—'),
  );
}

/**
 * StatsRow(stats)
 * stats: [{ label, value }]
 */
export function StatsRow(stats = []) {
  return h('div', { class: 'stats-row' },
    ...stats.map(s => StatPill(s)),
  );
}
