// ==========================================================================
// ServerPill — current server connection pill
// ==========================================================================

import { h } from '../../js/utils/dom.js';

/**
 * ServerPill({ url, onDisconnect })
 */
export function ServerPill({ url, onDisconnect } = {}) {
  // Strip scheme for display compactness
  const display = (url || '').replace(/^https?:\/\//, '');

  return h('div', { class: 'server-pill', attrs: { title: url || '' } },
    h('span', { class: 'server-pill__dot' }),
    h('span', { class: 'server-pill__url' }, display || 'Not connected'),
    onDisconnect && h('button', {
      class: 'server-pill__disconnect',
      onClick: onDisconnect,
      attrs: { 'aria-label': 'Disconnect' },
    }, 'disconnect'),
  );
}
