// ==========================================================================
// MoveLog — chronological list of moves with timestamps
// ==========================================================================

import { h } from '../../js/utils/dom.js';
import { coordLabel, relativeTime } from '../../js/utils/format.js';

/**
 * MoveLog({ moves, nameLookup, maxItems, newestFirst })
 *   moves:      [{ player_id, row, col, result, timestamp }]
 *   nameLookup: (playerId) => string
 *   newestFirst: default true
 */
export function MoveLog({
  moves = [],
  nameLookup = (id) => `Player ${id}`,
  maxItems = 50,
  newestFirst = true,
} = {}) {
  if (!moves || moves.length === 0) {
    return h('div', { class: 'move-log' },
      h('div', { class: 'move-log__empty' }, 'No shots fired yet.'),
    );
  }

  const ordered = newestFirst ? [...moves].reverse() : [...moves];
  const sliced = ordered.slice(0, maxItems);

  return h('div', { class: 'move-log' },
    ...sliced.map(m => {
      const result = m.result === 'hit' ? 'hit' : 'miss';
      const time = m.timestamp ? relativeTime(m.timestamp) : '';
      return h('div', { class: 'move-log__item' },
        h('span', { class: `move-log__result move-log__result--${result}` }, result),
        h('span', { class: 'move-log__detail' },
          h('strong', {}, nameLookup(m.player_id)),
          ' → ',
          coordLabel(m.row, m.col),
        ),
        time && h('span', { class: 'move-log__time' }, time),
      );
    }),
  );
}
