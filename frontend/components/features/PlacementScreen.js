/**
 * components/features/PlacementScreen.js
 * Interactive ship placement with drag/click and validation.
 * Players place exactly 3 single-cell ships.
 */

import { api } from '../../js/api.js';
import { store } from '../../js/store.js';
import { Button, showToast } from '../ui/index.js';
import { BattleGrid } from './BattleGrid.js';

const MAX_SHIPS = 3;

export function PlacementScreen({ onNavigate }) {
  const el = document.createElement('div');
  el.className = 'screen placement-screen';
  el.id = 'screen-placement';

  const gridSize   = store.get('gridSize')   || 10;
  const gameId     = store.get('gameId');
  const playerId   = store.get('playerId');
  let pendingShips = [];

  el.innerHTML = `
    <div class="placement-layout">
      <div class="placement-sidebar glass-card">
        <div class="sidebar-header">
          <span class="label-mono text-accent">Battle #${gameId}</span>
          <h2 class="display-md">Deploy Ships</h2>
          <p class="text-muted" style="font-size:var(--text-sm)">
            Place exactly <strong style="color:var(--navy-200)">3 ships</strong> on your grid.
            Click any cell to deploy. Click again to remove.
          </p>
        </div>

        <div class="ship-inventory" id="ship-inventory"></div>

        <div class="divider"></div>

        <div class="placement-actions" id="placement-actions"></div>

        <div class="placement-rules glass-card" style="background:rgba(6,14,28,0.5)">
          <div class="label-mono text-accent" style="margin-bottom:var(--space-2)">Rules</div>
          <ul class="rules-list">
            <li>3 single-cell ships per player</li>
            <li>No overlapping positions</li>
            <li>Stay within the grid bounds</li>
            <li>All players must place before firing</li>
          </ul>
        </div>
      </div>

      <div class="placement-board-area" id="placement-board-area">
        <div class="placement-grid-wrap" id="placement-grid"></div>
        <div class="placement-status" id="placement-status">
          <span class="label-mono text-muted">Click cells to deploy your ships</span>
        </div>
      </div>
    </div>
  `;

  // ── Ship Inventory ────────────────────────────────────
  function renderInventory() {
    const inv = el.querySelector('#ship-inventory');
    inv.innerHTML = '';

    for (let i = 0; i < MAX_SHIPS; i++) {
      const item = document.createElement('div');
      const placed = i < pendingShips.length;
      item.className = `ship-inventory-item${placed ? ' ship-inventory-item--placed' : ''}`;
      item.innerHTML = `
        <div class="ship-inv-icon">
          <div class="ship-inv-cell${placed ? ' ship-inv-cell--placed' : ''}"></div>
        </div>
        <div class="ship-inv-info">
          <span class="ship-inv-name">Ship ${i + 1}</span>
          <span class="label-mono ship-inv-status">${placed
            ? `A${pendingShips[i].col} — ${pendingShips[i].row + 1}`
            : 'Undeployed'
          }</span>
        </div>
        <div class="ship-inv-badge">${placed ? '✓' : '○'}</div>
      `;

      if (placed) {
        item.addEventListener('click', () => removeShip(i));
        item.title = 'Click to remove';
        item.style.cursor = 'pointer';
      }
      inv.appendChild(item);
    }
  }

  // ── Actions ───────────────────────────────────────────
  const clearBtn  = Button({ label: 'Clear All', variant: 'ghost', size: 'sm' });
  const submitBtn = Button({
    label: 'Confirm Deployment',
    variant: 'primary',
    size: 'lg',
    icon: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 8l4 4 8-8"/></svg>`,
  });
  submitBtn.style.width = '100%';
  submitBtn.disabled = true;

  clearBtn.addEventListener('click', () => {
    pendingShips.forEach(s => grid.clearPendingShip(s.row, s.col));
    pendingShips = [];
    renderInventory();
    updateStatus();
    submitBtn.disabled = true;
  });

  submitBtn.addEventListener('click', async () => {
    if (pendingShips.length !== MAX_SHIPS) return;
    submitBtn.setLoading(true);
    try {
      await api.placeShips(gameId, playerId, pendingShips);
      store.set({ myShips: [...pendingShips], shipsPlaced: true });
      showToast({ message: 'Ships deployed! Waiting for battle to start…', type: 'success', duration: 4000 });
      onNavigate('game');
    } catch (e) {
      showToast({ message: e.message, type: 'error' });
    } finally {
      submitBtn.setLoading(false);
    }
  });

  const actions = el.querySelector('#placement-actions');
  const actRow  = document.createElement('div');
  actRow.style.display = 'flex';
  actRow.style.gap = 'var(--space-2)';
  actRow.appendChild(clearBtn);
  actRow.appendChild(submitBtn);
  actions.appendChild(actRow);

  // ── Grid ──────────────────────────────────────────────
  const COL_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'];

  const grid = BattleGrid({
    size: gridSize,
    mode: 'placement',
    ships: [],
    pendingShips: [],
    onCellClick: ({ row, col }) => toggleShip(row, col),
    label: 'Your Waters',
    sublabel: `${gridSize} × ${gridSize} Grid`,
  });

  el.querySelector('#placement-grid').appendChild(grid);

  // ── Ship toggle logic ─────────────────────────────────
  function toggleShip(row, col) {
    const existing = pendingShips.findIndex(s => s.row === row && s.col === col);

    if (existing !== -1) {
      removeShip(existing);
      return;
    }

    if (pendingShips.length >= MAX_SHIPS) {
      showToast({ message: 'All 3 ships deployed. Remove one to reposition.', type: 'info' });
      return;
    }

    pendingShips.push({ row, col });
    grid.addPendingShip(row, col);
    renderInventory();
    updateStatus();

    if (pendingShips.length === MAX_SHIPS) {
      submitBtn.disabled = false;
      showToast({ message: 'All ships placed! Confirm when ready.', type: 'success' });
    }
  }

  function removeShip(index) {
    const ship = pendingShips[index];
    pendingShips.splice(index, 1);
    grid.clearPendingShip(ship.row, ship.col);
    renderInventory();
    updateStatus();
    submitBtn.disabled = pendingShips.length !== MAX_SHIPS;
  }

  function updateStatus() {
    const status = el.querySelector('#placement-status');
    const remaining = MAX_SHIPS - pendingShips.length;
    if (remaining === 0) {
      status.innerHTML = `<span class="label-mono" style="color:var(--navy-300)">✓ All ships placed — confirm deployment</span>`;
    } else {
      status.innerHTML = `<span class="label-mono text-muted">Deploy ${remaining} more ship${remaining !== 1 ? 's' : ''}</span>`;
    }
  }

  renderInventory();

  return el;
}
