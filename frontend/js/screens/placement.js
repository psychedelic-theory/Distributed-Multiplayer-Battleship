// ==========================================================================
// Placement screen — place 3 ships; poll for game status to transition.
// ==========================================================================

import { h, mount } from '../utils/dom.js';
import { store } from '../state/store.js';
import { session } from '../state/session.js';
import { toast } from '../utils/toast.js';
import { Card } from '../../components/ui/Card.js';
import { Button } from '../../components/ui/Button.js';
import { Loader } from '../../components/ui/Loader.js';
import { Board } from '../../components/features/Board.js';
import { PlacementProgress } from '../../components/features/PlacementProgress.js';

const MAX_SHIPS = 3;
const POLL_INTERVAL_MS = 2000;

export function render(mountEl) {
  let ships = [...(store.get().myShips || [])];
  let confirming = false;
  let confirmed = ships.length === MAX_SHIPS && (store.get().myShips || []).length === MAX_SHIPS;
  // Note: once submitted to server, we don't let the user edit further. Track locally.
  let submitted = false;

  const rerender = () => mount(mountEl, build());

  function toggleCell(row, col) {
    if (submitted) return;
    const idx = ships.findIndex(s => s.row === row && s.col === col);
    if (idx >= 0) {
      ships.splice(idx, 1);
    } else {
      if (ships.length >= MAX_SHIPS) {
        toast.warn('Max ships placed', 'Remove one before adding another.');
        return;
      }
      ships.push({ row, col });
    }
    store.set({ myShips: [...ships] });
    rerender();
  }

  function clearAll() {
    if (submitted) return;
    ships = [];
    store.set({ myShips: [] });
    rerender();
  }

  async function confirm() {
    const { gameId, player } = store.get();
    if (!gameId || !player) return;
    if (ships.length !== MAX_SHIPS) {
      toast.error('Place all 3 ships first.');
      return;
    }
    confirming = true;
    rerender();
    try {
      const client = session.getClient(store.get().serverUrl);
      await client.placeShips(gameId, player.player_id, ships);
      submitted = true;
      store.set({ myShips: [...ships] });
      toast.success('Ships placed', 'Waiting for opponent…');
      // Note: the polling loop started at the end of render() already watches game status
      // and will transition screens when status becomes 'active' or 'finished'.
    } catch (err) {
      toast.error('Placement failed', err.message);
    } finally {
      confirming = false;
      rerender();
    }
  }

  function build() {
    const { game, gameId, player } = store.get();

    if (!game || !player) {
      return h('div', { class: 'screen screen--narrow' },
        Loader({ label: 'Loading game…', center: true }),
      );
    }

    const gridSize = game.grid_size || 8;
    const active = game.active_players ?? '?';
    const max = game.max_players ?? '?';

    return h('div', { class: 'screen fade-in' },
      h('div', { class: 'screen__header row-between' },
        h('div', {},
          h('h1', {}, `Game #${gameId}`),
          h('div', { class: 'subtitle' }, submitted
            ? 'Ships locked in. Waiting for every player to finish placing…'
            : 'Place your 3 ships. Tap a cell to place or remove.'),
        ),
        PlacementProgress({ placed: ships.length, total: MAX_SHIPS }),
      ),

      h('div', { class: 'placement-layout' },
        // Left: Board
        Board({
          mode: submitted ? 'own' : 'placement',
          gridSize,
          ships,
          onCellClick: submitted ? null : toggleCell,
          ownerName: player.username,
          role: submitted ? 'Locked' : 'Place ships',
          maxShips: MAX_SHIPS,
        }),

        // Right: sidebar
        h('aside', { class: 'stack' },
          Card({
            children: h('div', { class: 'stack' },
              h('h3', { class: 'card__title' }, 'Placement'),
              h('p', { class: 'card__meta' },
                submitted
                  ? 'Your fleet is ready. Waiting for opponents.'
                  : 'Pick any 3 cells. No overlap, inside the grid.'),
              !submitted && h('div', { class: 'row' },
                Button({
                  variant: 'primary',
                  block: true,
                  loading: confirming,
                  disabled: ships.length !== MAX_SHIPS,
                  onClick: confirm,
                  children: `Confirm (${ships.length}/${MAX_SHIPS})`,
                }),
              ),
              !submitted && Button({
                variant: 'ghost',
                size: 'sm',
                block: true,
                disabled: ships.length === 0,
                onClick: clearAll,
                children: 'Clear all',
              }),
              submitted && Loader({ label: 'Waiting for opponent…' }),
            ),
          }),

          Card({
            children: h('div', { class: 'stack-sm' },
              h('h3', { class: 'card__title' }, 'Game info'),
              h('div', { class: 'row-between' },
                h('span', { style: { color: 'var(--color-text-mute)', fontSize: 'var(--fs-sm)' } }, 'Grid'),
                h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)' } }, `${gridSize}×${gridSize}`),
              ),
              h('div', { class: 'row-between' },
                h('span', { style: { color: 'var(--color-text-mute)', fontSize: 'var(--fs-sm)' } }, 'Players'),
                h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)' } }, `${active}/${max}`),
              ),
              h('div', { class: 'row-between' },
                h('span', { style: { color: 'var(--color-text-mute)', fontSize: 'var(--fs-sm)' } }, 'Status'),
                h('span', { style: { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-sm)' } }, game.status || '—'),
              ),
            ),
          }),
        ),
      ),
    );
  }

  rerender();

  // Polling loop: ONLY checks if the game status changed (e.g. opponent joined,
  // opponent placed, game activated). Does NOT call rerender() — rerendering
  // would rebuild the board DOM and disrupt ship-placement clicks.
  //
  // Why? Polling is purely to detect a screen transition. The ships grid is
  // driven by user input, not server state, so it must not be redrawn on polls.
  session.startPolling(async () => {
    const { gameId } = store.get();
    if (!gameId) return;
    try {
      const client = session.getClient(store.get().serverUrl);
      const freshGame = await client.getGame(gameId);
      const prevStatus = store.get().game?.status;
      // Silently update the store so the info sidebar reflects player counts,
      // but don't force a full rerender unless something interesting happened.
      store.set({ game: freshGame });

      if (submitted && freshGame.status === 'active') {
        session.stopPolling();
        store.set({ screen: 'game' });
        return;
      }
      if (freshGame.status === 'finished') {
        session.stopPolling();
        store.set({ screen: 'end' });
        return;
      }

      // Only rerender if the player count or status actually changed — this keeps
      // the sidebar accurate without disrupting the user's placement interactions.
      if (prevStatus !== freshGame.status) {
        rerender();
      }
    } catch (err) {
      // non-fatal — stay on this screen
    }
  }, POLL_INTERVAL_MS);
}
