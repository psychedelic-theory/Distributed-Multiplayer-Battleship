// ==========================================================================
// Board — renders a battleship grid in one of three modes
// ==========================================================================
//
//   mode: 'own'        — show my ships; no interaction. Hits on me overlay.
//   mode: 'placement'  — clicking cells toggles ship placement (max 3).
//   mode: 'opponent'   — clicking cells fires if fireable=true. Only hits/misses
//                        I've made are rendered (never opponent ship positions).
//
// Props:
//   mode, gridSize, ships, hits, misses, onCellClick, fireable,
//   lastShot, ownerName, role, maxShips
//
//   ships:     [{row,col}]  — own ships or placement positions
//   hits:      [{row,col}]  — red markers
//   misses:    [{row,col}]  — grey markers
//   lastShot:  {row,col}    — highlighted outline on the most recent action
//   fireable:  boolean      — only relevant in opponent mode
// ==========================================================================

import { h } from '../../js/utils/dom.js';
import { colLetter } from '../../js/utils/format.js';

function keyOf(row, col) { return `${row},${col}`; }

function toSet(arr) {
  const s = new Set();
  if (Array.isArray(arr)) {
    for (const c of arr) if (c && typeof c.row === 'number' && typeof c.col === 'number') s.add(keyOf(c.row, c.col));
  }
  return s;
}

export function Board({
  mode = 'opponent',
  gridSize = 8,
  ships = [],
  hits = [],
  misses = [],
  onCellClick = null,
  fireable = false,
  lastShot = null,
  ownerName = '',
  role = '',
  maxShips = 3,
} = {}) {
  // In placement mode, build a map of cell-key → shipIndex for color coding.
  const shipMap = new Map();
  if (mode === 'placement') {
    for (const s of ships) {
      if (s && typeof s.row === 'number' && typeof s.col === 'number') {
        shipMap.set(keyOf(s.row, s.col), typeof s.shipIndex === 'number' ? s.shipIndex : 0);
      }
    }
  }

  const shipSet = toSet(ships);
  const hitSet = toSet(hits);
  const missSet = toSet(misses);
  const lastKey = lastShot ? keyOf(lastShot.row, lastShot.col) : null;

  // --- Header ---
  const header = h('div', { class: 'board-header' },
    h('div', { class: 'board-header__title' }, ownerName || (mode === 'opponent' ? 'Opponent' : 'You')),
    role && h('div', { class: 'board-header__role' }, role),
  );

  // --- Board wrapper classes ---
  const wrapClasses = ['board-wrap'];
  if (mode === 'opponent' && fireable) wrapClasses.push('board-wrap--fireable');
  if (mode === 'opponent' && !fireable && onCellClick) wrapClasses.push('board-wrap--dimmed');

  // --- Build the grid ---
  const cells = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const k = keyOf(r, c);
      const isShip = shipSet.has(k);
      const isHit = hitSet.has(k);
      const isMiss = missSet.has(k);
      const isLast = lastKey === k;

      const classes = ['cell'];
      let clickable = false;

      if (mode === 'placement') {
        // Placement: show placed ships with per-type colors; empty cells get dashed preview style.
        if (shipMap.has(k)) {
          const si = shipMap.get(k);
          classes.push('cell--ship', `cell--ship-${si}`);
        } else {
          classes.push('cell--placement-preview');
        }
        clickable = true;
      } else if (mode === 'own') {
        // Own board: ships visible; hits overlay in red, misses in grey.
        if (isHit && isShip) classes.push('cell--ship', 'cell--hit');
        else if (isHit) classes.push('cell--hit');
        else if (isMiss) classes.push('cell--miss');
        else if (isShip) classes.push('cell--ship');
      } else {
        // Opponent: only show my hits/misses; never reveal their ships.
        if (isHit) classes.push('cell--hit');
        else if (isMiss) classes.push('cell--miss');

        const alreadyShot = isHit || isMiss;
        if (fireable && !alreadyShot) {
          classes.push('cell--interactive');
          clickable = true;
        } else if (!fireable) {
          classes.push('cell--disabled');
        }
      }

      if (isLast) classes.push('cell--last');

      const cell = h('div', {
        class: classes.join(' '),
        attrs: {
          role: clickable ? 'button' : 'gridcell',
          'aria-label': `${colLetter(c)}${r + 1}`,
          tabindex: clickable ? '0' : '-1',
          'data-row': r,
          'data-col': c,
        },
        onClick: clickable && onCellClick ? () => onCellClick(r, c) : null,
        onKeydown: clickable && onCellClick
          ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCellClick(r, c); } }
          : null,
      });

      cells.push(cell);
    }
  }

  const boardEl = h('div', {
    class: 'board',
    style: { gridTemplateColumns: `repeat(${gridSize}, 1fr)` },
    attrs: { role: 'grid', 'aria-label': `${gridSize} by ${gridSize} board` },
  }, ...cells);

  // Placement-mode footer: unique ships placed count
  const footer = (mode === 'placement') ? (() => {
    const placedTypes = new Set(ships.map(s => s.shipIndex).filter(n => typeof n === 'number')).size;
    return h('div', { class: 'row-between', style: { marginTop: 'var(--sp-2)', fontSize: 'var(--fs-xs)', color: 'var(--color-text-mute)' } },
      h('span', {}, `${placedTypes}/3 ships placed`),
      h('span', { style: { fontFamily: 'var(--font-mono)' } }, 'click to place · R to rotate'),
    );
  })() : null;

  return h('div', { class: 'board-shell' },
    header,
    h('div', { class: wrapClasses.join(' ') }, boardEl),
    footer,
  );
}
