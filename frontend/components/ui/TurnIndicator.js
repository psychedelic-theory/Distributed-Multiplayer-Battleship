// ==========================================================================
// TurnIndicator — the turn ribbon
// ==========================================================================

import { h } from '../../js/utils/dom.js';

/**
 * TurnIndicator({ mode, whoName })
 * mode: 'mine' | 'theirs' | 'finished'
 */
export function TurnIndicator({ mode = 'theirs', whoName = '' } = {}) {
  const classes = ['turn-indicator', `turn-indicator--${mode}`];

  let text;
  if (mode === 'mine')     text = h('span', { class: 'turn-indicator__label' }, 'Your turn — ', h('span', { class: 'turn-indicator__who' }, 'fire when ready'));
  else if (mode === 'theirs') text = h('span', { class: 'turn-indicator__label' }, 'Waiting on ', h('span', { class: 'turn-indicator__who' }, whoName || 'opponent'), '…');
  else                     text = h('span', { class: 'turn-indicator__label' }, 'Game over');

  return h('div', { class: classes.join(' ') }, text);
}
