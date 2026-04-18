// ==========================================================================
// Identity — avatar + name pill
// ==========================================================================

import { h } from '../../js/utils/dom.js';
import { initials } from '../../js/utils/format.js';

/**
 * Identity({ name, me, large })
 */
export function Identity({ name = '', me = false, large = false } = {}) {
  const classes = ['identity'];
  if (me) classes.push('identity--me');
  if (large) classes.push('identity--lg');

  return h('div', { class: classes.join(' ') },
    h('div', { class: 'identity__avatar' }, initials(name)),
    h('div', { class: 'identity__name' }, name || 'Unknown'),
  );
}
