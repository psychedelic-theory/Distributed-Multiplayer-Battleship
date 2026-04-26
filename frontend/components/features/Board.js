// ==========================================================================
// Placement screen — place 3 ships; poll for game status to transition.
// Ship definitions (ship_index matches DB):
//   0 = Battleship (5 cells)
//   1 = Cruiser    (3 cells)
//   2 = Destroyer  (2 cells)
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

// ship_index: 0=Battleship(5), 1=Cruiser(3), 2=Destroyer(2)
const SHIP_DEFS = [
  { shipIndex: 0, name: 'Battleship', size: 5 },
  { shipIndex: 1, name: 'Cruiser',    size: 3 },
  { shipIndex: 2, name: 'Destroyer',  size: 2 },
];

const POLL_INTERVAL_MS = 2000;

export function render(mountEl) {
  // placedShips[shipIndex] = [{row, col}, ...] | null
  let placedShips = [null, null, null];
  // Index into SHIP_DEFS for the ship currently being placed
  let currentStep = 0;
  let orientation = 'horizontal'; // 'horizontal' | 'vertical'
  let confirming = false;
  let submitted = false;

  const rerender = () => {
    mount(mountEl, build());
    if (!submitted) setupBoardHover();
  };

  // ---- Helpers ----

  function getAllPlacedCells() {
    const cells = [];
    for (let i = 0; i < placedShips.length; i++) {
      if (placedShips[i]) {
        for (const cell of placedShips[i]) {
          cells.push({ row: cell.row, col: cell.col, shipIndex: i });
        }
      }
    }
    return cells;
  }

  function allPlaced() {
    return placedShips.every(Boolean);
  }

  function placedCount() {
    return placedShips.filter(Boolean).length;
  }

  function getPreviewCells(row, col) {
    if (currentStep >= SHIP_DEFS.length) return { cells: [], valid: false };
    const def = SHIP_DEFS[currentStep];
    const gridSize = store.get().game?.grid_size || 8;
    const cells = [];
    for (let i = 0; i < def.size; i++) {
      cells.push(orientation === 'horizontal'
        ? { row, col: col + i }
        : { row: row + i, col });
    }
    const placedSet = new Set(getAllPlacedCells().map(c => `${c.row},${c.col}`));
    const valid = cells.every(c =>
      c.row >= 0 && c.row < gridSize &&
      c.col >= 0 && c.col < gridSize &&
      !placedSet.has(`${c.row},${c.col}`)
    );
    return { cells, valid };
  }

  // ---- Board hover: direct DOM manipulation, no full rerender ----

  function setupBoardHover() {
    const boardEl = mountEl.querySelector('.placement-layout .board');
    if (!boardEl) return;
    boardEl.addEventListener('mousemove', handleBoardMouseMove);
    boardEl.addEventListener('mouseleave', clearBoardPreview);
  }

  function handleBoardMouseMove(e) {
    if (currentStep >= SHIP_DEFS.length) return;
    const cellEl = e.target.closest('[data-row]');
    if (!cellEl) return;
    const row = parseInt(cellEl.getAttribute('data-row'));
    const col = parseInt(cellEl.getAttribute('data-col'));
    if (isNaN(row) || isNaN(col)) return;
    const boardEl = mountEl.querySelector('.placement-layout .board');
    if (boardEl) updateBoardPreview(boardEl, row, col);
  }

  function updateBoardPreview(boardEl, row, col) {
    clearBoardPreview();
    if (currentStep >= SHIP_DEFS.length) return;
    const { cells, valid } = getPreviewCells(row, col);
    const cls = valid ? 'cell--preview-valid' : 'cell--preview-invalid';
    for (const { row: r, col: c } of cells) {
      const el = boardEl.querySelector(`[data-row="${r}"][data-col="${c}"]`);
      if (el) { el.setAttribute('data-preview', '1'); el.classList.add(cls); }
    }
  }

  function clearBoardPreview() {
    const boardEl = mountEl.querySelector('.placement-layout .board');
    if (!boardEl) return;
    boardEl.querySelectorAll('[data-preview]').forEach(el => {
      el.removeAttribute('data-preview');
      el.classList.remove('cell--preview-valid', 'cell--preview-invalid');
    });
  }

  // ---- Orientation toggle ----

  function toggleOrientation() {
    orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
    rerender();
  }

  function handleKeydown(e) {
    if (submitted) return;
    if (store.get().screen !== 'placement') {
      document.removeEventListener('keydown', handleKeydown);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      toggleOrientation();
    }
  }
  document.addEventListener('keydown', handleKeydown);

  // ---- Cell click handler ----

  function handleCellClick(row, col) {
    if (submitted) return;
    const allCells = getAllPlacedCells();

    // Clicking on a placed ship cell → remove that ship and go back to placing it
    const hit = allCells.find(c => c.row === row && c.col === col);
    if (hit) {
      const si = hit.shipIndex;
      placedShips[si] = null;
      currentStep = SHIP_DEFS.findIndex(d => d.shipIndex === si);
      store.set({ myShips: getAllPlacedCells() });
      rerender();
      return;
    }

    if (currentStep >= SHIP_DEFS.length) return;
    const { cells, valid } = getPreviewCells(row, col);
    if (!valid) {
      toast.warn('Invalid placement', 'Ship goes out of bounds or overlaps another.');
      return;
    }

    const si = SHIP_DEFS[currentStep].shipIndex;
    placedShips[si] = cells;

    // Advance to next unplaced ship
    let next = currentStep + 1;
    while (next < SHIP_DEFS.length && placedShips[SHIP_DEFS[next].shipIndex] !== null) next++;
    currentStep = next;

    store.set({ myShips: getAllPlacedCells() });
    rerender();
  }

  // ---- Clear all ----

  function clearAll() {
    if (submitted) return;
    placedShips = [null, null, null];
    currentStep = 0;
    store.set({ myShips: [] });
    rerender();
  }

  // ---- Confirm ----

  async function confirm() {
    const { gameId, player } = store.get();
    if (!gameId || !player) return;
    if (!allPlaced()) { toast.error('Place all ships first.'); return; }
    confirming = true;
    rerender();
    try {
      const client = session.getClient(store.get().serverUrl);
      const flatShips = [];
      for (let i = 0; i < placedShips.length; i++) {
        for (const cell of placedShips[i]) {
          flatShips.push({ row: cell.row, col: cell.col, ship_index: i });
        }
      }
      await client.placeShips(gameId, player.player_id, flatShips);
      submitted = true;
      store.set({ myShips: getAllPlacedCells() });
      toast.success('Ships placed', 'Waiting for opponent…');
    } catch (err) {
      toast.error('Placement failed', err.message);
    } finally {
      confirming = false;
      rerender();
    }
  }

  // ---- Build ----

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
    const placed = placedCount();
    const currentDef = currentStep < SHIP_DEFS.length ? SHIP_DEFS[currentStep] : null;

    const subtitle = submitted
      ? 'Ships locked in. Waiting for every player to finish placing…'
      : currentDef
        ? `Placing ${currentDef.name} (${currentDef.size} cells) · click to place, R to rotate`
        : 'All ships placed! Confirm when ready.';

    return h('div', { class: 'screen fade-in' },
      h('div', { class: 'screen__header row-between' },
        h('div', {},
          h('h1', {}, `Game #${gameId}`),
          h('div', { class: 'subtitle' }, subtitle),
        ),
        PlacementProgress({ placed, total: SHIP_DEFS.length }),
      ),

      h('div', { class: 'placement-layout' },
        // Left: Board
        Board({
          mode: submitted ? 'own' : 'placement',
          gridSize,
          ships: getAllPlacedCells(),
          onCellClick: submitted ? null : handleCellClick,
          ownerName: player.username,
          role: submitted ? 'Locked' : 'Place ships',
        }),

        // Right: sidebar
        h('aside', { class: 'stack' },
          Card({
            children: h('div', { class: 'stack' },
              h('h3', { class: 'card__title' }, 'Your Fleet'),

              // Ship list
              h('div', { class: 'ship-list' },
                ...SHIP_DEFS.map(def => {
                  const isPlaced = placedShips[def.shipIndex] !== null;
                  const isCurrent = !submitted && currentStep < SHIP_DEFS.length && SHIP_DEFS[currentStep].shipIndex === def.shipIndex;
                  return h('div', {
                    class: [
                      'ship-item',
                      isCurrent ? 'ship-item--active' : '',
                      isPlaced ? 'ship-item--placed' : '',
                    ].filter(Boolean).join(' '),
                  },
                    h('div', { class: 'ship-item__info' },
                      h('span', { class: `ship-item__name ship-item__name--${def.shipIndex}` }, def.name),
                      h('span', { class: 'ship-item__size' }, `${def.size} cells`),
                    ),
                    h('div', { class: 'ship-item__visual' },
                      ...Array.from({ length: def.size }, () =>
                        h('span', { class: `ship-item__cell ship-item__cell--${def.shipIndex}` })
                      ),
                    ),
                    isPlaced && !submitted && h('button', {
                      class: 'ship-item__remove',
                      attrs: { title: `Remove ${def.name}`, 'aria-label': `Remove ${def.name}` },
                      onClick: (e) => {
                        e.stopPropagation();
                        placedShips[def.shipIndex] = null;
                        currentStep = SHIP_DEFS.findIndex(d => d.shipIndex === def.shipIndex);
                        store.set({ myShips: getAllPlacedCells() });
                        rerender();
                      },
                    }, '×'),
                  );
                }),
              ),

              // Orientation toggle (only when there's a ship to place)
              !submitted && currentDef && h('div', { class: 'orientation-toggle' },
                h('span', { class: 'orientation-toggle__label' }, 'Direction'),
                h('div', { class: 'orientation-toggle__buttons' },
                  h('button', {
                    class: `orientation-btn ${orientation === 'horizontal' ? 'orientation-btn--active' : ''}`,
                    onClick: () => { orientation = 'horizontal'; rerender(); },
                  }, '→ Horizontal'),
                  h('button', {
                    class: `orientation-btn ${orientation === 'vertical' ? 'orientation-btn--active' : ''}`,
                    onClick: () => { orientation = 'vertical'; rerender(); },
                  }, '↓ Vertical'),
                ),
                h('span', { class: 'orientation-toggle__hint' }, 'Press R to rotate'),
              ),

              !submitted && h('div', { class: 'stack-sm' },
                Button({
                  variant: 'primary',
                  block: true,
                  loading: confirming,
                  disabled: !allPlaced(),
                  onClick: confirm,
                  children: `Confirm Fleet (${placed}/3)`,
                }),
                Button({
                  variant: 'ghost',
                  size: 'sm',
                  block: true,
                  disabled: placed === 0,
                  onClick: clearAll,
                  children: 'Clear all',
                }),
              ),
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

  // Polling: detect game status transitions only; no rerender on tick to avoid disrupting hover.
  session.startPolling(async () => {
    const { gameId } = store.get();
    if (!gameId) return;
    try {
      const client = session.getClient(store.get().serverUrl);
      const freshGame = await client.getGame(gameId);
      const prevStatus = store.get().game?.status;
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
      if (prevStatus !== freshGame.status) {
        rerender();
      }
    } catch (_err) {
      // non-fatal
    }
  }, POLL_INTERVAL_MS);
}