// ==========================================================================
// Loader — spinner wrapper for loading states
// ==========================================================================

import { h } from '../../js/utils/dom.js';

/**
 * Loader({ label, size, center })
 * size: sm | md (default) | lg
 * center: if true, adds vertical padding and centers in parent
 */
export function Loader({ label = '', size = 'md', center = false } = {}) {
  const classes = ['loader'];
  if (size === 'lg') classes.push('loader--lg');
  if (center) classes.push('loader--center');

  return h('div', { class: classes.join(' '), attrs: { role: 'status', 'aria-live': 'polite' } },
    h('div', { class: 'loader__spinner' }),
    label && h('span', {}, label),
  );
}
