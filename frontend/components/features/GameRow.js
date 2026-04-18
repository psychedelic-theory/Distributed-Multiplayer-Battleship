// ==========================================================================
// GameRow — a row in the lobby game list
// ==========================================================================

import { h } from '../../js/utils/dom.js';
import { Button } from '../ui/Button.js';
import { GameStatusBadge } from '../ui/Badge.js';

/**
 * GameRow({ game, onJoin, onView, isMember, canJoin })
 *   game: normalized game object
 */
export function GameRow({ game, onJoin, onView, isMember = false, canJoin = true } = {}) {
  const id = game.game_id;
  const grid = game.grid_size ?? '?';
  const active = game.active_players ?? (game.players ? game.players.length : '?');
  const max = game.max_players ?? '?';
  const status = game.status || 'unknown';

  const isWaiting = status === 'waiting';
  const isActive = status === 'active';
  const isFinished = status === 'finished';
  const isFull = active !== '?' && max !== '?' && active >= max;

  // Decide the action button
  let action;
  if (isMember && (isWaiting || isActive)) {
    action = Button({ variant: 'teal', size: 'sm', onClick: () => onView?.(game), children: 'Open' });
  } else if (isWaiting && !isFull && canJoin) {
    action = Button({ variant: 'primary', size: 'sm', onClick: () => onJoin?.(game), children: 'Join' });
  } else if (isFull && isWaiting) {
    action = Button({ variant: 'ghost', size: 'sm', disabled: true, children: 'Full' });
  } else if (isActive && !isMember) {
    action = Button({ variant: 'ghost', size: 'sm', disabled: true, children: 'In progress' });
  } else if (isFinished) {
    action = Button({ variant: 'ghost', size: 'sm', disabled: true, children: 'Finished' });
  } else {
    action = Button({ variant: 'ghost', size: 'sm', disabled: true, children: '—' });
  }

  return h('div', { class: 'game-row' },
    h('div', { class: 'game-row__id' }, `#${id}`),
    h('div', { class: 'game-row__meta' },
      h('div', { class: 'game-row__title' }, `Game ${id}`),
      h('div', { class: 'game-row__sub' }, `${grid}×${grid} · ${active}/${max} players`),
    ),
    GameStatusBadge(status),
    action,
  );
}
