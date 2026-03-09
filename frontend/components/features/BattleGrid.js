/**
 * components/features/BattleGrid.js
 * Renders an interactive or display-only Battleship grid.
 *
 * Modes:
 *   'placement' — click to place ships, shows pending ship cells
 *   'attack'    — click to fire at enemy, shows shot history
 *   'defense'   — shows your own board with ships + incoming hits
 *   'readonly'  — display only, no interaction
 */

const COL_LABELS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'];
const ROW_LABELS = Array.from({ length: 15 }, (_, i) => i + 1);

export function BattleGrid({
  size       = 10,
  mode       = 'readonly',  // 'placement' | 'attack' | 'defense' | 'readonly'
  ships      = [],           // [{row,col}] — cells with ships
  shots      = [],           // [{row,col,result}] — fired shots
  pendingShips = [],         // [{row,col}] — ships being placed
  disabled   = false,
  onCellClick = () => {},
  label      = '',
  sublabel   = '',
} = {}) {
  const container = document.createElement('div');
  container.className = 'battle-grid-wrap';

  // ── Label ──────────────────────────────────────────────
  if (label) {
    const hd = document.createElement('div');
    hd.className = 'grid-header';
    hd.innerHTML = `
      <span class="display-md">${label}</span>
      ${sublabel ? `<span class="label-mono text-muted">${sublabel}</span>` : ''}
    `;
    container.appendChild(hd);
  }

  // ── Grid wrapper ───────────────────────────────────────
  const gridWrap = document.createElement('div');
  gridWrap.className = 'battle-grid';
  gridWrap.style.setProperty('--grid-size', size);

  // Build lookup sets for fast rendering
  const shipSet    = new Set(ships.map(s => `${s.row},${s.col}`));
  const pendingSet = new Set(pendingShips.map(s => `${s.row},${s.col}`));
  const shotMap    = new Map(shots.map(s => [`${s.row},${s.col}`, s.result]));

  // ── Column headers ─────────────────────────────────────
  const colHead = document.createElement('div');
  colHead.className = 'grid-col-headers';
  colHead.innerHTML = `<div class="grid-corner"></div>`; // top-left corner spacer
  for (let c = 0; c < size; c++) {
    const lbl = document.createElement('div');
    lbl.className = 'grid-axis-label';
    lbl.textContent = COL_LABELS[c];
    colHead.appendChild(lbl);
  }
  gridWrap.appendChild(colHead);

  // ── Grid rows ──────────────────────────────────────────
  const cells = [];

  for (let r = 0; r < size; r++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'grid-row';

    // Row number
    const rowLbl = document.createElement('div');
    rowLbl.className = 'grid-axis-label grid-row-label';
    rowLbl.textContent = ROW_LABELS[r];
    rowEl.appendChild(rowLbl);

    for (let c = 0; c < size; c++) {
      const key    = `${r},${c}`;
      const isShip = shipSet.has(key);
      const isPend = pendingSet.has(key);
      const result = shotMap.get(key);

      const cell = document.createElement('div');
      cell.className  = 'grid-cell';
      cell.dataset.r  = r;
      cell.dataset.c  = c;

      // Apply state classes
      if (isPend)            cell.classList.add('grid-cell--pending');
      else if (isShip)       cell.classList.add('grid-cell--ship');

      if (result === 'hit')  cell.classList.add('grid-cell--hit');
      if (result === 'miss') cell.classList.add('grid-cell--miss');

      // Mode-specific classes
      if (mode === 'attack' && !result && !disabled) {
        cell.classList.add('grid-cell--targetable');
      }
      if (mode === 'placement' && !isPend && !isShip && !disabled) {
        cell.classList.add('grid-cell--placeable');
      }

      // Inner peg/marker
      const inner = document.createElement('div');
      inner.className = 'cell-inner';

      if (result === 'hit') {
        inner.innerHTML = `<div class="peg peg--hit"></div>`;
      } else if (result === 'miss') {
        inner.innerHTML = `<div class="peg peg--miss"></div>`;
      } else if (isShip || isPend) {
        inner.innerHTML = `<div class="ship-marker${isPend ? ' ship-marker--pending' : ''}"></div>`;
      }

      cell.appendChild(inner);

      if (mode === 'attack' || mode === 'placement') {
        cell.addEventListener('click', () => onCellClick({ row: r, col: c, cell }));

        if (mode === 'attack') {
          cell.addEventListener('mouseenter', () => {
            if (!cell.classList.contains('grid-cell--hit') &&
                !cell.classList.contains('grid-cell--miss')) {
              cell.classList.add('grid-cell--hover');
            }
          });
          cell.addEventListener('mouseleave', () => {
            cell.classList.remove('grid-cell--hover');
          });
        }
      }

      cells.push(cell);
      rowEl.appendChild(cell);
    }

    gridWrap.appendChild(rowEl);
  }

  container.appendChild(gridWrap);

  // ── API ────────────────────────────────────────────────
  container.updateCell = (row, col, result) => {
    const idx  = row * size + col;
    const cell = cells[idx];
    if (!cell) return;

    cell.classList.remove('grid-cell--targetable', 'grid-cell--hover');
    cell.querySelector('.cell-inner').innerHTML =
      result === 'hit'
        ? `<div class="peg peg--hit" style="animation:hitBurst 0.45s var(--ease-spring) both"></div>`
        : `<div class="peg peg--miss" style="animation:missSettle 0.35s var(--ease-spring) both"></div>`;

    cell.classList.add(result === 'hit' ? 'grid-cell--hit' : 'grid-cell--miss');
  };

  container.addPendingShip = (row, col) => {
    const idx  = row * size + col;
    const cell = cells[idx];
    if (!cell) return;
    cell.classList.remove('grid-cell--placeable');
    cell.classList.add('grid-cell--pending');
    cell.querySelector('.cell-inner').innerHTML =
      `<div class="ship-marker ship-marker--pending" style="animation:scaleIn 0.2s var(--ease-spring) both"></div>`;
  };

  container.clearPendingShip = (row, col) => {
    const idx  = row * size + col;
    const cell = cells[idx];
    if (!cell) return;
    cell.classList.remove('grid-cell--pending');
    cell.classList.add('grid-cell--placeable');
    cell.querySelector('.cell-inner').innerHTML = '';
  };

  container.setDisabled = (v) => {
    disabled = v;
    cells.forEach(c => {
      c.classList.toggle('grid-cell--disabled', v);
      if (v) {
         c.classList.remove('grid-cell--targetable');
        } else if (node === 'attack' && !c.classList.contains('grid-cell--hit') && !c.classList.contains('grid-cell--miss')) {
          c.classList.add('grid-cell--targetable');
        }
    });
  };

  return container;
}
