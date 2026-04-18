// ==========================================================================
// WinnerBanner — victory or defeat announcement
// ==========================================================================

import { h } from '../../js/utils/dom.js';

/**
 * WinnerBanner({ victory, winnerName, subtitle })
 */
export function WinnerBanner({ victory = false, winnerName = '', subtitle = '' } = {}) {
  const classes = ['winner-banner', victory ? 'winner-banner--victory' : 'winner-banner--defeat'];

  const icon = victory ? '🏆' : '⚓';
  const title = victory ? 'Victory!' : 'Defeated';
  const sub = subtitle || (victory
    ? `You sank every opposing ship, ${winnerName || 'Captain'}.`
    : `${winnerName || 'The opponent'} claimed the sea this time.`);

  return h('div', { class: classes.join(' ') },
    h('div', { class: 'winner-banner__icon' }, icon),
    h('div', { class: 'winner-banner__title' }, title),
    h('div', { class: 'winner-banner__sub' }, sub),
  );
}
