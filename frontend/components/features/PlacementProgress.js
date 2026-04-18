// ==========================================================================
// PlacementProgress — 3-dot meter
// ==========================================================================

import { h } from '../../js/utils/dom.js';

/**
 * PlacementProgress({ placed, total, label })
 */
export function PlacementProgress({ placed = 0, total = 3, label = 'Placed' } = {}) {
  const dots = [];
  for (let i = 0; i < total; i++) {
    const filled = i < placed;
    dots.push(h('span', {
      class: filled ? 'placement-progress__dot placement-progress__dot--filled' : 'placement-progress__dot',
    }));
  }

  return h('div', { class: 'placement-progress' },
    h('span', { class: 'placement-progress__label' }, `${label} ${placed}/${total}`),
    h('span', { class: 'placement-progress__dots' }, ...dots),
  );
}
